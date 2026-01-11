import { FaceState, FlickDirection, FlickKey, CalibrationSettings } from '../types';
import { KEYBOARD_LAYOUT } from './keyboard-layout';

export function getSelectedKey(
  faceState: FaceState,
  settings?: CalibrationSettings,
  fixedPosition?: { yaw: number; pitch: number }
): FlickKey | null {
  // fixedPositionがある場合はそれを使用、なければ現在位置
  const yaw = fixedPosition ? fixedPosition.yaw : faceState.headRotation.yaw;
  const pitch = fixedPosition ? fixedPosition.pitch : faceState.headRotation.pitch;

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

  // キー幅・キー高さを計算
  const yawTotal = yawRange.max - yawRange.min;
  const pitchTotal = pitchRange.max - pitchRange.min;
  const keyWidth = yawTotal / 3;
  const keyHeight = pitchTotal / 4;

  // holdPositionからキーの列・行を判定
  const yawThirdWidth = keyWidth;
  const yawLeftBoundary = yawRange.min + yawThirdWidth;
  const yawRightBoundary = yawRange.max - yawThirdWidth;

  let col = 1; // 中央列
  if (holdPosition.yaw < yawLeftBoundary) {
    col = 2; // 右列
  } else if (holdPosition.yaw > yawRightBoundary) {
    col = 0; // 左列
  }

  const pitchQuarterHeight = keyHeight;
  const pitchRow0Boundary = pitchRange.min + pitchQuarterHeight;
  const pitchRow1Boundary = pitchRange.min + pitchQuarterHeight * 2;
  const pitchRow2Boundary = pitchRange.min + pitchQuarterHeight * 3;

  let row = 1; // デフォルト
  if (holdPosition.pitch < pitchRow0Boundary) {
    row = 0; // 上
  } else if (holdPosition.pitch < pitchRow1Boundary) {
    row = 1; // 中上
  } else if (holdPosition.pitch < pitchRow2Boundary) {
    row = 2; // 中下
  } else {
    row = 3; // 下
  }

  // 列・行に応じたフリック閾値を設定
  // 左右：中央列15%、左右列5%
  const yawFlickThreshold = col === 1 ? keyWidth * 0.15 : keyWidth * 0.05;
  // 上下：中央行（1,2）15%、端行（0,3）10%
  const pitchFlickThreshold = (row === 1 || row === 2) ? keyHeight * 0.15 : keyHeight * 0.10;

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
