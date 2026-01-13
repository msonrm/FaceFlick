import { InputState } from '../../types';

export type GestureFeedbackType = 'backspace' | 'newline' | 'clear_all' | 'readback' | 'copy_speak_clear';

export interface GestureFeedback {
  type: GestureFeedbackType;
  timestamp: number;
}

export interface DebugInfo {
  blendshapes: {
    jawOpen: number;
    mouthPucker: number;
    mouthSmileLeft: number;
    mouthSmileRight: number;
    eyeBlinkLeft: number;
    eyeBlinkRight: number;
    browInnerUp: number;
  };
  allBlendshapes: Array<{ name: string; value: number }>;
  triggerType: string;
  headRotation: { yaw: number; pitch: number; roll: number };
}

export interface DrawInputTextOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  toolbarHeight: number;
  inputText: string;
  inputState: InputState;
  gestureFeedback: GestureFeedback | null;
  debugInfo: DebugInfo | null;
  showDebugInfo: boolean;
  isSmileRecognizing: boolean;
  isBrowRaiseRecognizing: boolean;
}

/**
 * テキスト入力エリアとUI要素を描画する
 */
export function drawInputText(options: DrawInputTextOptions): void {
  const {
    ctx,
    width,
    toolbarHeight,
    inputText,
    inputState,
    gestureFeedback,
    debugInfo,
    showDebugInfo,
    isSmileRecognizing,
    isBrowRaiseRecognizing,
  } = options;

  const keyWidth = width / 3;
  const keyHeight = keyWidth * 0.75;
  const keyboardHeight = keyHeight * 4;

  // レイアウト計算：各エリアの高さ
  const textInputHeight = 120; // テキスト入力エリア
  const triggerGestureHeight = 30; // トリガーとジェスチャー
  const flickFeedbackHeight = 30; // フリック状態とジェスチャーフィードバック
  const instructionsHeight = 70; // 操作方法（またはデバッグ情報）

  // 各エリアの位置を計算（余白なしでキーボードを上に詰める）
  let currentY = toolbarHeight;

  // 1. テキスト入力エリア
  const textAreaTop = currentY;
  currentY += textInputHeight;

  // 2. トリガーとジェスチャー
  const triggerAreaTop = currentY;
  currentY += triggerGestureHeight;

  // 3. フリック状態とジェスチャーフィードバック
  const flickAreaTop = currentY;
  currentY += flickFeedbackHeight;

  // 4. キーボード（描画は drawKeyboard 関数で行う、余白なし）
  currentY += keyboardHeight;

  // 5. 操作方法（またはデバッグ情報）
  const instructionsTop = currentY;

  // === 1. テキスト入力エリアの描画 ===
  drawTextInputArea(ctx, width, textAreaTop, textInputHeight, inputText);

  // === 2. トリガーとジェスチャーの描画 ===
  drawTriggerArea(ctx, width, triggerAreaTop, triggerGestureHeight, inputState, isSmileRecognizing, isBrowRaiseRecognizing);

  // === 3. フリック状態とジェスチャーフィードバックの描画 ===
  drawFlickFeedbackArea(ctx, width, flickAreaTop, flickFeedbackHeight, inputState, gestureFeedback);

  // === 5. 操作方法（またはデバッグ情報）の描画 ===
  drawInstructionsArea(ctx, width, instructionsTop, instructionsHeight, showDebugInfo, debugInfo);
}

/**
 * テキスト入力エリアを描画
 */
function drawTextInputArea(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  height: number,
  inputText: string
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, top, width, height);

  ctx.fillStyle = '#ffffff';
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // テキストを折り返して描画
  const lineHeight = 30;
  const maxWidth = width - 40;
  const lines: string[] = [];
  const paragraphs = inputText.split('\n');

  paragraphs.forEach((paragraph, paragraphIndex) => {
    let currentLine = '';
    for (let i = 0; i < paragraph.length; i++) {
      const testLine = currentLine + paragraph[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = paragraph[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine || paragraphIndex < paragraphs.length - 1) {
      lines.push(currentLine);
    }
  });

  const displayLines = lines.slice(-3);
  let textY = top + 15;
  displayLines.forEach((line) => {
    ctx.fillText(line, 20, textY);
    textY += lineHeight;
  });

  // カーソル表示
  const cursorVisible = Math.floor(Date.now() / 500) % 2 === 0;
  if (cursorVisible) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px monospace';
    const cursorX = displayLines.length > 0
      ? 20 + ctx.measureText(displayLines[displayLines.length - 1]).width
      : 20;
    const cursorY = displayLines.length > 0
      ? textY - lineHeight
      : top + 15;
    ctx.fillText('|', cursorX, cursorY);
  }
}

/**
 * トリガーとジェスチャーエリアを描画
 */
function drawTriggerArea(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  height: number,
  inputState: InputState,
  isSmileRecognizing: boolean,
  isBrowRaiseRecognizing: boolean
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, top, width, height);

  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const triggerY = top + height / 2;

  if (inputState.type !== 'idle') {
    const triggerText = inputState.triggerType === 'mouth_open' ? '口開け 👄' : '口すぼめ 💋';
    ctx.fillStyle = '#ffff00';
    ctx.fillText(`トリガー: ${triggerText}`, 20, triggerY);
  } else if (isSmileRecognizing) {
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('ジェスチャー: 笑顔 😊', 20, triggerY);
  } else if (isBrowRaiseRecognizing) {
    ctx.fillStyle = '#ffaa00';
    ctx.fillText('ジェスチャー: 目を見開く 👀', 20, triggerY);
  }
}

/**
 * フリック状態とジェスチャーフィードバックエリアを描画
 */
function drawFlickFeedbackArea(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  height: number,
  inputState: InputState,
  gestureFeedback: GestureFeedback | null
): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, top, width, height);

  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const flickY = top + height / 2;

  if (inputState.type === 'selecting') {
    ctx.fillStyle = '#ffff00';
    ctx.fillText('フリック: 中央', 20, flickY);
  } else if (inputState.type === 'flicking') {
    const directionText = getDirectionDisplayText(inputState.direction);
    ctx.fillStyle = '#00ff00';
    ctx.fillText(`フリック: ${directionText}`, 20, flickY);
  }

  // ジェスチャーフィードバック（右側、フェードアウト）
  if (gestureFeedback) {
    const feedbackAge = Date.now() - gestureFeedback.timestamp;
    const opacity = Math.max(0, 1 - feedbackAge / 1000);

    ctx.save();
    ctx.fillStyle = `rgba(0, 255, 255, ${opacity})`;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.shadowColor = `rgba(0, 0, 0, ${opacity * 0.8})`;
    ctx.shadowBlur = 4;

    let text = '';
    switch (gestureFeedback.type) {
      case 'backspace':
        text = '⌫ 1文字削除';
        break;
      case 'newline':
        text = '↵ 改行';
        break;
      case 'clear_all':
        text = '🗑 全消去';
        break;
      case 'readback':
        text = '🔊 読み上げ';
        break;
      case 'copy_speak_clear':
        text = '🔊 読み上げ&消去';
        break;
    }
    ctx.fillText(text, width - 20, flickY);
    ctx.restore();
  }
}

/**
 * 操作方法またはデバッグ情報エリアを描画
 */
function drawInstructionsArea(
  ctx: CanvasRenderingContext2D,
  width: number,
  top: number,
  height: number,
  showDebugInfo: boolean,
  debugInfo: DebugInfo | null
): void {
  if (!showDebugInfo) {
    // 操作方法を表示
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, top, width, height);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('【操作方法】', 20, top + 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '12px sans-serif';
    ctx.fillText('顔の向き: キー選択  |  口開け/すぼめ: ホールド開始', 20, top + 26);
    ctx.fillText('ホールド中に顔を動かす: フリック  |  口を戻す: 確定', 20, top + 42);
    ctx.fillText('首を左右に振る: 1文字削除  |  「や」で目を見開く/笑顔: 読み上げ&消去', 20, top + 58);
  } else {
    // デバッグ情報を表示
    if (debugInfo) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, top, width, height);

      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const triggerText = getTriggerDisplayText(debugInfo.triggerType);
      ctx.fillText(`トリガー: ${triggerText}`, 10, top + 8);

      ctx.fillText(
        `jaw: ${debugInfo.blendshapes.jawOpen.toFixed(2)} pucker: ${debugInfo.blendshapes.mouthPucker.toFixed(2)} smile: ${debugInfo.blendshapes.mouthSmileLeft.toFixed(2)}`,
        10,
        top + 23
      );

      ctx.fillText(
        `Yaw: ${debugInfo.headRotation.yaw.toFixed(1)}° Pitch: ${debugInfo.headRotation.pitch.toFixed(1)}° Roll: ${debugInfo.headRotation.roll.toFixed(1)}°`,
        10,
        top + 38
      );
    }
  }
}

/**
 * トリガータイプの表示テキストを取得
 */
export function getTriggerDisplayText(triggerType: string): string {
  switch (triggerType) {
    case 'mouth_open':
      return '口を開ける 👄';
    case 'mouth_pucker':
      return '口すぼめ 💋';
    default:
      return 'なし';
  }
}

/**
 * フリック方向の表示テキストを取得
 */
export function getDirectionDisplayText(direction: string | null): string {
  switch (direction) {
    case 'up':
      return '↑ 上';
    case 'down':
      return '↓ 下';
    case 'left':
      return '← 左';
    case 'right':
      return '→ 右';
    default:
      return '';
  }
}

/**
 * レイアウト定数をエクスポート（他のモジュールで再利用）
 */
export const UI_LAYOUT = {
  toolbarHeight: 50,
  textInputHeight: 120,
  triggerGestureHeight: 30,
  flickFeedbackHeight: 30,
  instructionsHeight: 70,
} as const;
