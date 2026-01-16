/**
 * 濁点変換マップ
 */
const DAKUTEN_MAP: Record<string, string> = {
  'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
  'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
  'た': 'だ', 'ち': 'ぢ', 'て': 'で', 'と': 'ど',
  'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
};

/**
 * 半濁点変換マップ（は行のみ）
 */
const HANDAKUTEN_MAP: Record<string, string> = {
  'ば': 'ぱ', 'び': 'ぴ', 'ぶ': 'ぷ', 'べ': 'ぺ', 'ぼ': 'ぽ',
};

/**
 * 小文字変換マップ
 */
const SMALL_MAP: Record<string, string> = {
  'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ',
  'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ',
};

// 逆マップ（元に戻す用）
const REVERSE_DAKUTEN: Record<string, string> = Object.fromEntries(
  Object.entries(DAKUTEN_MAP).map(([k, v]) => [v, k])
);
const REVERSE_HANDAKUTEN: Record<string, string> = Object.fromEntries(
  Object.entries(HANDAKUTEN_MAP).map(([k, v]) => [v, k])
);
const REVERSE_SMALL: Record<string, string> = Object.fromEntries(
  Object.entries(SMALL_MAP).map(([k, v]) => [v, k])
);

/**
 * 文字が濁点・半濁点・小文字で変換可能かを判定
 */
export function canToggleCharacter(char: string): boolean {
  // つ系は変換可能
  if (char === 'つ' || char === 'っ' || char === 'づ') return true;

  // 濁点/半濁点対応文字
  if (DAKUTEN_MAP[char] || REVERSE_DAKUTEN[char]) return true;
  if (HANDAKUTEN_MAP[char] || REVERSE_HANDAKUTEN[char]) return true;

  // 小文字対応文字
  if (SMALL_MAP[char] || REVERSE_SMALL[char]) return true;

  return false;
}

/**
 * 文字を濁点・半濁点・小文字でトグルする
 *
 * サイクル:
 * - 「つ」: つ→っ→づ→つ
 * - は行: 通常→濁点→半濁点→通常
 * - その他濁点対応文字: 通常→濁点→通常
 * - 小文字対応文字: 通常→小文字→通常
 */
export function toggleCharacter(char: string): string {
  // 「つ」の特殊なサイクル: つ→っ→づ→つ
  if (char === 'つ') return 'っ';
  if (char === 'っ') return 'づ';
  if (char === 'づ') return 'つ';

  // は行の濁点→半濁点→通常のサイクル
  if (HANDAKUTEN_MAP[char]) {
    return HANDAKUTEN_MAP[char];
  }
  if (REVERSE_HANDAKUTEN[char]) {
    return REVERSE_DAKUTEN[REVERSE_HANDAKUTEN[char]] || char;
  }

  // 濁点のサイクル（通常→濁点→通常）
  if (DAKUTEN_MAP[char]) {
    return DAKUTEN_MAP[char];
  }
  if (REVERSE_DAKUTEN[char]) {
    return REVERSE_DAKUTEN[char];
  }

  // 小文字のサイクル（通常→小文字→通常）
  if (SMALL_MAP[char]) {
    return SMALL_MAP[char];
  }
  if (REVERSE_SMALL[char]) {
    return REVERSE_SMALL[char];
  }

  // 変換できない文字はそのまま
  return char;
}

/**
 * 振動を発生させる（対応デバイスのみ）
 */
export function vibrate(duration: number = 100): void {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  }
}
