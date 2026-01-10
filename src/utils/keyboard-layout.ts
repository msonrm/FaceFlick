import { KeyboardLayout } from '../types';

export const KEYBOARD_LAYOUT: KeyboardLayout = {
  rows: [
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
      { base: 'や', left: '「', up: 'ゆ', right: '」', down: 'よ' },
      { base: 'ら', left: 'り', up: 'る', right: 'れ', down: 'ろ' },
    ],
    [
      { base: '゛゜小', left: '', up: '', right: '', down: '' },
      { base: 'わ', left: 'を', up: 'ん', right: 'ー', down: '〜' },
      { base: '、', left: '。', up: '？', right: '！', down: '…' },
    ],
  ],
};

export const GRID_SENSITIVITY = 15; // 度
export const FLICK_SENSITIVITY = 20; // 度

// トリガーの閾値（Blendshapes: 0-1）
export const JAW_OPEN_THRESHOLD = 0.5;       // 口を開ける
export const MOUTH_PUCKER_THRESHOLD = 0.4;   // キス顔
export const SMILE_THRESHOLD = 0.6;          // 笑顔（読み上げ&クリア用）
