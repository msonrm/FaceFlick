import { VRM } from '@pixiv/three-vrm';
import { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';

/**
 * 顔の位置情報（正規化座標 0-1）
 */
export interface FacePosition {
  x: number; // 0=左端, 1=右端
  y: number; // 0=上端, 1=下端
  scale: number; // 顔の大きさ（0-1の範囲で正規化）
}

/**
 * キャリブレーションオフセット（ラジアン）
 */
export interface CalibrationOffset {
  pitch: number; // 上下
  yaw: number;   // 左右
}

/**
 * MediaPipeのランドマークから顔の位置を抽出する
 */
export function getFacePosition(result: FaceLandmarkerResult): FacePosition | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  const landmarks = result.faceLandmarks[0];

  // 鼻先（landmark 1）を顔の中心として使用
  const noseTip = landmarks[1];

  // 顔の大きさを推定（左右の頬の距離）
  // landmark 234: 右頬, landmark 454: 左頬
  const rightCheek = landmarks[234];
  const leftCheek = landmarks[454];
  const faceWidth = Math.abs(leftCheek.x - rightCheek.x);

  return {
    x: noseTip.x,
    y: noseTip.y,
    scale: faceWidth,
  };
}

/**
 * MediaPipeの顔検出結果をVRMモデルに適用する
 * @param vrm VRMモデル
 * @param result MediaPipeの検出結果
 * @param calibrationOffset キャリブレーション時の頭部角度（この角度を正面とする）
 */
export function applyMediaPipeToVRM(
  vrm: VRM,
  result: FaceLandmarkerResult,
  calibrationOffset?: CalibrationOffset
): void {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return;
  }

  const landmarks = result.faceLandmarks[0];

  // Kalidokitで顔の姿勢・表情を計算
  const riggedFace = Kalidokit.Face.solve(landmarks, {
    runtime: 'mediapipe',
    video: null as any, // ビデオ要素は不要（ランドマークのみ使用）
  });

  if (!riggedFace) {
    return;
  }

  // 1. 頭部の回転を適用（キャリブレーションオフセット考慮）
  applyHeadRotation(vrm, riggedFace, calibrationOffset);

  // 2. 目の動きを適用
  applyEyeRotation(vrm, riggedFace);

  // 3. 表情（Blendshapes）を適用
  applyBlendshapes(vrm, result);
}

/**
 * 頭部の回転をVRMに適用
 */
function applyHeadRotation(vrm: VRM, riggedFace: any, calibrationOffset?: CalibrationOffset): void {
  if (!riggedFace.head || !vrm.humanoid) {
    return;
  }

  const headBone = vrm.humanoid.getNormalizedBoneNode('head');
  if (!headBone) {
    return;
  }

  // Kalidokitの頭部回転（Euler angles）を適用
  // キャリブレーションオフセットがある場合は差分を適用（オフセット位置が正面になる）
  let pitch = -riggedFace.head.x; // 上下（符号反転）
  let yaw = riggedFace.head.y;    // 左右
  const roll = riggedFace.head.z; // 傾き

  if (calibrationOffset) {
    // キャリブレーション時の角度を基準（0）とする
    pitch = pitch - calibrationOffset.pitch;
    yaw = yaw - calibrationOffset.yaw;
  }

  headBone.rotation.set(
    pitch * 0.6, // Pitch - やや抑える
    yaw * 0.6,   // Yaw - やや抑える
    roll * 0.4   // Roll - さらに抑える
  );
}

/**
 * 目の動きをVRMに適用
 * VRM 1.0ではlookAtを使用（虹彩・瞳孔が正しく動く）
 * ボーン直接回転はlookAtと競合するため使用しない
 */
function applyEyeRotation(vrm: VRM, riggedFace: any): void {
  if (!riggedFace.eye) {
    return;
  }

  // VRM lookAt が利用可能な場合のみ目の動きを適用
  // 直接ボーン回転はblinkと競合するので使用しない
  if (vrm.lookAt && vrm.lookAt.applier) {
    // Kalidokitの目の回転をlookAt用の角度に変換
    // 左右の目の平均を使用
    const avgX = ((riggedFace.eye.l?.x ?? 0) + (riggedFace.eye.r?.x ?? 0)) / 2;
    const avgY = ((riggedFace.eye.l?.y ?? 0) + (riggedFace.eye.r?.y ?? 0)) / 2;

    // ラジアンから度に変換
    const pitchDeg = avgX * (180 / Math.PI) * 1.5; // 感度調整
    const yawDeg = avgY * (180 / Math.PI) * 1.5;

    // lookAtのターゲットを設定
    vrm.lookAt.applier.applyYawPitch(yawDeg, pitchDeg);
  }
}

// 表情一覧のログ出力フラグ
let expressionsLogged = false;

/**
 * MediaPipeのBlendshapesをVRMの表情に適用
 */
function applyBlendshapes(vrm: VRM, result: FaceLandmarkerResult): void {
  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
    return;
  }

  const expressionManager = vrm.expressionManager;
  if (!expressionManager) {
    return;
  }

  const blendshapes = result.faceBlendshapes[0].categories;

  // browInnerUpの値を取得（眉上げ用）
  const browInnerUp = blendshapes.find(b => b.categoryName === 'browInnerUp')?.score ?? 0;

  // MediaPipe Blendshapes → VRM Expression のマッピング
  // VRM標準表情: happy, angry, sad, relaxed, surprised, aa, ih, ou, ee, oh, blink, blinkLeft, blinkRight, lookUp, lookDown, lookLeft, lookRight
  const expressionMap: Record<string, { vrmExpression: string; weight: number }> = {
    // 口の動き
    'jawOpen': { vrmExpression: 'aa', weight: 1.0 },           // あ
    'mouthPucker': { vrmExpression: 'ou', weight: 1.2 },       // お・う
    'mouthFunnel': { vrmExpression: 'oh', weight: 1.0 },       // お

    // 笑顔
    'mouthSmileLeft': { vrmExpression: 'happy', weight: 0.5 },
    'mouthSmileRight': { vrmExpression: 'happy', weight: 0.5 },

    // 瞬き
    'eyeBlinkLeft': { vrmExpression: 'blinkLeft', weight: 1.0 },
    'eyeBlinkRight': { vrmExpression: 'blinkRight', weight: 1.0 },

    // その他の母音
    'mouthClose': { vrmExpression: 'ee', weight: 0.8 },        // い
  };

  // 現在の表情値をリセット
  expressionManager.resetValues();

  // Blendshapesを適用
  for (const blendshape of blendshapes) {
    const mapping = expressionMap[blendshape.categoryName];

    if (mapping && blendshape.score > 0.01) {
      const currentValue = expressionManager.getValue(mapping.vrmExpression) || 0;
      const newValue = Math.min(1.0, currentValue + blendshape.score * mapping.weight);

      expressionManager.setValue(mapping.vrmExpression, newValue);
    }
  }

  // 眉毛の直接制御を試行
  // VRoid Studio製モデルの眉毛表情名を含む
  const customBrowExpressions = [
    // VRoid Studio の眉毛表情
    'Fcl_BRW_Surprised',  // VRoid: 驚き眉（上がる）
    'Fcl_BRW_Fun',        // VRoid: 楽しい眉
    // 一般的なカスタム表情名
    'browUp', 'browRaise', 'Brows_Up', 'brow_up',
    'eyebrowUp', 'EyebrowUp',
  ];

  for (const browExpr of customBrowExpressions) {
    const expr = expressionManager.getExpression(browExpr);
    if (expr) {
      expressionManager.setValue(browExpr, browInnerUp * 1.5);
      break;
    }
  }

  // 利用可能な表情一覧をログ出力（デバッグ用、初回のみ）
  if (!expressionsLogged) {
    expressionsLogged = true;
    const expressions = expressionManager.expressions;
    if (expressions) {
      console.log('Available VRM expressions:', expressions.map(e => e.expressionName));
    }
  }

  // 表情を更新
  expressionManager.update();

  // 眉毛ボーンを直接操作（モデルによってはボーンがある）
  applyEyebrowBones(vrm, browInnerUp);
}

/**
 * 眉毛ボーンを直接操作（モデルに眉毛ボーンがある場合）
 */
function applyEyebrowBones(vrm: VRM, browInnerUp: number): void {
  // 眉毛ボーンの候補名
  const leftBrowNames = ['LeftEyebrow', 'Eyebrow_L', 'J_Brow_L', 'eyebrow_L', 'brow_L'];
  const rightBrowNames = ['RightEyebrow', 'Eyebrow_R', 'J_Brow_R', 'eyebrow_R', 'brow_R'];

  // VRMシーンから眉毛ボーンを探す
  const findBone = (names: string[]) => {
    for (const name of names) {
      const bone = vrm.scene.getObjectByName(name);
      if (bone) return bone;
    }
    return null;
  };

  const leftBrow = findBone(leftBrowNames);
  const rightBrow = findBone(rightBrowNames);

  // 眉毛ボーンがあれば回転させる（上げる）
  const browRotation = browInnerUp * 0.15; // 最大約8.6度

  if (leftBrow) {
    leftBrow.rotation.z = -browRotation; // 左眉は反対方向
  }
  if (rightBrow) {
    rightBrow.rotation.z = browRotation;
  }
}
