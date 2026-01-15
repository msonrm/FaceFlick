import { KeyboardLayout, FlickKey, TapKey, FlickDirection, KeyPosition } from '../types';

// ============================================
// フリック3x4 レイアウト
// ============================================

const FLICK_3x4_KEYS: FlickKey[][] = [
  [
    { base: 'あ', left: 'い', up: 'う', right: 'え', down: 'お' },
    { base: 'か', left: 'き', up: 'く', right: 'け', down: 'こ' },
    { base: 'さ', left: 'し', up: 'す', right: 'せ', down: 'そ' },
  ],
  [
    { base: 'た', left: 'ち', up: 'つ', right: 'て', down: 'と' },
    { base: 'な', left: 'に', up: 'ぬ', right: 'ね', down: 'の' },
    { base: 'は', left: 'ひ', up: 'ふ', right: 'へ', down: 'ほ' },
  ],
  [
    { base: 'ま', left: 'み', up: 'む', right: 'め', down: 'も' },
    { base: 'や', left: '「', up: 'ゆ', right: '」', down: 'よ', isSpecial: true },
    { base: 'ら', left: 'り', up: 'る', right: 'れ', down: 'ろ' },
  ],
  [
    { base: '゛゜小', left: '', up: '', right: '', down: '', isModifier: true },
    { base: 'わ', left: 'を', up: 'ん', right: 'ー', down: '〜' },
    { base: '、', left: '。', up: '？', right: '！', down: '…' },
  ],
];

export const FLICK_3x4_LAYOUT: KeyboardLayout = {
  id: 'flick-3x4',
  name: 'フリック 3×4',
  type: 'flick',
  gridSize: { rows: 4, cols: 3 },
  keys: FLICK_3x4_KEYS,
};

// ============================================
// 横並び 5x10 レイアウト（タップのみ）
// ============================================

const TAP_5x10_KEYS: TapKey[][] = [
  // あ行
  [{ char: 'あ' }, { char: 'い' }, { char: 'う' }, { char: 'え' }, { char: 'お' }],
  // か行
  [{ char: 'か' }, { char: 'き' }, { char: 'く' }, { char: 'け' }, { char: 'こ' }],
  // さ行
  [{ char: 'さ' }, { char: 'し' }, { char: 'す' }, { char: 'せ' }, { char: 'そ' }],
  // た行
  [{ char: 'た' }, { char: 'ち' }, { char: 'つ' }, { char: 'て' }, { char: 'と' }],
  // な行
  [{ char: 'な' }, { char: 'に' }, { char: 'ぬ' }, { char: 'ね' }, { char: 'の' }],
  // は行
  [{ char: 'は' }, { char: 'ひ' }, { char: 'ふ' }, { char: 'へ' }, { char: 'ほ' }],
  // ま行
  [{ char: 'ま' }, { char: 'み' }, { char: 'む' }, { char: 'め' }, { char: 'も' }],
  // や行
  [{ char: 'や' }, { char: '「' }, { char: 'ゆ' }, { char: '」' }, { char: 'よ', isSpecial: true }],
  // ら行
  [{ char: 'ら' }, { char: 'り' }, { char: 'る' }, { char: 'れ' }, { char: 'ろ' }],
  // わ行 + 記号
  [{ char: 'わ' }, { char: 'を' }, { char: 'ん' }, { char: '゛゜小', isModifier: true }, { char: '、。？' }],
];

export const TAP_5x10_LAYOUT: KeyboardLayout = {
  id: 'tap-5x10',
  name: '50音 5×10',
  type: 'tap',
  gridSize: { rows: 10, cols: 5 },
  keys: TAP_5x10_KEYS,
};

// ============================================
// レイアウト登録
// ============================================

export const KEYBOARD_LAYOUTS: Record<string, KeyboardLayout> = {
  'flick-3x4': FLICK_3x4_LAYOUT,
  'tap-5x10': TAP_5x10_LAYOUT,
};

export const DEFAULT_LAYOUT_ID = 'flick-3x4';

// ============================================
// ユーティリティ関数
// ============================================

export function getLayout(id: string): KeyboardLayout {
  return KEYBOARD_LAYOUTS[id] ?? FLICK_3x4_LAYOUT;
}

export function getKeyAt(layout: KeyboardLayout, position: KeyPosition): FlickKey | TapKey | null {
  const { row, col } = position;
  if (row < 0 || row >= layout.keys.length) return null;
  if (col < 0 || col >= layout.keys[row].length) return null;
  return layout.keys[row][col];
}

export function isFlickKey(key: FlickKey | TapKey): key is FlickKey {
  return 'base' in key;
}

export function isTapKey(key: FlickKey | TapKey): key is TapKey {
  return 'char' in key;
}

export function getCharacter(
  key: FlickKey | TapKey,
  direction: FlickDirection
): string | null {
  if (isTapKey(key)) {
    // タップキーは方向に関係なく文字を返す
    if (key.isModifier) return null; // モディファイアは特殊処理
    return key.char;
  }

  // フリックキー
  if (key.isModifier) return null; // モディファイアは特殊処理

  switch (direction) {
    case 'center':
    case null:
      return key.base || null;
    case 'up':
      return key.up || key.base || null;
    case 'down':
      return key.down || key.base || null;
    case 'left':
      return key.left || key.base || null;
    case 'right':
      return key.right || key.base || null;
    default:
      return key.base || null;
  }
}

// ============================================
// 感度設定
// ============================================

export const GRID_SENSITIVITY = 15; // 度
export const FLICK_SENSITIVITY = 10; // 度

// ============================================
// 閾値設定
// ============================================

export const DEFAULT_TRIGGER_THRESHOLD = 0.45; // 口開け/すぼめの統一閾値
export const DEFAULT_TRIGGER_END_THRESHOLD = 0.1; // ヒステリシス終了閾値
export const SMILE_THRESHOLD = 0.6;
export const BROW_THRESHOLD = 0.5;

// ============================================
// タイミング設定
// ============================================

export const HOLD_DELAY_MS = 400;           // トリガーホールド時間
export const GESTURE_COOLDOWN_MS = 1000;    // ジェスチャー後のクールダウン
export const CONFIRM_COOLDOWN_MS = 300;     // 文字確定後のクールダウン
export const FACE_LOST_TIMEOUT_MS = 300;    // 顔認識ロスト判定時間
export const SMILE_HOLD_MS = 1500;          // 笑顔ホールド時間
export const BROW_HOLD_MS = 1500;           // 眉上げホールド時間
export const CALIBRATION_MIN_MS = 2000;     // キャリブレーション最低時間
export const CALIBRATION_MAX_MS = 5000;     // キャリブレーション最大時間
export const CALIBRATION_STABILITY_THRESHOLD = 2; // 安定判定の標準偏差閾値（度）

// ============================================
// EMA平滑化係数
// ============================================

export const HEAD_ROTATION_ALPHA = 0.4;
export const HEAD_ROTATION_ALPHA_FLICK = 0.7;
export const BLENDSHAPES_ALPHA = 0.7;

// ============================================
// 顔認識頻度
// ============================================

export const DETECTION_INTERVAL_MS = 33; // ~30fps
