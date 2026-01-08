import { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface FaceState {
  landmarks: NormalizedLandmark[];
  mouthOpen: boolean;
  headRotation: {
    yaw: number;   // 左右の回転 (-180 to 180)
    pitch: number; // 上下の回転 (-90 to 90)
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
  | { type: 'selecting'; key: FlickKey }
  | { type: 'flicking'; key: FlickKey; direction: FlickDirection };

export interface KeyboardLayout {
  rows: FlickKey[][];
}
