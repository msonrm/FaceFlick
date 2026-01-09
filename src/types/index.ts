import { NormalizedLandmark } from '@mediapipe/tasks-vision';

export type TriggerType = 'mouth_open' | 'mouth_pucker' | 'wink_left' | 'wink_right' | 'cheek_puff' | null;

export interface FaceState {
  landmarks: NormalizedLandmark[];
  // EAR: Eye Aspect Ratio (目の開閉度)
  ear: {
    left: number;
    right: number;
  };
  // MAR: Mouth Aspect Ratio (口の開き具合)
  mar: number;
  // 口をすぼめている（キス顔）
  mouthPucker: number; // 0-1の値
  // 頬を膨らませている
  cheekPuff: number; // 0-1の値
  // 個別の検出結果
  mouthOpen: boolean;
  mouthPuckered: boolean;
  cheekPuffed: boolean;
  winkLeft: boolean;
  winkRight: boolean;
  bothEyesClosed: boolean;
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
  // トリガーの閾値
  mouthOpenThreshold: number;
  mouthPuckerThreshold: number;
  earThreshold: number;
  // グリッド・フリック感度
  gridSensitivity: number;
  flickSensitivity: number;
}
