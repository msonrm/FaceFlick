export type VoiceType = 'robot_low' | 'robot_normal' | 'human_high';

/**
 * 読み上げイベントのコールバック
 */
export interface SpeechCallbacks {
  onStart?: () => void;
  onBoundary?: () => void;
  onEnd?: () => void;
}

/**
 * 特殊文字の読み替えマップ
 */
const SPECIAL_TEXT_MAP: Record<string, string> = {
  '゛゜小': 'てん',
  '、': 'くとうてん',
};

/**
 * 音声タイプごとの設定
 */
const VOICE_SETTINGS: Record<VoiceType, { rate: number; pitch: number }> = {
  robot_low: { rate: 1.0, pitch: 0.8 },
  robot_normal: { rate: 1.0, pitch: 1.0 },
  human_high: { rate: 1.0, pitch: 1.2 },
};

/**
 * テキストを読み上げる
 */
export function speakText(
  text: string,
  voice: VoiceType = 'human_high',
  callbacks?: SpeechCallbacks
): void {
  if (!text || !window.speechSynthesis) return;

  // 特殊文字の読み替え
  const spokenText = SPECIAL_TEXT_MAP[text] ?? text;

  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = 'ja-JP';

  const settings = VOICE_SETTINGS[voice];
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;

  // コールバックを設定
  if (callbacks) {
    if (callbacks.onStart) {
      utterance.onstart = callbacks.onStart;
    }
    if (callbacks.onBoundary) {
      utterance.onboundary = callbacks.onBoundary;
    }
    if (callbacks.onEnd) {
      utterance.onend = callbacks.onEnd;
    }
  }

  window.speechSynthesis.speak(utterance);
}

/**
 * 読み上げをキャンセルする
 */
export function cancelSpeech(): void {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * 読み上げ中かどうかを取得する
 */
export function isSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}
