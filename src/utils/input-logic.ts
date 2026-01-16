import { FlickDirection, KeyPosition, CalibrationSettings, KeyboardLayout } from '../types';
import { getLayout, getKeyAt, getCharacter, isFlickKey } from './keyboard-layout';

/**
 * 顔の向きからキー位置を計算
 * 角度配分に重み付けあり：
 * - 横方向：30%, 40%, 30%
 * - 縦方向：15%, 35%, 35%, 15%
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
  const yawFlipped = 1 - yawClamped;

  // 重み付き角度配分
  // 横方向（3列）：30%, 40%, 30%
  const colWeights = [0.30, 0.40, 0.30];
  const col = getWeightedIndex(yawFlipped, colWeights, cols);

  // 縦方向（4行）：15%, 35%, 35%, 15%
  const rowWeights = [0.15, 0.35, 0.35, 0.15];
  const row = getWeightedIndex(pitchClamped, rowWeights, rows);

  return { row, col };
}

/**
 * 重み付きインデックスを計算
 * @param normalizedPos 正規化された位置 (0-1)
 * @param weights 各インデックスの重み配列
 * @param count インデックスの総数
 */
function getWeightedIndex(normalizedPos: number, weights: number[], count: number): number {
  // 重みの合計
  const totalWeight = weights.slice(0, count).reduce((sum, w) => sum + w, 0);

  // 累積境界を計算
  let cumulative = 0;
  for (let i = 0; i < count; i++) {
    const weight = weights[i] ?? 1;
    cumulative += weight / totalWeight;
    if (normalizedPos < cumulative) {
      return i;
    }
  }

  return count - 1;
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
  // 端方向は敏感（小さい閾値）、端と逆方向は鈍感（大きい閾値）で中央を選びやすく
  let leftFlickThreshold: number;
  let rightFlickThreshold: number;

  if (col === 0) { // 左列: 左は敏感、右は鈍感
    leftFlickThreshold = keyWidth * 0.05;
    rightFlickThreshold = keyWidth * 0.80;
  } else if (col === cols - 1) { // 右列: 右は敏感、左は鈍感
    leftFlickThreshold = keyWidth * 0.80;
    rightFlickThreshold = keyWidth * 0.05;
  } else { // 中央列: 両方とも中程度（2倍に増加）
    leftFlickThreshold = keyWidth * 0.70;
    rightFlickThreshold = keyWidth * 0.70;
  }

  let upFlickThreshold: number;
  let downFlickThreshold: number;

  if (row === 0) { // 最上行: 上は敏感、下は大幅に鈍感
    upFlickThreshold = keyHeight * 0.03;
    downFlickThreshold = keyHeight * 1.60;
  } else if (row === rows - 1) { // 最下行: 下は敏感、上は大幅に鈍感
    upFlickThreshold = keyHeight * 1.60;
    downFlickThreshold = keyHeight * 0.05;
  } else { // 中央行: 両方とも鈍感（中央を選びやすく）
    upFlickThreshold = keyHeight * 1.40;
    downFlickThreshold = keyHeight * 1.40;
  }

  // ホールド位置からの相対的な移動量
  const yawOffset = currentRotation.yaw - holdPosition.yaw;
  const pitchOffset = currentRotation.pitch - holdPosition.pitch;

  const absYawOffset = Math.abs(yawOffset);
  const absPitchOffset = Math.abs(pitchOffset);

  // 各方向の超過率を計算（閾値を超えた度合い）
  // 閾値を超えていない場合は0
  const upExcess = (pitchOffset < 0 && absPitchOffset > upFlickThreshold)
    ? absPitchOffset / upFlickThreshold : 0;
  const downExcess = (pitchOffset > 0 && absPitchOffset > downFlickThreshold)
    ? absPitchOffset / downFlickThreshold : 0;
  const leftExcess = (yawOffset > 0 && absYawOffset > leftFlickThreshold)  // 鏡像反転
    ? absYawOffset / leftFlickThreshold : 0;
  const rightExcess = (yawOffset < 0 && absYawOffset > rightFlickThreshold)  // 鏡像反転
    ? absYawOffset / rightFlickThreshold : 0;

  // 最も超過率が高い方向を選択
  const maxExcess = Math.max(upExcess, downExcess, leftExcess, rightExcess);

  if (maxExcess <= 1) {
    return 'center';  // どの方向も閾値を超えていない
  }

  if (upExcess === maxExcess) return 'up';
  if (downExcess === maxExcess) return 'down';
  if (leftExcess === maxExcess) return 'left';
  if (rightExcess === maxExcess) return 'right';

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
