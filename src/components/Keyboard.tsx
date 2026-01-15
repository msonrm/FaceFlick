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
  inputPhase: 'idle' | 'selecting' | 'flicking';
  previewChar: string | null;
  isHidden?: boolean;
}

export function Keyboard({
  layoutId,
  selectedKey,
  flickDirection,
  inputPhase,
  previewChar,
  isHidden = false,
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
  inputPhase: 'idle' | 'selecting' | 'flicking';
  previewChar: string | null;
}

function FlickKeyboard({
  layout,
  selectedKey,
  flickDirection,
  inputPhase,
  previewChar,
}: FlickKeyboardProps) {
  return (
    <div className="grid grid-rows-4 gap-1 w-full max-w-sm mx-auto aspect-[3/4]">
      {layout.keys.map((row, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-3 gap-1">
          {row.map((key, colIndex) => {
            const isSelected =
              selectedKey?.row === rowIndex && selectedKey?.col === colIndex;
            const flickKey = key as FlickKey;

            return (
              <FlickKeyCell
                key={colIndex}
                keyData={flickKey}
                isSelected={isSelected}
                flickDirection={isSelected ? flickDirection : null}
                inputPhase={isSelected ? inputPhase : 'idle'}
                previewChar={isSelected ? previewChar : null}
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
  inputPhase: 'idle' | 'selecting' | 'flicking';
  previewChar: string | null;
}

function FlickKeyCell({
  keyData,
  isSelected,
  flickDirection,
  inputPhase,
  previewChar,
}: FlickKeyCellProps) {
  const isSelecting = inputPhase === 'selecting' || inputPhase === 'flicking';

  // ベースのスタイル（通常時はほぼ透明、後ろのアバターが見える）
  let bgClass = 'bg-gray-800/10';
  let borderClass = 'border-gray-500/20';
  let textOpacity = 'opacity-40';
  let scaleClass = '';

  if (isSelected) {
    if (isSelecting) {
      // 入力中：青くハイライト（しっかり表示）
      bgClass = 'bg-blue-600/60';
      borderClass = 'border-blue-400';
      textOpacity = 'opacity-100';
      scaleClass = 'scale-105';
    } else {
      // ホバー中：少し見える程度
      bgClass = 'bg-gray-700/30';
      borderClass = 'border-white/40';
      textOpacity = 'opacity-70';
    }
  }

  // フリック方向のハイライト
  const getDirectionHighlight = (dir: 'up' | 'down' | 'left' | 'right') => {
    if (!isSelecting || flickDirection !== dir) return `text-gray-400 text-xs ${textOpacity}`;
    return 'text-yellow-300 text-sm font-bold';
  };

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center
        rounded-lg border-2 transition-all duration-150
        ${bgClass} ${borderClass} ${scaleClass}
      `}
    >
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

      {/* モディファイアキー用のアイコン */}
      {keyData.isModifier && (
        <div className="absolute bottom-0.5 right-0.5 text-xs text-gray-500">
          変換
        </div>
      )}

      {/* 特殊キー用のアイコン（読み上げトリガー） */}
      {keyData.isSpecial && (
        <div className="absolute top-0.5 right-0.5 text-xs text-green-400">
          読
        </div>
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
  inputPhase: 'idle' | 'selecting' | 'flicking';
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
  inputPhase: 'idle' | 'selecting' | 'flicking';
}

function TapKeyCell({ keyData, isSelected, inputPhase }: TapKeyCellProps) {
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
