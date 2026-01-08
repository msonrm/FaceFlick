import { FaceState, FlickDirection, FlickKey } from '../types';
import {
  KEYBOARD_LAYOUT,
  GRID_SENSITIVITY,
  FLICK_SENSITIVITY,
} from './keyboard-layout';

export function getSelectedKey(faceState: FaceState): FlickKey | null {
  const { yaw, pitch } = faceState.headRotation;

  // グリッド位置を計算 (3x4 グリッド)
  let col = 1; // 中央列
  let row = 1; // 中央行

  // 列の決定 (左右)
  if (yaw < -GRID_SENSITIVITY) {
    col = 0; // 左
  } else if (yaw > GRID_SENSITIVITY) {
    col = 2; // 右
  }

  // 行の決定 (上下)
  if (pitch < -GRID_SENSITIVITY) {
    row = 0; // 上
  } else if (pitch > GRID_SENSITIVITY) {
    row = 2; // 下
  } else if (Math.abs(pitch) < GRID_SENSITIVITY / 2) {
    row = 1; // 中央
  } else if (pitch > 0) {
    row = 2; // やや下
  }

  // 4行目は特別処理
  if (pitch > GRID_SENSITIVITY * 2) {
    row = 3;
  }

  const key = KEYBOARD_LAYOUT.rows[row]?.[col];
  return key || null;
}

export function getFlickDirection(faceState: FaceState): FlickDirection {
  const { yaw, pitch } = faceState.headRotation;

  // フリック方向の判定（閾値を超えた方向を優先）
  const absYaw = Math.abs(yaw);
  const absPitch = Math.abs(pitch);

  // 上下左右で最も強い方向を選択
  if (absPitch > FLICK_SENSITIVITY && absPitch > absYaw) {
    return pitch < 0 ? 'up' : 'down';
  } else if (absYaw > FLICK_SENSITIVITY && absYaw > absPitch) {
    return yaw < 0 ? 'left' : 'right';
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
