import { NormalizedLandmark, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { FaceState, TriggerType, CalibrationSettings } from '../types';

// デフォルト閾値
const DEFAULT_MOUTH_OPEN_THRESHOLD = 0.5;
const DEFAULT_MOUTH_PUCKER_THRESHOLD = 0.3;
const DEFAULT_EAR_THRESHOLD = 0.2;

export function analyzeFace(
  result: FaceLandmarkerResult,
  settings?: CalibrationSettings
): FaceState | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  const landmarks = result.faceLandmarks[0];

  // EAR（Eye Aspect Ratio）を計算
  const ear = calculateEAR(landmarks);

  // MAR（Mouth Aspect Ratio）を計算
  const mar = calculateMAR(landmarks);

  // 口をすぼめる度合いを計算
  const mouthPucker = calculateMouthPucker(landmarks);

  // 各トリガーの検出（設定された閾値を使用）
  const mouthOpenThreshold = settings?.mouthOpenThreshold ?? DEFAULT_MOUTH_OPEN_THRESHOLD;
  const mouthPuckerThreshold = settings?.mouthPuckerThreshold ?? DEFAULT_MOUTH_PUCKER_THRESHOLD;
  const earThreshold = settings?.earThreshold ?? DEFAULT_EAR_THRESHOLD;

  const mouthOpen = mar > mouthOpenThreshold;
  const mouthPuckered = mouthPucker > mouthPuckerThreshold;
  const winkLeft = ear.left < earThreshold && ear.right > earThreshold;
  const winkRight = ear.right < earThreshold && ear.left > earThreshold;
  const bothEyesClosed = ear.left < earThreshold && ear.right < earThreshold;

  // どのトリガーがアクティブか判定（優先順位あり）
  let isTriggered = false;
  let triggerType: TriggerType = null;

  if (mouthOpen) {
    isTriggered = true;
    triggerType = 'mouth_open';
  } else if (mouthPuckered) {
    isTriggered = true;
    triggerType = 'mouth_pucker';
  } else if (winkLeft) {
    isTriggered = true;
    triggerType = 'wink_left';
  } else if (winkRight) {
    isTriggered = true;
    triggerType = 'wink_right';
  }

  // 頭の回転を計算
  const headRotation = calculateHeadRotation(landmarks);

  return {
    landmarks,
    ear,
    mar,
    mouthPucker,
    mouthOpen,
    mouthPuckered,
    winkLeft,
    winkRight,
    bothEyesClosed,
    isTriggered,
    triggerType,
    headRotation,
  };
}

/**
 * EAR（Eye Aspect Ratio）を計算
 * 目の開閉度を測定。値が小さいほど目が閉じている
 * 通常: 0.2-0.3以上、閉じている: 0.2以下
 */
function calculateEAR(landmarks: NormalizedLandmark[]): {
  left: number;
  right: number;
} {
  // 左目のランドマーク
  const leftEyeOuter = landmarks[33]; // 左目外側
  const leftEyeInner = landmarks[133]; // 左目内側
  const leftEyeTop1 = landmarks[159]; // 左目上部1
  const leftEyeBottom1 = landmarks[145]; // 左目下部1
  const leftEyeTop2 = landmarks[158]; // 左目上部2
  const leftEyeBottom2 = landmarks[153]; // 左目下部2

  // 右目のランドマーク
  const rightEyeOuter = landmarks[362]; // 右目外側
  const rightEyeInner = landmarks[263]; // 右目内側
  const rightEyeTop1 = landmarks[386]; // 右目上部1
  const rightEyeBottom1 = landmarks[374]; // 右目下部1
  const rightEyeTop2 = landmarks[385]; // 右目上部2
  const rightEyeBottom2 = landmarks[380]; // 右目下部2

  // 左目のEARを計算
  const leftVertical1 = distance(leftEyeTop1, leftEyeBottom1);
  const leftVertical2 = distance(leftEyeTop2, leftEyeBottom2);
  const leftHorizontal = distance(leftEyeOuter, leftEyeInner);
  const leftEAR = (leftVertical1 + leftVertical2) / (2.0 * leftHorizontal);

  // 右目のEARを計算
  const rightVertical1 = distance(rightEyeTop1, rightEyeBottom1);
  const rightVertical2 = distance(rightEyeTop2, rightEyeBottom2);
  const rightHorizontal = distance(rightEyeOuter, rightEyeInner);
  const rightEAR = (rightVertical1 + rightVertical2) / (2.0 * rightHorizontal);

  return {
    left: leftEAR,
    right: rightEAR,
  };
}

/**
 * MAR（Mouth Aspect Ratio）を計算
 * 口の開き具合を測定。値が大きいほど口が開いている
 */
function calculateMAR(landmarks: NormalizedLandmark[]): number {
  // 口のランドマーク
  const upperLip = landmarks[13]; // 上唇上部
  const lowerLip = landmarks[14]; // 下唇下部
  const leftMouth = landmarks[61]; // 左口角
  const rightMouth = landmarks[291]; // 右口角

  // 垂直距離（口の開き）
  const vertical = distance(upperLip, lowerLip);
  // 水平距離（口の幅）
  const horizontal = distance(leftMouth, rightMouth);

  // MAR = 垂直距離 / 水平距離
  return horizontal > 0 ? vertical / horizontal : 0;
}

/**
 * 口をすぼめる度合いを計算（キス顔検出）
 * 口角間の距離が短くなることに着目
 */
function calculateMouthPucker(landmarks: NormalizedLandmark[]): number {
  const leftMouth = landmarks[61]; // 左口角
  const rightMouth = landmarks[291]; // 右口角

  // 顔の基準サイズ（目と目の距離）
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const eyeDistance = distance(leftEye, rightEye);

  if (eyeDistance === 0) return 0;

  // 口角間の距離（すぼめると短くなる）
  const mouthWidth = distance(leftMouth, rightMouth);

  // 正規化された口の幅
  // 通常は0.45〜0.55、すぼめると0.25〜0.35
  const normalizedMouthWidth = mouthWidth / eyeDistance;

  // すぼめ度合いの計算（シンプルに口の幅だけで判定）
  // normalizedMouthWidth が 0.48 以下でキス顔と判定（感度向上）
  // 0.48 → 0, 0.40 → 0.48, 0.30 → 1.08 (clampで1.0)
  const puckerScore = Math.max(0, (0.48 - normalizedMouthWidth) * 6.0);

  return Math.max(0, Math.min(1, puckerScore));
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
 * 2つのランドマーク間の距離を計算
 */
function distance(p1: NormalizedLandmark, p2: NormalizedLandmark): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  const dz = (p1.z || 0) - (p2.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
