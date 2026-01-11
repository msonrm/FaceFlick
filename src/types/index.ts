import { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type TriggerType = 'mouth_open' | 'mouth_pucker' | null;

export interface FaceState {
  landmarks: NormalizedLandmark[];
  // Blendshapes (MediaPipe Face Landmarker)
  blendshapes: {
    jawOpen: number;        // 口を開ける (0-1)
    mouthPucker: number;    // 口すぼめ (0-1)
    mouthSmileLeft: number; // 左笑顔 (0-1)
    mouthSmileRight: number;// 右笑顔 (0-1)
    eyeBlinkLeft: number;   // 左目を閉じる (0-1)
    eyeBlinkRight: number;  // 右目を閉じる (0-1)
  };
  // どのトリガーがアクティブか
  isTriggered: boolean;
  triggerType: TriggerType;
  // 頭の回転
  headRotation: {
    yaw: number;   // 左右の回転 (-180 to 180)
    pitch: number; // 上下の回転 (-90 to 90)
    roll: number;  // 傾き (-180 to 180)
  };
}

export interface FlickKey {
  base: string;
  up?: string;
  down?: string;
  left?: string;
  right?: string;
}

export type FlickDirection = 'up' | 'down' | 'left' | 'right' | null;

export type InputState =
  | { type: 'idle' }
  | { type: 'selecting'; key: FlickKey; triggerType: TriggerType; holdPosition: { yaw: number; pitch: number } }
  | { type: 'flicking'; key: FlickKey; direction: FlickDirection; triggerType: TriggerType; holdPosition: { yaw: number; pitch: number } };

export interface KeyboardLayout {
  rows: FlickKey[][];
}

export interface CalibrationSettings {
  // 顔の向きの範囲
  yawRange: { min: number; max: number };
  pitchRange: { min: number; max: number };
  // トリガーの閾値 (Blendshapes: 0-1)
  jawOpenThreshold: number;       // 口を開ける - 開始閾値 (デフォルト: 0.5)
  mouthPuckerThreshold: number;   // 口すぼめ - 開始閾値 (デフォルト: 0.4)
  smileThreshold: number;         // 笑顔 (デフォルト: 0.6) - 読み上げ&クリア用
  // 口のベース値（キャリブレーション時の閉じた口の値）
  jawOpenBaseValue?: number;      // 口を開ける - ベース値（終了閾値 = baseValue + 0.1）
  mouthPuckerBaseValue?: number;  // 口すぼめ - ベース値（終了閾値 = baseValue + 0.1）
  // グリッド・フリック感度
  gridSensitivity: number;
  flickSensitivity: number;
}
