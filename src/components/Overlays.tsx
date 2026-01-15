import { useEffect, useState, useRef } from 'react';
import { CalibrationSettings, AppError, HeadRotationSample } from '../types';
import {
  CALIBRATION_MIN_MS,
  CALIBRATION_MAX_MS,
  CALIBRATION_STABILITY_THRESHOLD,
  DEFAULT_TRIGGER_THRESHOLD,
  DEFAULT_TRIGGER_END_THRESHOLD,
  SMILE_THRESHOLD,
  GRID_SENSITIVITY,
  FLICK_SENSITIVITY,
} from '../utils/keyboard-layout';

// ============================================
// ローディングオーバーレイ
// ============================================

interface LoadingOverlayProps {
  cameraReady: boolean;
  faceReady: boolean;
  vrmReady: boolean;
}

export function LoadingOverlay({
  cameraReady,
  faceReady,
  vrmReady,
}: LoadingOverlayProps) {
  const items = [
    { label: 'カメラ', ready: cameraReady },
    { label: '顔認識', ready: faceReady },
    { label: 'アバター', ready: vrmReady },
  ];

  return (
    <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center z-50">
      <h1 className="text-3xl font-bold text-white mb-8">FaceFlick</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div
              className={`w-4 h-4 rounded-full ${
                item.ready ? 'bg-green-500' : 'bg-gray-600 animate-pulse'
              }`}
            />
            <span className={item.ready ? 'text-white' : 'text-gray-400'}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      <p className="text-gray-500 text-sm mt-8">読み込み中...</p>
    </div>
  );
}

// ============================================
// キャリブレーションオーバーレイ
// ============================================

interface CalibrationOverlayProps {
  samples: HeadRotationSample[];
  blendshapeSamples: { browInnerUp: number }[];
  onComplete: (settings: CalibrationSettings) => void;
}

export function CalibrationOverlay({
  samples,
  blendshapeSamples,
  onComplete,
}: CalibrationOverlayProps) {
  const [startTime] = useState(() => Date.now());
  const [progress, setProgress] = useState(0);
  const [stability, setStability] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    const elapsed = Date.now() - startTime;
    const progressPercent = Math.min(100, (elapsed / CALIBRATION_MAX_MS) * 100);
    setProgress(progressPercent);

    // 安定度を計算（直近のサンプルの標準偏差）
    if (samples.length >= 10) {
      const recent = samples.slice(-30);
      const yawValues = recent.map((s) => s.yaw);
      const pitchValues = recent.map((s) => s.pitch);

      const yawStd = standardDeviation(yawValues);
      const pitchStd = standardDeviation(pitchValues);
      const maxStd = Math.max(yawStd, pitchStd);

      // 安定度を0-100%で表現（閾値以下で100%）
      const stabilityPercent = Math.min(
        100,
        (1 - maxStd / (CALIBRATION_STABILITY_THRESHOLD * 2)) * 100
      );
      setStability(Math.max(0, stabilityPercent));

      // 完了判定
      if (!completedRef.current) {
        const isStable = maxStd < CALIBRATION_STABILITY_THRESHOLD;
        const minTimeReached = elapsed >= CALIBRATION_MIN_MS;
        const maxTimeReached = elapsed >= CALIBRATION_MAX_MS;

        if ((isStable && minTimeReached) || maxTimeReached) {
          completedRef.current = true;
          const settings = calculateCalibrationSettings(samples, blendshapeSamples);
          onComplete(settings);
        }
      }
    }
  }, [samples, blendshapeSamples, startTime, onComplete]);

  return (
    <div className="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center z-40">
      <div className="bg-gray-800/90 rounded-xl p-8 max-w-sm w-full mx-4 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white text-center mb-6">
          キャリブレーション
        </h2>

        <p className="text-gray-300 text-center mb-6">
          正面を向いて、リラックスしてください
        </p>

        {/* 進捗バー */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>進捗</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 安定度バー */}
        <div>
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>安定度</span>
            <span>{Math.round(stability)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                stability > 80 ? 'bg-green-500' : stability > 50 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${stability}%` }}
            />
          </div>
        </div>

        <p className="text-gray-500 text-xs text-center mt-6">
          安定すると自動で完了します
        </p>
      </div>
    </div>
  );
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

function calculateCalibrationSettings(
  samples: HeadRotationSample[],
  blendshapeSamples: { browInnerUp: number }[]
): CalibrationSettings {
  const yawValues = samples.map((s) => s.yaw);
  const pitchValues = samples.map((s) => s.pitch);

  const baseYaw = yawValues.reduce((a, b) => a + b, 0) / yawValues.length;
  const basePitch = pitchValues.reduce((a, b) => a + b, 0) / pitchValues.length;

  // 標準偏差から範囲を推定（3シグマルール）
  const yawStd = standardDeviation(yawValues);
  const pitchStd = standardDeviation(pitchValues);

  // 範囲をデフォルト設定（全4段にアクセスできるよう上下は広めに）
  const yawRange = {
    min: baseYaw - Math.max(20, yawStd * 3),
    max: baseYaw + Math.max(20, yawStd * 3),
  };
  const pitchRange = {
    min: basePitch - Math.max(25, pitchStd * 3), // 上方向（1段目）
    max: basePitch + Math.max(25, pitchStd * 3), // 下方向（4段目）
  };

  // 眉のベース値
  const browValues = blendshapeSamples.map((s) => s.browInnerUp);
  const browInnerUpBaseValue =
    browValues.length > 0
      ? browValues.reduce((a, b) => a + b, 0) / browValues.length
      : 0;

  return {
    baseYaw,
    basePitch,
    yawRange,
    pitchRange,
    triggerThreshold: DEFAULT_TRIGGER_THRESHOLD,
    triggerEndThreshold: DEFAULT_TRIGGER_END_THRESHOLD,
    smileThreshold: SMILE_THRESHOLD,
    browInnerUpThreshold: 0.2, // ベース値からの差分
    browInnerUpBaseValue,
    gridSensitivity: GRID_SENSITIVITY,
    flickSensitivity: FLICK_SENSITIVITY,
  };
}

// ============================================
// エラーオーバーレイ
// ============================================

interface ErrorOverlayProps {
  error: AppError;
  onRetry?: () => void;
}

export function ErrorOverlay({ error, onRetry }: ErrorOverlayProps) {
  const getMessage = () => {
    switch (error.type) {
      case 'camera_denied':
        return 'カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可してください。';
      case 'camera_not_found':
        return 'カメラが見つかりません。カメラが接続されているか確認してください。';
      case 'face_landmarker_failed':
        return `顔認識の初期化に失敗しました: ${error.message}`;
      case 'vrm_load_failed':
        return `アバターの読み込みに失敗しました: ${error.message}`;
      case 'face_lost':
        return '顔が検出できません。カメラに顔が映るようにしてください。';
      default:
        return '予期しないエラーが発生しました。';
    }
  };

  return (
    <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center z-50">
      <div className="bg-red-900/50 border border-red-500 rounded-xl p-6 max-w-sm mx-4">
        <h2 className="text-xl font-bold text-red-400 mb-4">エラー</h2>
        <p className="text-gray-300 mb-6">{getMessage()}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors"
          >
            再試行
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================
// テキスト表示エリア
// ============================================

interface TextDisplayProps {
  text: string;
  previewChar: string | null;
}

export function TextDisplay({ text, previewChar }: TextDisplayProps) {
  return (
    <div className="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 min-h-[60px]">
      <p className="text-white text-xl font-medium break-all leading-relaxed line-clamp-2">
        {text}
        {previewChar && (
          <span className="text-yellow-400 animate-pulse">{previewChar}</span>
        )}
        <span className="animate-pulse text-gray-400">|</span>
      </p>
    </div>
  );
}
