import { KEYBOARD_LAYOUT } from '../keyboard-layout';
import { getSelectedKey } from '../input-logic';
import { FlickKey, InputState, FaceState, CalibrationSettings } from '../../types';

export interface DrawKeyboardOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  toolbarHeight: number;
  textInputHeight: number;
  triggerGestureHeight: number;
  flickFeedbackHeight: number;
  inputState: InputState;
  smoothedFaceState: FaceState | null;
  calibrationSettings: CalibrationSettings;
  isFaceDetected: boolean;
  // ジェスチャー認識中の状態（「や」キー用）
  isSmileRecognizing: boolean;
  isBrowRaiseRecognizing: boolean;
}

/**
 * キーボードを描画する
 */
export function drawKeyboard(options: DrawKeyboardOptions): void {
  const {
    ctx,
    width,
    toolbarHeight,
    textInputHeight,
    triggerGestureHeight,
    flickFeedbackHeight,
    inputState,
    smoothedFaceState,
    calibrationSettings,
    isFaceDetected,
    isSmileRecognizing,
    isBrowRaiseRecognizing,
  } = options;

  const keyWidth = width / 3;
  const keyHeight = keyWidth * 0.75;

  // 余白なしでキーボードを上に詰める
  const keyboardTop = toolbarHeight + textInputHeight + triggerGestureHeight + flickFeedbackHeight;

  // 現在顔が向いているキーを取得（idle状態のみ、平滑化された値を使用）
  // 顔が検出されていない場合はハイライトを表示しない
  const currentKey = (inputState.type === 'idle' && smoothedFaceState && isFaceDetected)
    ? getSelectedKey(smoothedFaceState, calibrationSettings)
    : null;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  KEYBOARD_LAYOUT.rows.forEach((row, rowIndex) => {
    row.forEach((key, colIndex) => {
      const x = colIndex * keyWidth;
      const y = keyboardTop + rowIndex * keyHeight;

      // キーの枠を描画
      ctx.strokeRect(x, y, keyWidth, keyHeight);

      // トリガーでホールド中のキー
      const isSelected =
        inputState.type !== 'idle' &&
        inputState.key.base === key.base;

      // 顔が向いているキー（トリガーなし時のみ）
      const isHovered = !isSelected && inputState.type === 'idle' && currentKey && currentKey.base === key.base;

      // ハイライト表示
      if (isSelected) {
        // トリガーでホールド中 = 強調表示（半透明の青）
        ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
        ctx.fillRect(x, y, keyWidth, keyHeight);
      } else if (isHovered) {
        // 顔が向いているだけ = 薄いハイライト（半透明の青）
        ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
        ctx.fillRect(x, y, keyWidth, keyHeight);
      }

      // フリック方向の判定（isSelectedの場合のみ）
      const activeDirection = isSelected && inputState.type === 'flicking' ? inputState.direction : null;
      const isCenterActive = isSelected && !activeDirection;

      // キーのテキストを描画（ドロップシャドウ付き）
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // 「や」のキー判定
      const isYaKey = key.base === 'や';
      // 「や」キーで笑顔/眉上げ認識中かどうか
      const isGestureRecognizing = isYaKey && !isSelected && isHovered &&
        (isSmileRecognizing || isBrowRaiseRecognizing);

      if (isGestureRecognizing) {
        // 認識中: Lipsアイコンのみ（大きく、オレンジ）
        ctx.font = '36px "Material Symbols Outlined"';
        ctx.fillStyle = '#ffa500';
        ctx.fillText('lips', x + keyWidth / 2, y + keyHeight / 2);
      } else if (isCenterActive) {
        // ホールド中: 基本文字のみ（現在のまま）
        ctx.font = '36px sans-serif';
        ctx.fillStyle = '#ffa500'; // オレンジ
        ctx.fillText(key.base, x + keyWidth / 2, y + keyHeight / 2);
      } else if (isYaKey && !isSelected) {
        // 「や」キー通常時: 「や」 + 小さいLipsアイコン
        ctx.font = '32px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(key.base, x + keyWidth / 2, y + keyHeight / 2 - 10);
        // Lipsアイコン（小さめ）
        ctx.font = '20px "Material Symbols Outlined"';
        ctx.fillText('lips', x + keyWidth / 2, y + keyHeight / 2 + 12);
      } else {
        // 通常のキー
        ctx.font = '32px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(key.base, x + keyWidth / 2, y + keyHeight / 2);
      }
      ctx.shadowColor = 'transparent'; // シャドウをリセット
      ctx.font = '32px sans-serif'; // フォントをリセット

      // フリック方向を描画（キーホールド中のみ）
      if (isSelected) {
        drawFlickDirections(ctx, key, x, y, keyWidth, keyHeight, activeDirection);
      }
    });
  });
}

/**
 * フリック方向のテキストを描画する
 */
function drawFlickDirections(
  ctx: CanvasRenderingContext2D,
  key: FlickKey,
  x: number,
  y: number,
  keyWidth: number,
  keyHeight: number,
  activeDirection: string | null
): void {
  // ドロップシャドウを有効化
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // 左（left）
  if (key.left) {
    const isActive = activeDirection === 'left';
    ctx.font = isActive ? '42px sans-serif' : '32px sans-serif';
    ctx.fillStyle = isActive ? '#ffa500' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(key.left, x + keyWidth * 0.15, y + keyHeight / 2);
  }

  // 上（up）
  if (key.up) {
    const isActive = activeDirection === 'up';
    ctx.font = isActive ? '42px sans-serif' : '32px sans-serif';
    ctx.fillStyle = isActive ? '#ffa500' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(key.up, x + keyWidth / 2, y + keyHeight * 0.15);
  }

  // 右（right）
  if (key.right) {
    const isActive = activeDirection === 'right';
    ctx.font = isActive ? '42px sans-serif' : '32px sans-serif';
    ctx.fillStyle = isActive ? '#ffa500' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(key.right, x + keyWidth * 0.85, y + keyHeight / 2);
  }

  // 下（down）
  if (key.down) {
    const isActive = activeDirection === 'down';
    ctx.font = isActive ? '42px sans-serif' : '32px sans-serif';
    ctx.fillStyle = isActive ? '#ffa500' : 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(key.down, x + keyWidth / 2, y + keyHeight * 0.85);
  }

  ctx.font = '32px sans-serif';
  ctx.shadowColor = 'transparent'; // シャドウをリセット
}
