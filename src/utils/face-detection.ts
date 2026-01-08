import { NormalizedLandmark, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { FaceState } from '../types';
import { MOUTH_OPEN_THRESHOLD } from './keyboard-layout';

export function analyzeFace(result: FaceLandmarkerResult): FaceState | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
    return null;
  }

  const landmarks = result.faceLandmarks[0];
  const mouthOpen = calculateMouthOpenness(landmarks) > MOUTH_OPEN_THRESHOLD;
  const headRotation = calculateHeadRotation(landmarks);

  return {
    landmarks,
    mouthOpen,
    headRotation,
  };
}

function calculateMouthOpenness(landmarks: NormalizedLandmark[]): number {
  // 上唇と下唇のランドマーク
  const upperLip = landmarks[13]; // Upper lip top
  const lowerLip = landmarks[14]; // Lower lip bottom

  if (!upperLip || !lowerLip) {
    return 0;
  }

  // 垂直距離を計算
  const distance = Math.abs(lowerLip.y - upperLip.y);
  return distance;
}

function calculateHeadRotation(landmarks: NormalizedLandmark[]): {
  yaw: number;
  pitch: number;
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

  return { yaw, pitch };
}
