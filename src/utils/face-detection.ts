import { NormalizedLandmark, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { FaceState, TriggerType, CalibrationSettings } from '../types';

// デフォルト閾値（Blendshapes: 0-1）
const DEFAULT_JAW_OPEN_THRESHOLD = 0.5;
const DEFAULT_MOUTH_PUCKER_THRESHOLD = 0.4;

// 目の見開き判定（固定値）
const BROW_INNER_UP_THRESHOLD = 0.5;
const EYE_SQUINT_THRESHOLD = 0.3;

export function analyzeFace(
  result: FaceLandmarkerResult,
  settings?: CalibrationSettings
): FaceState | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  const landmarks = result.faceLandmarks[0];

  // Blendshapesを取得
  let jawOpen = 0;
  let mouthPucker = 0;
  let browInnerUp = 0;
  let eyeSquintLeft = 0;
  let eyeSquintRight = 0;
  let mouthSmileLeft = 0;
  let mouthSmileRight = 0;

  if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
    const blendshapes = result.faceBlendshapes[0].categories;

    jawOpen = blendshapes.find(b => b.categoryName === 'jawOpen')?.score ?? 0;
    mouthPucker = blendshapes.find(b => b.categoryName === 'mouthPucker')?.score ?? 0;
    browInnerUp = blendshapes.find(b => b.categoryName === 'browInnerUp')?.score ?? 0;
    eyeSquintLeft = blendshapes.find(b => b.categoryName === 'eyeSquintLeft')?.score ?? 0;
    eyeSquintRight = blendshapes.find(b => b.categoryName === 'eyeSquintRight')?.score ?? 0;
    mouthSmileLeft = blendshapes.find(b => b.categoryName === 'mouthSmileLeft')?.score ?? 0;
    mouthSmileRight = blendshapes.find(b => b.categoryName === 'mouthSmileRight')?.score ?? 0;
  }

  // 各トリガーの閾値を取得
  const jawOpenThreshold = settings?.jawOpenThreshold ?? DEFAULT_JAW_OPEN_THRESHOLD;
  const mouthPuckerThreshold = settings?.mouthPuckerThreshold ?? DEFAULT_MOUTH_PUCKER_THRESHOLD;

  // どのトリガーがアクティブか判定（優先順位あり）
  let isTriggered = false;
  let triggerType: TriggerType = null;

  if (jawOpen > jawOpenThreshold) {
    isTriggered = true;
    triggerType = 'mouth_open';
  } else if (mouthPucker > mouthPuckerThreshold) {
    isTriggered = true;
    triggerType = 'mouth_pucker';
  } else if (
    browInnerUp >= BROW_INNER_UP_THRESHOLD &&
    eyeSquintLeft <= EYE_SQUINT_THRESHOLD &&
    eyeSquintRight <= EYE_SQUINT_THRESHOLD
  ) {
    isTriggered = true;
    triggerType = 'eyes_wide';
  }

  // 頭の回転を計算
  const headRotation = calculateHeadRotation(landmarks);

  return {
    landmarks,
    blendshapes: {
      jawOpen,
      mouthPucker,
      browInnerUp,
      eyeSquintLeft,
      eyeSquintRight,
      mouthSmileLeft,
      mouthSmileRight,
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
