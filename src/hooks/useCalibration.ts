import { useState, useRef, useCallback } from 'react';
import { CalibrationSettings } from '../types';
import {
  JAW_OPEN_THRESHOLD,
  MOUTH_PUCKER_THRESHOLD,
  SMILE_THRESHOLD,
  GRID_SENSITIVITY,
  FLICK_SENSITIVITY,
} from '../utils/keyboard-layout';

export interface CalibrationSample {
  yaw: number;
  pitch: number;
  roll: number;
  jawOpen: number;
  mouthPucker: number;
  browInnerUp: number;
}

const DEFAULT_CALIBRATION_SETTINGS: CalibrationSettings = {
  yawRange: { min: -20, max: 20 },
  pitchRange: { min: -1, max: 10 },
  jawOpenThreshold: JAW_OPEN_THRESHOLD,
  mouthPuckerThreshold: MOUTH_PUCKER_THRESHOLD,
  smileThreshold: SMILE_THRESHOLD,
  browInnerUpThreshold: 0.5,
  gridSensitivity: GRID_SENSITIVITY,
  flickSensitivity: FLICK_SENSITIVITY,
};

const CALIBRATION_DURATION_MS = 3000;

/**
 * キャリブレーション処理を管理するカスタムフック
 */
export function useCalibration() {
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationSettings, setCalibrationSettings] = useState<CalibrationSettings>(
    DEFAULT_CALIBRATION_SETTINGS
  );

  const calibrationStartTimeRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<CalibrationSample[]>([]);
  const baseYawRef = useRef<number | null>(null);
  const basePitchRef = useRef<number | null>(null);

  /**
   * サンプルを追加する
   */
  const addSample = useCallback((sample: CalibrationSample) => {
    calibrationSamplesRef.current.push(sample);
  }, []);

  /**
   * キャリブレーション処理を実行する（毎フレーム呼び出す）
   * @returns キャリブレーションが完了したかどうか
   */
  const processCalibration = useCallback((): boolean => {
    const now = Date.now();

    if (calibrationStartTimeRef.current === null) {
      calibrationStartTimeRef.current = now;
    }

    const elapsedTime = now - calibrationStartTimeRef.current;
    const progress = Math.min(100, (elapsedTime / CALIBRATION_DURATION_MS) * 100);
    setCalibrationProgress(progress);

    if (elapsedTime >= CALIBRATION_DURATION_MS) {
      // 3秒経過：平均値を計算して基準値として設定
      const samples = calibrationSamplesRef.current;

      if (samples.length > 0) {
        const avgYaw = samples.reduce((sum, s) => sum + s.yaw, 0) / samples.length;
        const avgPitch = samples.reduce((sum, s) => sum + s.pitch, 0) / samples.length;

        baseYawRef.current = avgYaw;
        basePitchRef.current = avgPitch;

        // 口のベース値を中央値で計算
        const median = (arr: number[]) => {
          const sorted = [...arr].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        };

        const jawOpenBaseValue = median(samples.map(s => s.jawOpen));
        const mouthPuckerBaseValue = median(samples.map(s => s.mouthPucker));
        const browInnerUpBaseValue = median(samples.map(s => s.browInnerUp));

        // 終了閾値をベース値 + 0.1 で初期化
        const jawOpenEndThreshold = jawOpenBaseValue + 0.1;
        const mouthPuckerEndThreshold = mouthPuckerBaseValue + 0.1;

        // 眉を上げる閾値をベース値 + 0.2 で初期化
        const browInnerUpThreshold = browInnerUpBaseValue + 0.2;

        // yawRange/pitchRangeを設定
        const yawRange = { min: avgYaw - 20, max: avgYaw + 20 };
        const pitchTotalRange = 11;
        const pitchRange = {
          min: avgPitch - pitchTotalRange * 3 / 8,
          max: avgPitch + pitchTotalRange * 5 / 8,
        };

        // CalibrationSettingsを更新
        setCalibrationSettings(prev => ({
          ...prev,
          yawRange,
          pitchRange,
          jawOpenBaseValue,
          mouthPuckerBaseValue,
          browInnerUpBaseValue,
          jawOpenEndThreshold,
          mouthPuckerEndThreshold,
          browInnerUpThreshold,
        }));

        console.log('キャリブレーション完了:');
        console.log('  基準Yaw =', avgYaw.toFixed(2), '度');
        console.log('  基準Pitch =', avgPitch.toFixed(2), '度');
        console.log('  Yaw範囲 =', yawRange.min.toFixed(2), '〜', yawRange.max.toFixed(2), '度');
        console.log('  Pitch範囲 =', pitchRange.min.toFixed(2), '〜', pitchRange.max.toFixed(2), '度');
        console.log('  口開けベース =', jawOpenBaseValue.toFixed(3));
        console.log('  口すぼめベース =', mouthPuckerBaseValue.toFixed(3));
        console.log('  口開け終了閾値 =', jawOpenEndThreshold.toFixed(3));
        console.log('  口すぼめ終了閾値 =', mouthPuckerEndThreshold.toFixed(3));
        console.log('  眉上げベース =', browInnerUpBaseValue.toFixed(3));
        console.log('  眉上げ閾値 =', browInnerUpThreshold.toFixed(3));
      } else {
        console.log('キャリブレーション完了（サンプルなし・デフォルト値を使用）');
        baseYawRef.current = 0;
        basePitchRef.current = 0;
      }

      setIsCalibrating(false);
      return true;
    }

    return false;
  }, []);

  /**
   * キャリブレーションをリセットして再開始する
   */
  const resetCalibration = useCallback(() => {
    calibrationStartTimeRef.current = null;
    calibrationSamplesRef.current = [];
    baseYawRef.current = null;
    basePitchRef.current = null;
    setCalibrationProgress(0);
    setIsCalibrating(true);
  }, []);

  return {
    isCalibrating,
    calibrationProgress,
    calibrationSettings,
    setCalibrationSettings,
    addSample,
    processCalibration,
    resetCalibration,
  };
}
