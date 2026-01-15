import { FlickDirection, KeyPosition, CalibrationSettings, KeyboardLayout } from '../types';
import { getLayout, getKeyAt, getCharacter, isFlickKey } from './keyboard-layout';

/**
 * 顔の向きからキー位置を計算
 */
export function getSelectedKeyPosition(
  headRotation: { yaw: number; pitch: number },
  layout: KeyboardLayout,
  settings?: CalibrationSettings | null
): KeyPosition {
  const { yaw, pitch } = headRotation;
  const { rows, cols } = layout.gridSize;

  // キャリブレーション範囲を使用（デフォルトは±30度）
  const yawRange = settings?.yawRange ?? { min: -30, max: 30 };
  const pitchRange = settings?.pitchRange ?? { min: -30, max: 30 };

  // 範囲を正規化 (0-1)
  const yawNorm = (yaw - yawRange.min) / (yawRange.max - yawRange.min);
  const pitchNorm = (pitch - pitchRange.min) / (pitchRange.max - pitchRange.min);

  // クランプ
  const yawClamped = Math.max(0, Math.min(1, yawNorm));
  const pitchClamped = Math.max(0, Math.min(1, pitchNorm));

  // 鏡像反転: 顔を左に振る → 右列を選択
  const col = Math.min(cols - 1, Math.floor((1 - yawClamped) * cols));
  const row = Math.min(rows - 1, Math.floor(pitchClamped * rows));

  return { row, col };
}

/**
 * フリック方向を検出
 */
export function getFlickDirection(
  currentRotation: { yaw: number; pitch: number },
  holdPosition: { yaw: number; pitch: number },
  selectedKey: KeyPosition,
  layout: KeyboardLayout,
  settings?: CalibrationSettings | null
): FlickDirection {
  // タップモードではフリックなし
  if (layout.type === 'tap') {
    return 'center';
  }

  const { rows, cols } = layout.gridSize;

  // キャリブレーション範囲を使用
  const yawRange = settings?.yawRange ?? { min: -30, max: 30 };
  const pitchRange = settings?.pitchRange ?? { min: -30, max: 30 };

  // キー幅・キー高さを計算
  const yawTotal = yawRange.max - yawRange.min;
  const pitchTotal = pitchRange.max - pitchRange.min;
  const keyWidth = yawTotal / cols;
  const keyHeight = pitchTotal / rows;

  const { row, col } = selectedKey;

  // 列・行に応じたフリック閾値を設定（方向別・エッジ補正）
  let leftFlickThreshold: number;
  let rightFlickThreshold: number;

  if (col === 0) { // 左列
    leftFlickThreshold = keyWidth * 0.05;
    rightFlickThreshold = keyWidth * 0.40;
  } else if (col === cols - 1) { // 右列
    leftFlickThreshold = keyWidth * 0.40;
    rightFlickThreshold = keyWidth * 0.05;
  } else { // 中央列
    leftFlickThreshold = keyWidth * 0.35;
    rightFlickThreshold = keyWidth * 0.35;
  }

  let upFlickThreshold: number;
  let downFlickThreshold: number;

  if (row === 0) { // 最上行
    upFlickThreshold = keyHeight * 0.03;
    downFlickThreshold = keyHeight * 0.40;
  } else if (row === rows - 1) { // 最下行
    upFlickThreshold = keyHeight * 0.40;
    downFlickThreshold = keyHeight * 0.05;
  } else { // 中央行
    upFlickThreshold = keyHeight * 0.35;
    downFlickThreshold = keyHeight * 0.35;
  }

  // ホールド位置からの相対的な移動量
  const yawOffset = currentRotation.yaw - holdPosition.yaw;
  const pitchOffset = currentRotation.pitch - holdPosition.pitch;

  const absYawOffset = Math.abs(yawOffset);
  const absPitchOffset = Math.abs(pitchOffset);

  // 各方向が閾値を超えているかチェック
  const isUpFlick = pitchOffset < 0 && absPitchOffset > upFlickThreshold;
  const isDownFlick = pitchOffset > 0 && absPitchOffset > downFlickThreshold;
  const isLeftFlick = yawOffset > 0 && absYawOffset > leftFlickThreshold; // 鏡像反転
  const isRightFlick = yawOffset < 0 && absYawOffset > rightFlickThreshold; // 鏡像反転

  // 上下と左右で最も強い方向を選択
  if ((isUpFlick || isDownFlick) && absPitchOffset > absYawOffset) {
    return pitchOffset < 0 ? 'up' : 'down';
  } else if ((isLeftFlick || isRightFlick) && absYawOffset > absPitchOffset) {
    return yawOffset < 0 ? 'right' : 'left';
  }

  return 'center';
}

/**
 * キー位置とフリック方向から文字を取得
 */
export function getCharFromPosition(
  position: KeyPosition,
  direction: FlickDirection,
  layoutId: string
): { char: string | null; isModifier: boolean; isSpecial: boolean } {
  const layout = getLayout(layoutId);
  const key = getKeyAt(layout, position);

  if (!key) {
    return { char: null, isModifier: false, isSpecial: false };
  }

  const isModifier = key.isModifier ?? false;
  const isSpecial = key.isSpecial ?? false;

  if (isModifier) {
    return { char: null, isModifier: true, isSpecial };
  }

  const char = getCharacter(key, direction);
  return { char, isModifier, isSpecial };
}

/**
 * デバッグ用: キー位置を文字列で取得
 */
export function getKeyLabel(position: KeyPosition, layoutId: string): string {
  const layout = getLayout(layoutId);
  const key = getKeyAt(layout, position);
  if (!key) return '';
  return isFlickKey(key) ? key.base : key.char;
}
