import { FaceState, FlickDirection, FlickKey, CalibrationSettings } from '../types';
import { KEYBOARD_LAYOUT } from './keyboard-layout';

export function getSelectedKey(
  faceState: FaceState,
  settings?: CalibrationSettings
): FlickKey | null {
  const { yaw, pitch } = faceState.headRotation;

  // キャリブレーション範囲を使用（デフォルトは±30度）
  const yawRange = settings?.yawRange ?? { min: -30, max: 30 };
  const pitchRange = settings?.pitchRange ?? { min: -30, max: 30 };

  // グリッド位置を計算 (3x4 グリッド)
  let col = 1; // 中央列
  let row = 1; // 中央行（デフォルト）

  // 列の決定 (左右) - 鏡像なので左右を反転
  // yawRangeを3分割: 左 | 中央 | 右
  const yawTotal = yawRange.max - yawRange.min;
  const yawThirdWidth = yawTotal / 3;
  const yawLeftBoundary = yawRange.min + yawThirdWidth;
  const yawRightBoundary = yawRange.max - yawThirdWidth;

  if (yaw < yawLeftBoundary) {
    col = 2; // 顔を左に振る → 右列
  } else if (yaw > yawRightBoundary) {
    col = 0; // 顔を右に振る → 左列
  } else {
    col = 1; // 中央
  }

  // 行の決定 (上下)
  // pitchRangeを4分割: 上 | 中上 | 中下 | 下
  const pitchTotal = pitchRange.max - pitchRange.min;
  const pitchQuarterHeight = pitchTotal / 4;
  const pitchRow0Boundary = pitchRange.min + pitchQuarterHeight;
  const pitchRow1Boundary = pitchRange.min + pitchQuarterHeight * 2;
  const pitchRow2Boundary = pitchRange.min + pitchQuarterHeight * 3;

  if (pitch < pitchRow0Boundary) {
    row = 0; // 上
  } else if (pitch < pitchRow1Boundary) {
    row = 1; // 中央上
  } else if (pitch < pitchRow2Boundary) {
    row = 2; // 中央下
  } else {
    row = 3; // 下
  }

  const key = KEYBOARD_LAYOUT.rows[row]?.[col];
  return key || null;
}

export function getFlickDirection(
  faceState: FaceState,
  holdPosition: { yaw: number; pitch: number },
  settings?: CalibrationSettings
): FlickDirection {
  const { yaw, pitch } = faceState.headRotation;

  // キャリブレーション範囲を使用
  const yawRange = settings?.yawRange ?? { min: -30, max: 30 };
  const pitchRange = settings?.pitchRange ?? { min: -30, max: 30 };

  // フリック感度は範囲の25%（調整可能）
  const flickSensitivityRatio = settings?.flickSensitivity ? settings.flickSensitivity / 100 : 0.25;
  const yawFlickThreshold = (yawRange.max - yawRange.min) * flickSensitivityRatio;
  const pitchFlickThreshold = (pitchRange.max - pitchRange.min) * flickSensitivityRatio;

  // ホールド位置からの相対的な移動量
  const yawOffset = yaw - holdPosition.yaw;
  const pitchOffset = pitch - holdPosition.pitch;

  const absYawOffset = Math.abs(yawOffset);
  const absPitchOffset = Math.abs(pitchOffset);

  // 上下左右で最も強い方向を選択（鏡像対応）
  if (absPitchOffset > pitchFlickThreshold && absPitchOffset > absYawOffset) {
    return pitchOffset < 0 ? 'up' : 'down';
  } else if (absYawOffset > yawFlickThreshold && absYawOffset > absPitchOffset) {
    return yawOffset < 0 ? 'right' : 'left'; // 鏡像なので左右反転
  }

  return null;
}

export function getCharFromFlick(
  key: FlickKey,
  direction: FlickDirection
): string {
  if (key.base === '⌫') {
    return '⌫';
  }

  if (!direction) {
    return key.base;
  }

  const char = key[direction];
  return char || key.base;
}
