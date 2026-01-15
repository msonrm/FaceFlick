import { NormalizedLandmark } from '@mediapipe/tasks-vision';

// ============================================
// 顔認識関連
// ============================================

export interface FaceState {
  landmarks: NormalizedLandmark[];
  blendshapes: {
    jawOpen: number;
    mouthPucker: number;
    mouthSmileLeft: number;
    mouthSmileRight: number;
    eyeBlinkLeft: number;
    eyeBlinkRight: number;
    browInnerUp: number;
  };
  isTriggered: boolean;  // シンプル化: mouth_open/pucker を区別しない
  headRotation: {
    yaw: number;
    pitch: number;
    roll: number;
  };
}

// ============================================
// キーボードレイアウト関連
// ============================================

export type FlickDirection = 'up' | 'down' | 'left' | 'right' | 'center' | null;

// 単一キーの定義
export interface FlickKey {
  base: string;
  up?: string;
  down?: string;
  left?: string;
  right?: string;
  // 特殊キーのフラグ
  isModifier?: boolean;  // 濁点・半濁点・小文字
  isSpecial?: boolean;   // 読み上げトリガーなど
}

// タップ専用キー（横並びモード用）
export interface TapKey {
  char: string;
  isModifier?: boolean;
  isSpecial?: boolean;
}

// キーボードレイアウトの種類
export type KeyboardType = 'flick' | 'tap';

// キーボードレイアウト定義
export interface KeyboardLayout {
  id: string;
  name: string;
  type: KeyboardType;
  gridSize: { rows: number; cols: number };
  keys: (FlickKey | TapKey)[][];  // 2次元配列
}

// キー位置
export interface KeyPosition {
  row: number;
  col: number;
}

// ============================================
// 入力状態関連
// ============================================

export type InputPhase = 'idle' | 'triggering' | 'selecting' | 'flicking';

export interface InputState {
  phase: InputPhase;
  selectedKey: KeyPosition | null;
  flickDirection: FlickDirection;
  holdPosition: { yaw: number; pitch: number } | null;
  // プレビュー表示用
  previewChar: string | null;
}

// ============================================
// アプリケーション状態
// ============================================

export type AppPhase = 'loading' | 'calibrating' | 'ready';

export interface CalibrationSettings {
  // 顔の基準位置
  baseYaw: number;
  basePitch: number;
  // 顔の向きの有効範囲
  yawRange: { min: number; max: number };
  pitchRange: { min: number; max: number };
  // トリガー閾値
  triggerThreshold: number;      // 統一した開始閾値
  triggerEndThreshold: number;   // 統一した終了閾値（ヒステリシス）
  // 口のベース値（第一段階で測定）
  jawOpenBaseValue: number;
  mouthPuckerBaseValue: number;
  // ジェスチャー閾値
  smileThreshold: number;
  browInnerUpThreshold: number;
  browInnerUpBaseValue: number;
  // 感度設定
  gridSensitivity: number;
  flickSensitivity: number;
}

// アプリ全体の状態（useReducer用）
export interface AppState {
  phase: AppPhase;
  input: InputState;
  text: string;
  calibration: CalibrationSettings | null;
  keyboardModeId: string;  // 現在のキーボードモード
  faceDisplayMode: 'none' | 'vrm';
  error: AppError | null;
}

// エラー状態
export type AppError =
  | { type: 'camera_denied' }
  | { type: 'camera_not_found' }
  | { type: 'face_landmarker_failed'; message: string }
  | { type: 'vrm_load_failed'; message: string }
  | { type: 'face_lost' };

// ============================================
// アクション定義（useReducer用）
// ============================================

export type AppAction =
  // フェーズ遷移
  | { type: 'RESOURCES_LOADED' }
  | { type: 'CALIBRATION_COMPLETE'; settings: CalibrationSettings }
  | { type: 'RECALIBRATE' }
  // 入力状態
  | { type: 'KEY_HOVER'; position: KeyPosition }
  | { type: 'TRIGGER_DETECTED'; position: KeyPosition }
  | { type: 'TRIGGER_START'; position: KeyPosition; holdPosition: { yaw: number; pitch: number } }
  | { type: 'FLICK_DETECTED'; direction: FlickDirection }
  | { type: 'TRIGGER_END' }
  | { type: 'RECOGNITION_LOST' }
  // テキスト操作
  | { type: 'CHAR_INPUT'; char: string }
  | { type: 'BACKSPACE' }
  | { type: 'TOGGLE_MODIFIER' }
  | { type: 'SPEAK_AND_CLEAR' }
  // 設定変更
  | { type: 'SET_KEYBOARD_MODE'; modeId: string }
  | { type: 'SET_FACE_DISPLAY_MODE'; mode: 'none' | 'vrm' }
  // エラー
  | { type: 'SET_ERROR'; error: AppError }
  | { type: 'CLEAR_ERROR' };

// ============================================
// ユーティリティ型
// ============================================

export interface HeadRotationSample {
  yaw: number;
  pitch: number;
  timestamp: number;
}
