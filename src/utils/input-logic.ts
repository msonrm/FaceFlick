import { FaceState, FlickDirection, FlickKey, CalibrationSettings } from '../types';
import { KEYBOARD_LAYOUT } from './keyboard-layout';

export function getSelectedKey(
  faceState: FaceState,
  settings?: CalibrationSettings
): FlickKey | null {
  const { yaw, pitch } = faceState.headRotation;
  const gridSensitivity = settings?.gridSensitivity ?? 15;

  // グリッド位置を計算 (3x4 グリッド)
  let col = 1; // 中央列
  let row = 1; // 中央行

  // 列の決定 (左右) - 鏡像なので左右を反転
  if (yaw < -gridSensitivity) {
    col = 2; // 顔を左に振る → 右列
  } else if (yaw > gridSensitivity) {
    col = 0; // 顔を右に振る → 左列
  }

  // 行の決定 (上下)
  // 4行グリッドなので、範囲を適切に分割
  if (pitch < -gridSensitivity * 1.5) {
    row = 0; // 上（最上部）
  } else if (pitch < -gridSensitivity / 2) {
    row = 0; // 上
  } else if (pitch < gridSensitivity / 2) {
    row = 1; // 中央上
  } else if (pitch < gridSensitivity * 1.5) {
    row = 2; // 中央下
  } else {
    row = 3; // 下（最下部）
  }

  const key = KEYBOARD_LAYOUT.rows[row]?.[col];
  return key || null;
}

export function getFlickDirection(
  faceState: FaceState,
  settings?: CalibrationSettings
): FlickDirection {
  const { yaw, pitch } = faceState.headRotation;
  const flickSensitivity = settings?.flickSensitivity ?? 20;

  // フリック方向の判定（閾値を超えた方向を優先）
  const absYaw = Math.abs(yaw);
  const absPitch = Math.abs(pitch);

  // 上下左右で最も強い方向を選択（鏡像対応）
  if (absPitch > flickSensitivity && absPitch > absYaw) {
    return pitch < 0 ? 'up' : 'down';
  } else if (absYaw > flickSensitivity && absYaw > absPitch) {
    return yaw < 0 ? 'right' : 'left'; // 鏡像なので左右反転
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
