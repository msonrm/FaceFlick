import { VRM } from '@pixiv/three-vrm';
import { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import * as Kalidokit from 'kalidokit';

/**
 * MediaPipeの顔検出結果をVRMモデルに適用する
 */
export function applyMediaPipeToVRM(
  vrm: VRM,
  result: FaceLandmarkerResult
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

  // 1. 頭部の回転を適用
  applyHeadRotation(vrm, riggedFace);

  // 2. 目の動きを適用
  applyEyeRotation(vrm, riggedFace);

  // 3. 表情（Blendshapes）を適用
  applyBlendshapes(vrm, result);
}

/**
 * 頭部の回転をVRMに適用
 */
function applyHeadRotation(vrm: VRM, riggedFace: any): void {
  if (!riggedFace.head || !vrm.humanoid) {
    return;
  }

  const headBone = vrm.humanoid.getNormalizedBoneNode('head');
  if (!headBone) {
    return;
  }

  // Kalidokitの頭部回転（Euler angles）を適用
  // Kalidokitの出力はラジアンで、座標系がVRMと異なる場合があるため調整
  headBone.rotation.set(
    riggedFace.head.x * 0.8, // Pitch（上下）- やや抑える
    riggedFace.head.y * 0.8, // Yaw（左右）- やや抑える
    riggedFace.head.z * 0.5  // Roll（傾き）- さらに抑える
  );
}

/**
 * 目の動きをVRMに適用
 */
function applyEyeRotation(vrm: VRM, riggedFace: any): void {
  if (!riggedFace.eye || !vrm.humanoid) {
    return;
  }

  const leftEyeBone = vrm.humanoid.getNormalizedBoneNode('leftEye');
  const rightEyeBone = vrm.humanoid.getNormalizedBoneNode('rightEye');

  if (leftEyeBone && riggedFace.eye.l) {
    leftEyeBone.rotation.set(
      riggedFace.eye.l.x,
      riggedFace.eye.l.y,
      0
    );
  }

  if (rightEyeBone && riggedFace.eye.r) {
    rightEyeBone.rotation.set(
      riggedFace.eye.r.x,
      riggedFace.eye.r.y,
      0
    );
  }
}

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

    // 驚き
    'browInnerUp': { vrmExpression: 'surprised', weight: 0.8 },
    'eyeWideLeft': { vrmExpression: 'surprised', weight: 0.5 },
    'eyeWideRight': { vrmExpression: 'surprised', weight: 0.5 },

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

  // 表情を更新
  expressionManager.update();
}
