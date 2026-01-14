import { NormalizedLandmark, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { FaceState, CalibrationSettings } from '../types';
import {
  DEFAULT_TRIGGER_THRESHOLD,
  DEFAULT_TRIGGER_END_THRESHOLD,
  BLENDSHAPES_ALPHA,
} from './keyboard-layout';

export interface PrevFaceState {
  isTriggered: boolean;
  blendshapes?: FaceState['blendshapes'];
}

export function analyzeFace(
  result: FaceLandmarkerResult,
  settings?: CalibrationSettings | null,
  prevState?: PrevFaceState
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
  if (prevState?.blendshapes) {
    const prev = prevState.blendshapes;
    jawOpen = BLENDSHAPES_ALPHA * jawOpen + (1 - BLENDSHAPES_ALPHA) * prev.jawOpen;
    mouthPucker = BLENDSHAPES_ALPHA * mouthPucker + (1 - BLENDSHAPES_ALPHA) * prev.mouthPucker;
    mouthSmileLeft = BLENDSHAPES_ALPHA * mouthSmileLeft + (1 - BLENDSHAPES_ALPHA) * prev.mouthSmileLeft;
    mouthSmileRight = BLENDSHAPES_ALPHA * mouthSmileRight + (1 - BLENDSHAPES_ALPHA) * prev.mouthSmileRight;
    eyeBlinkLeft = BLENDSHAPES_ALPHA * eyeBlinkLeft + (1 - BLENDSHAPES_ALPHA) * prev.eyeBlinkLeft;
    eyeBlinkRight = BLENDSHAPES_ALPHA * eyeBlinkRight + (1 - BLENDSHAPES_ALPHA) * prev.eyeBlinkRight;
    browInnerUp = BLENDSHAPES_ALPHA * browInnerUp + (1 - BLENDSHAPES_ALPHA) * prev.browInnerUp;
  }

  // トリガー判定（シンプル化: jawOpen と mouthPucker のどちらかで発火）
  const startThreshold = settings?.triggerThreshold ?? DEFAULT_TRIGGER_THRESHOLD;
  const endThreshold = settings?.triggerEndThreshold ?? DEFAULT_TRIGGER_END_THRESHOLD;

  // 現在のトリガー値（どちらか大きい方）
  const triggerValue = Math.max(jawOpen, mouthPucker);

  // ヒステリシス判定
  let isTriggered = false;
  if (prevState?.isTriggered) {
    // すでにトリガー中 → 終了閾値で判定
    isTriggered = triggerValue > endThreshold;
  } else {
    // トリガーなし → 開始閾値で判定
    isTriggered = triggerValue > startThreshold;
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

/**
 * 笑顔を検出
 */
export function isSmiling(blendshapes: FaceState['blendshapes'], threshold: number): boolean {
  const avgSmile = (blendshapes.mouthSmileLeft + blendshapes.mouthSmileRight) / 2;
  return avgSmile >= threshold;
}

/**
 * 眉上げを検出
 */
export function isBrowRaised(
  blendshapes: FaceState['blendshapes'],
  baseValue: number,
  threshold: number
): boolean {
  return blendshapes.browInnerUp >= baseValue + threshold;
}
