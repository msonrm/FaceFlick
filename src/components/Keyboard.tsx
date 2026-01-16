import { useMemo } from 'react';
import {
  KeyboardLayout,
  KeyPosition,
  FlickDirection,
  FlickKey,
  TapKey,
} from '../types';
import { getLayout } from '../utils/keyboard-layout';

interface KeyboardProps {
  layoutId: string;
  selectedKey: KeyPosition | null;
  flickDirection: FlickDirection;
  inputPhase: 'idle' | 'triggering' | 'selecting' | 'flicking';
  previewChar: string | null;
  isHidden?: boolean;
  speakClearProgress?: number | null; // 0-1: 発声&クリアの進捗（「や」キー上で笑顔/眉上げ時）
  hasText?: boolean; // テキストエリアに文字があるか（「や」キーのアイコン表示用）
  modifierJustUsed?: boolean; // 変換キーが使用された直後か
  lastChar?: string | null; // テキストエリアの最後の文字（変換キーの表示制御用）
  modifierProgress?: number | null; // 0-1: 変換キーの保持進捗
  conversionPreview?: string | null; // 変換プレビュー（「か→が」の形式）
}

export function Keyboard({
  layoutId,
  selectedKey,
  flickDirection,
  inputPhase,
  previewChar,
  isHidden = false,
  speakClearProgress = null,
  hasText = false,
  modifierJustUsed = false,
  lastChar = null,
  modifierProgress = null,
  conversionPreview = null,
}: KeyboardProps) {
  const layout = useMemo(() => getLayout(layoutId), [layoutId]);

  // フェードアウト/イン用のスタイル
  const containerStyle = {
    opacity: isHidden ? 0 : 1,
    transition: 'opacity 0.3s ease-in-out',
    pointerEvents: isHidden ? 'none' as const : 'auto' as const,
  };

  if (layout.type === 'flick') {
    return (
      <div style={containerStyle}>
        <FlickKeyboard
          layout={layout}
          selectedKey={selectedKey}
          flickDirection={flickDirection}
          inputPhase={inputPhase}
          previewChar={previewChar}
          speakClearProgress={speakClearProgress}
          hasText={hasText}
          modifierJustUsed={modifierJustUsed}
          lastChar={lastChar}
          modifierProgress={modifierProgress}
          conversionPreview={conversionPreview}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <TapKeyboard
        layout={layout}
        selectedKey={selectedKey}
        inputPhase={inputPhase}
      />
    </div>
  );
}

// ============================================
// フリックキーボード
// ============================================

interface FlickKeyboardProps {
  layout: KeyboardLayout;
  selectedKey: KeyPosition | null;
  flickDirection: FlickDirection;
  inputPhase: 'idle' | 'triggering' | 'selecting' | 'flicking';
  previewChar: string | null;
  speakClearProgress: number | null;
  hasText: boolean;
  modifierJustUsed: boolean;
  lastChar: string | null;
  modifierProgress: number | null;
  conversionPreview: string | null;
}

function FlickKeyboard({
  layout,
  selectedKey,
  flickDirection,
  inputPhase,
  previewChar,
  speakClearProgress,
  hasText,
  modifierJustUsed,
  lastChar,
  modifierProgress,
  conversionPreview,
}: FlickKeyboardProps) {
  return (
    <div className="grid grid-rows-4 gap-1 w-full max-w-sm mx-auto aspect-[3/4]">
      {layout.keys.map((row, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-3 gap-1">
          {row.map((key, colIndex) => {
            const isSelected =
              selectedKey?.row === rowIndex && selectedKey?.col === colIndex;
            const flickKey = key as FlickKey;
            // 「や」キー（row:2, col:1）の発声&クリア進捗
            const isYaKey = rowIndex === 2 && colIndex === 1;
            // 変換キー（row:3, col:0）
            const isModifierKey = rowIndex === 3 && colIndex === 0;

            return (
              <FlickKeyCell
                key={colIndex}
                keyData={flickKey}
                isSelected={isSelected}
                flickDirection={isSelected ? flickDirection : null}
                inputPhase={isSelected ? inputPhase : 'idle'}
                previewChar={isSelected ? previewChar : null}
                speakClearProgress={isYaKey ? speakClearProgress : null}
                hasText={hasText}
                modifierJustUsed={isModifierKey && modifierJustUsed}
                lastChar={isModifierKey ? lastChar : null}
                modifierProgress={isModifierKey ? modifierProgress : null}
                conversionPreview={isModifierKey ? conversionPreview : null}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface FlickKeyCellProps {
  keyData: FlickKey;
  isSelected: boolean;
  flickDirection: FlickDirection;
  inputPhase: 'idle' | 'triggering' | 'selecting' | 'flicking';
  previewChar: string | null;
  speakClearProgress: number | null;
  hasText: boolean;
  modifierJustUsed: boolean;
  lastChar: string | null; // 変換キー: 最後の文字
  modifierProgress: number | null; // 変換キー: 保持進捗
  conversionPreview: string | null; // 変換キー: プレビュー
}

function FlickKeyCell({
  keyData,
  isSelected,
  flickDirection,
  inputPhase,
  previewChar,
  speakClearProgress,
  hasText,
  modifierJustUsed,
  lastChar,
  modifierProgress,
  conversionPreview,
}: FlickKeyCellProps) {
  const isTriggering = inputPhase === 'triggering';
  const isSelecting = inputPhase === 'selecting' || inputPhase === 'flicking';
  const isSpeakClearHolding = speakClearProgress !== null && speakClearProgress > 0;
  const isModifierHolding = modifierProgress !== null && modifierProgress > 0;

  // 変換キー: 変換非対応の場合はグレーアウト
  const isModifierDisabled = keyData.isModifier && !lastChar;

  // ベースのスタイル（通常時はほぼ透明、後ろのアバターが見える）
  let bgClass = 'bg-gray-800/10';
  let borderClass = 'border-gray-500/20';
  let textOpacity = isModifierDisabled ? 'opacity-20' : 'opacity-40';
  let scaleClass = '';
  let customBgStyle: React.CSSProperties | undefined;

  // 発声&クリアホールド中（オレンジ背景、不透明度が進捗に応じて増加）
  if (isSpeakClearHolding) {
    const alpha = 0.2 + speakClearProgress * 0.6; // 0.2 → 0.8
    customBgStyle = { backgroundColor: `rgba(255, 140, 0, ${alpha})` };
    borderClass = 'border-orange-400';
    textOpacity = 'opacity-100';
    scaleClass = 'scale-105';
  } else if (isModifierHolding) {
    // 変換キー保持中（オレンジ背景、不透明度が進捗に応じて増加）
    const alpha = 0.2 + modifierProgress * 0.6; // 0.2 → 0.8
    customBgStyle = { backgroundColor: `rgba(255, 140, 0, ${alpha})` };
    borderClass = 'border-orange-400';
    textOpacity = 'opacity-100';
    scaleClass = 'scale-105';
  } else if (modifierJustUsed) {
    // 変換キー使用直後（オレンジ背景を0.3秒維持）
    customBgStyle = { backgroundColor: 'rgba(255, 140, 0, 0.6)' };
    borderClass = 'border-orange-400';
    textOpacity = 'opacity-100';
    scaleClass = 'scale-105';
  } else if (isSelected) {
    if (isSelecting) {
      // ホールド完了：青くハイライト（しっかり表示）+ 文字色も変更
      bgClass = 'bg-blue-600/60';
      borderClass = 'border-blue-400';
      textOpacity = 'opacity-100';
      scaleClass = 'scale-105';
    } else if (isTriggering) {
      // トリガー検出中：背景のみ変更（文字色はホバーと同じ）
      bgClass = 'bg-blue-600/40';
      borderClass = 'border-blue-300/60';
      textOpacity = isModifierDisabled ? 'opacity-20' : 'opacity-70';
      scaleClass = 'scale-102';
    } else {
      // ホバー中：少し見える程度
      bgClass = 'bg-gray-700/30';
      borderClass = 'border-white/40';
      textOpacity = isModifierDisabled ? 'opacity-20' : 'opacity-70';
    }
  }

  // フリック方向のハイライト
  const getDirectionHighlight = (dir: 'up' | 'down' | 'left' | 'right') => {
    if (!isSelecting) {
      // ホバー時・トリガー中は小さく薄く
      return `text-gray-400 text-xs ${textOpacity}`;
    }
    // フリック開始後は全方向を白く大きく、選択中の方向は黄色
    if (flickDirection === dir) {
      return 'text-yellow-300 text-xl font-bold';
    }
    return 'text-white text-xl font-bold';
  };

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center
        rounded-lg border-2 transition-all duration-150
        ${isSpeakClearHolding ? '' : bgClass} ${borderClass} ${scaleClass}
      `}
      style={customBgStyle}
    >
      {/* 発声&クリアホールド中はスピーカーアイコンのみ表示 */}
      {isSpeakClearHolding ? (
        <span className="material-symbols-outlined text-4xl text-white">
          volume_up
        </span>
      ) : (
        <>
          {/* 上の文字 */}
          {keyData.up && (
            <span
              className={`absolute top-1 ${getDirectionHighlight('up')}`}
            >
              {keyData.up}
            </span>
          )}

          {/* 左の文字 */}
          {keyData.left && (
            <span
              className={`absolute left-2 ${getDirectionHighlight('left')}`}
            >
              {keyData.left}
            </span>
          )}

          {/* 中央の文字 */}
          <span
            className={`
              text-xl font-bold transition-opacity duration-150
              ${isSelected && isSelecting && flickDirection === 'center'
                ? 'text-yellow-300'
                : isSelected
                ? 'text-white'
                : `text-gray-200 ${textOpacity}`
              }
            `}
          >
            {keyData.base}
          </span>

          {/* 右の文字 */}
          {keyData.right && (
            <span
              className={`absolute right-2 ${getDirectionHighlight('right')}`}
            >
              {keyData.right}
            </span>
          )}

          {/* 下の文字 */}
          {keyData.down && (
            <span
              className={`absolute bottom-1 ${getDirectionHighlight('down')}`}
            >
              {keyData.down}
            </span>
          )}

          {/* プレビュー表示（選択中の文字を大きく表示） */}
          {isSelected && isSelecting && previewChar && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-yellow-400 text-gray-900 px-3 py-1 rounded-lg text-2xl font-bold shadow-lg">
              {previewChar}
            </div>
          )}

          {/* 変換キー用のプレビュー表示（保持中に「か→が」形式で表示） */}
          {isModifierHolding && conversionPreview && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-orange-400 text-gray-900 px-3 py-1 rounded-lg text-xl font-bold shadow-lg whitespace-nowrap">
              {conversionPreview}
            </div>
          )}

          {/* 特殊キー用のアイコン（読み上げトリガー）- フリック中/テキストなしは非表示 */}
          {keyData.isSpecial && !isSelecting && hasText && (
            <span className="absolute top-0.5 right-0.5 material-symbols-outlined text-green-400 text-sm">
              volume_up
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// タップキーボード
// ============================================

interface TapKeyboardProps {
  layout: KeyboardLayout;
  selectedKey: KeyPosition | null;
  inputPhase: 'idle' | 'triggering' | 'selecting' | 'flicking';
}

function TapKeyboard({
  layout,
  selectedKey,
  inputPhase,
}: TapKeyboardProps) {
  return (
    <div
      className="grid gap-0.5 w-full max-w-md mx-auto"
      style={{
        gridTemplateRows: `repeat(${layout.gridSize.rows}, 1fr)`,
      }}
    >
      {layout.keys.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `repeat(${layout.gridSize.cols}, 1fr)`,
          }}
        >
          {row.map((key, colIndex) => {
            const isSelected =
              selectedKey?.row === rowIndex && selectedKey?.col === colIndex;
            const tapKey = key as TapKey;

            return (
              <TapKeyCell
                key={colIndex}
                keyData={tapKey}
                isSelected={isSelected}
                inputPhase={isSelected ? inputPhase : 'idle'}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface TapKeyCellProps {
  keyData: TapKey;
  isSelected: boolean;
  inputPhase: 'idle' | 'triggering' | 'selecting' | 'flicking';
}

function TapKeyCell({ keyData, isSelected, inputPhase }: TapKeyCellProps) {
  const isTriggering = inputPhase === 'triggering';
  const isSelecting = inputPhase === 'selecting' || inputPhase === 'flicking';

  // 通常時はほぼ透明
  let bgClass = 'bg-gray-800/10';
  let borderClass = 'border-gray-500/20';
  let textOpacity = 'opacity-40';

  if (isSelected) {
    if (isSelecting) {
      bgClass = 'bg-blue-600/60';
      borderClass = 'border-blue-400';
      textOpacity = 'opacity-100';
    } else if (isTriggering) {
      // トリガー検出中：背景のみ変更
      bgClass = 'bg-blue-600/40';
      borderClass = 'border-blue-300/60';
      textOpacity = 'opacity-70';
    } else {
      bgClass = 'bg-gray-700/30';
      borderClass = 'border-white/40';
      textOpacity = 'opacity-70';
    }
  }

  return (
    <div
      className={`
        flex items-center justify-center
        rounded border transition-all duration-100
        ${bgClass} ${borderClass}
        py-1.5
      `}
    >
      <span
        className={`
          text-sm font-medium transition-opacity duration-150
          ${isSelected && isSelecting ? 'text-yellow-300' : isSelected ? 'text-white' : `text-gray-200 ${textOpacity}`}
        `}
      >
        {keyData.char}
      </span>
    </div>
  );
}
