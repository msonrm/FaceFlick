import { KeyboardLayout } from '../types';

export const KEYBOARD_LAYOUT: KeyboardLayout = {
  rows: [
    [
      { base: 'あ', up: 'い', down: 'う', left: 'え', right: 'お' },
      { base: 'か', up: 'き', down: 'く', left: 'け', right: 'こ' },
      { base: 'さ', up: 'し', down: 'す', left: 'せ', right: 'そ' },
    ],
    [
      { base: 'た', up: 'ち', down: 'つ', left: 'て', right: 'と' },
      { base: 'な', up: 'に', down: 'ぬ', left: 'ね', right: 'の' },
      { base: 'は', up: 'ひ', down: 'ふ', left: 'へ', right: 'ほ' },
    ],
    [
      { base: 'ま', up: 'み', down: 'む', left: 'め', right: 'も' },
      { base: 'や', up: '', down: 'ゆ', left: '', right: 'よ' },
      { base: 'ら', up: 'り', down: 'る', left: 'れ', right: 'ろ' },
    ],
    [
      { base: '゛', up: '゜', down: '小', left: '', right: '' },
      { base: 'わ', up: 'を', down: 'ん', left: 'ー', right: '〜' },
      { base: '⌫', up: '', down: '', left: '', right: '' },
    ],
  ],
};

export const GRID_SENSITIVITY = 15; // 度
export const FLICK_SENSITIVITY = 20; // 度

// トリガーの閾値
export const MOUTH_OPEN_THRESHOLD = 0.5; // MAR: 口が開いていると判定（0.5以上で口を開けている）
export const MOUTH_PUCKER_THRESHOLD = 0.3; // 口をすぼめている判定（0.3以上でキス顔）
export const EAR_THRESHOLD = 0.2; // EAR: 目が閉じていると判定（0.2以下でウィンク）
