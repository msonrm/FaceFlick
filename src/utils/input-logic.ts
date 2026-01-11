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

  // 列・行に応じたフリック閾値を設定（方向別）
  // 左右方向の閾値（列に応じて方向別に設定）
  let leftFlickThreshold: number;
  let rightFlickThreshold: number;

  if (col === 0) { // 左列
    leftFlickThreshold = keyWidth * 0.05;  // 敏感（左端なのでさらに左へ）
    rightFlickThreshold = keyWidth * 0.30; // 鈍感（中央に戻る方向は慎重に）
  } else if (col === 1) { // 中央列
    leftFlickThreshold = keyWidth * 0.24;  // 均等
    rightFlickThreshold = keyWidth * 0.24; // 均等
  } else { // 右列 (col === 2)
    leftFlickThreshold = keyWidth * 0.30;  // 鈍感（中央に戻る方向は慎重に）
    rightFlickThreshold = keyWidth * 0.05; // 敏感（右端なのでさらに右へ）
  }

  // 上下方向の閾値（行に応じて方向別に設定）
  let upFlickThreshold: number;
  let downFlickThreshold: number;

  if (row === 0) { // 最上行
    upFlickThreshold = keyHeight * 0.05;   // 敏感（最上部なのでさらに上へ）
    downFlickThreshold = keyHeight * 0.30; // 鈍感（中央に戻る方向は慎重に）
  } else if (row === 1 || row === 2) { // 中央行
    upFlickThreshold = keyHeight * 0.24;   // 均等
    downFlickThreshold = keyHeight * 0.24; // 均等
  } else { // 最下行 (row === 3)
    upFlickThreshold = keyHeight * 0.30;   // 鈍感（中央に戻る方向は慎重に）
    downFlickThreshold = keyHeight * 0.05; // 敏感（最下部なのでさらに下へ）
  }

  // ホールド位置からの相対的な移動量
  const yawOffset = yaw - holdPosition.yaw;
  const pitchOffset = pitch - holdPosition.pitch;

  const absYawOffset = Math.abs(yawOffset);
  const absPitchOffset = Math.abs(pitchOffset);

  // 各方向が閾値を超えているかチェック
  const isUpFlick = pitchOffset < 0 && absPitchOffset > upFlickThreshold;
  const isDownFlick = pitchOffset > 0 && absPitchOffset > downFlickThreshold;
  const isLeftFlick = yawOffset > 0 && absYawOffset > leftFlickThreshold; // 鏡像反転
  const isRightFlick = yawOffset < 0 && absYawOffset > rightFlickThreshold; // 鏡像反転

  // 上下と左右で最も強い方向を選択（鏡像対応）
  if ((isUpFlick || isDownFlick) && absPitchOffset > absYawOffset) {
    return pitchOffset < 0 ? 'up' : 'down';
  } else if ((isLeftFlick || isRightFlick) && absYawOffset > absPitchOffset) {
    return yawOffset < 0 ? 'right' : 'left';
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
