import { NormalizedLandmark, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { FaceState, TriggerType, CalibrationSettings } from '../types';

// デフォルト閾値（Blendshapes: 0-1）
const DEFAULT_JAW_OPEN_THRESHOLD = 0.5;
const DEFAULT_MOUTH_PUCKER_THRESHOLD = 0.4;

export function analyzeFace(
  result: FaceLandmarkerResult,
  settings?: CalibrationSettings,
  prevTriggerState?: { isTriggered: boolean; triggerType?: TriggerType },
  prevBlendshapes?: {
    jawOpen: number;
    mouthPucker: number;
    mouthSmileLeft: number;
    mouthSmileRight: number;
    eyeBlinkLeft: number;
    eyeBlinkRight: number;
    browInnerUp: number;
  }
): FaceState | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  const landmarks = result.faceLandmarks[0];

  // Blendshapesを取得
  let jawOpen = 0;
  let mouthPucker = 0;
  let mouthSmileLeft = 0;
  let mouthSmileRight = 0;
  let eyeBlinkLeft = 0;
  let eyeBlinkRight = 0;
  let browInnerUp = 0;

  if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
    const blendshapes = result.faceBlendshapes[0].categories;

    jawOpen = blendshapes.find(b => b.categoryName === 'jawOpen')?.score ?? 0;
    mouthPucker = blendshapes.find(b => b.categoryName === 'mouthPucker')?.score ?? 0;
    mouthSmileLeft = blendshapes.find(b => b.categoryName === 'mouthSmileLeft')?.score ?? 0;
    mouthSmileRight = blendshapes.find(b => b.categoryName === 'mouthSmileRight')?.score ?? 0;
    eyeBlinkLeft = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score ?? 0;
    eyeBlinkRight = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score ?? 0;
    browInnerUp = blendshapes.find(b => b.categoryName === 'browInnerUp')?.score ?? 0;
  }

  // Blendshapesに平滑化を適用（EMA: 指数移動平均）
  const alphaBlendshapes = 0.7; // 口の動きは速いので、頭の回転より高めに設定
  if (prevBlendshapes) {
    jawOpen = alphaBlendshapes * jawOpen + (1 - alphaBlendshapes) * prevBlendshapes.jawOpen;
    mouthPucker = alphaBlendshapes * mouthPucker + (1 - alphaBlendshapes) * prevBlendshapes.mouthPucker;
    mouthSmileLeft = alphaBlendshapes * mouthSmileLeft + (1 - alphaBlendshapes) * prevBlendshapes.mouthSmileLeft;
    mouthSmileRight = alphaBlendshapes * mouthSmileRight + (1 - alphaBlendshapes) * prevBlendshapes.mouthSmileRight;
    eyeBlinkLeft = alphaBlendshapes * eyeBlinkLeft + (1 - alphaBlendshapes) * prevBlendshapes.eyeBlinkLeft;
    eyeBlinkRight = alphaBlendshapes * eyeBlinkRight + (1 - alphaBlendshapes) * prevBlendshapes.eyeBlinkRight;
    browInnerUp = alphaBlendshapes * browInnerUp + (1 - alphaBlendshapes) * prevBlendshapes.browInnerUp;
  }

  // 開始閾値と終了閾値を取得
  const jawOpenStartThreshold = settings?.jawOpenThreshold ?? DEFAULT_JAW_OPEN_THRESHOLD;
  const mouthPuckerStartThreshold = settings?.mouthPuckerThreshold ?? DEFAULT_MOUTH_PUCKER_THRESHOLD;

  // 終了閾値（デフォルトは0.2）
  const jawOpenEndThreshold = settings?.jawOpenEndThreshold ?? 0.2;
  const mouthPuckerEndThreshold = settings?.mouthPuckerEndThreshold ?? 0.2;

  // ヒステリシス判定：前回のトリガー状態に応じて異なる閾値を使用
  let isTriggered = false;
  let triggerType: TriggerType = null;

  if (prevTriggerState?.isTriggered) {
    // すでにトリガー中 → 終了閾値で判定
    if (jawOpen > jawOpenEndThreshold) {
      isTriggered = true;
      triggerType = 'mouth_open';
    } else if (mouthPucker > mouthPuckerEndThreshold) {
      isTriggered = true;
      triggerType = 'mouth_pucker';
    }
  } else {
    // トリガーなし → 開始閾値で判定
    if (jawOpen > jawOpenStartThreshold) {
      isTriggered = true;
      triggerType = 'mouth_open';
    } else if (mouthPucker > mouthPuckerStartThreshold) {
      isTriggered = true;
      triggerType = 'mouth_pucker';
    }
  }

  // 頭の回転を計算
  const headRotation = calculateHeadRotation(landmarks);

  return {
    landmarks,
    blendshapes: {
      jawOpen,
      mouthPucker,
      mouthSmileLeft,
      mouthSmileRight,
      eyeBlinkLeft,
      eyeBlinkRight,
      browInnerUp,
    },
    isTriggered,
    triggerType,
    headRotation,
  };
}

/**
 * 頭の回転を計算
 */
function calculateHeadRotation(landmarks: NormalizedLandmark[]): {
  yaw: number;
  pitch: number;
  roll: number;
} {
  // 鼻の先端
  const noseTip = landmarks[1];
  // 顔の中心（両目の中間）
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const faceCenter = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
    z: (leftEye.z + rightEye.z) / 2,
  };

  // Yaw (左右の回転): 鼻が顔の中心からどれだけ左右にずれているか
  const yawOffset = noseTip.x - faceCenter.x;
  const yaw = yawOffset * 180; // -180 to 180 度に変換

  // Pitch (上下の回転): 鼻が顔の中心からどれだけ上下にずれているか
  const pitchOffset = noseTip.y - faceCenter.y;
  const pitch = pitchOffset * 90; // -90 to 90 度に変換

  // Roll (傾き): 両目の高さの差から計算
  const eyeHeightDiff = rightEye.y - leftEye.y;
  const eyeWidth = Math.abs(rightEye.x - leftEye.x);
  const rollAngle = eyeWidth > 0 ? Math.atan2(eyeHeightDiff, eyeWidth) : 0;
  const roll = rollAngle * (180 / Math.PI); // ラジアンから度に変換

  return { yaw, pitch, roll };
}
