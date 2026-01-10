import { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type TriggerType = 'mouth_open' | 'mouth_pucker' | 'eyes_wide' | 'smile' | 'cheek_puff' | null;

export interface FaceState {
  landmarks: NormalizedLandmark[];
  // Blendshapes (MediaPipe Face Landmarker)
  blendshapes: {
    jawOpen: number;        // 口を開ける (0-1)
    mouthPucker: number;    // キス顔 (0-1)
    eyeWideLeft: number;    // 左目を見開く (0-1)
    eyeWideRight: number;   // 右目を見開く (0-1)
    mouthSmileLeft: number; // 左笑顔 (0-1)
    mouthSmileRight: number;// 右笑顔 (0-1)
    cheekPuff: number;      // 頬を膨らませる (0-1)
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
  jawOpenThreshold: number;       // 口を開ける (デフォルト: 0.5)
  mouthPuckerThreshold: number;   // キス顔 (デフォルト: 0.4)
  eyesWideThreshold: number;      // 目を見開く (デフォルト: 0.3)
  smileThreshold: number;         // 笑顔 (デフォルト: 0.6)
  cheekPuffThreshold: number;     // 頬を膨らませる (デフォルト: 0.4)
  // グリッド・フリック感度
  gridSensitivity: number;
  flickSensitivity: number;
}
