import { useEffect, useState, useRef } from 'react';
import { CalibrationSettings, AppError, HeadRotationSample } from '../types';
import {
  DEFAULT_TRIGGER_THRESHOLD,
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

type CalibrationStep = 'neutral' | 'transition' | 'range' | 'complete';

// Blendshapeサンプルの型（jawOpen, mouthPucker, browInnerUpを含む）
export interface BlendshapeSample {
  jawOpen: number;
  mouthPucker: number;
  browInnerUp: number;
}

interface CalibrationOverlayProps {
  samples: HeadRotationSample[];
  blendshapeSamples: BlendshapeSample[];
  onComplete: (settings: CalibrationSettings) => void;
}

const NEUTRAL_DURATION_MS = 2000;    // 正面測定
const TRANSITION_DURATION_MS = 1500; // ステップ間インターバル
const RANGE_DURATION_MS = 3000;      // 可動域測定

export function CalibrationOverlay({
  samples,
  blendshapeSamples,
  onComplete,
}: CalibrationOverlayProps) {
  const [step, setStep] = useState<CalibrationStep>('neutral');
  const [stepStartTime, setStepStartTime] = useState(() => Date.now());
  const [progress, setProgress] = useState(0);

  // 各ステップで収集したデータ
  const neutralSamplesRef = useRef<HeadRotationSample[]>([]);
  const neutralBlendshapesRef = useRef<BlendshapeSample[]>([]);
  const rangeSamplesRef = useRef<HeadRotationSample[]>([]);
  const completedRef = useRef(false);

  // ステップの説明
  const stepInfo: Record<CalibrationStep, { title: string; instruction: string; duration: number }> = {
    neutral: { title: '1/2', instruction: '正面を向いてリラックス', duration: NEUTRAL_DURATION_MS },
    transition: { title: '', instruction: '次のステップへ...', duration: TRANSITION_DURATION_MS },
    range: { title: '2/2', instruction: '顔を上下左右にゆっくり動かす', duration: RANGE_DURATION_MS },
    complete: { title: '完了', instruction: '設定を保存しています...', duration: 0 },
  };

  useEffect(() => {
    if (completedRef.current || step === 'complete') return;

    const duration = stepInfo[step].duration;
    const elapsed = Date.now() - stepStartTime;
    const progressPercent = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
    setProgress(progressPercent);

    // 現在のステップにサンプルを追加
    if (step === 'neutral') {
      if (samples.length > 0) {
        const latestSamples = samples.slice(-5);
        neutralSamplesRef.current.push(...latestSamples);
      }
      if (blendshapeSamples.length > 0) {
        const latestBlendshapes = blendshapeSamples.slice(-5);
        neutralBlendshapesRef.current.push(...latestBlendshapes);
      }
    } else if (step === 'range') {
      if (samples.length > 0) {
        const latestSamples = samples.slice(-5);
        rangeSamplesRef.current.push(...latestSamples);
      }
    }

    // ステップ完了判定
    if (elapsed >= duration) {
      if (step === 'neutral') {
        setStep('transition');
        setStepStartTime(Date.now());
        setProgress(0);
      } else if (step === 'transition') {
        setStep('range');
        setStepStartTime(Date.now());
        setProgress(0);
      } else if (step === 'range') {
        setStep('complete');
        completedRef.current = true;

        // キャリブレーション設定を計算
        const settings = calculateCalibrationSettingsFromSteps(
          neutralSamplesRef.current,
          rangeSamplesRef.current,
          neutralBlendshapesRef.current
        );
        onComplete(settings);
      }
    }
  }, [samples, blendshapeSamples, step, stepStartTime, onComplete]);

  const info = stepInfo[step];

  return (
    <div className="absolute inset-0 bg-gray-900/80 flex flex-col items-center justify-center z-40">
      <div className="bg-gray-800/90 rounded-xl p-8 max-w-sm w-full mx-4 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white text-center mb-2">
          キャリブレーション
        </h2>
        {info.title && (
          <p className="text-blue-400 text-sm text-center mb-4">{info.title}</p>
        )}

        <p className="text-gray-300 text-center mb-6 text-lg">
          {info.instruction}
        </p>

        {/* 進捗バー（transitionステップでは非表示） */}
        {step !== 'transition' && (
          <div className="mb-4">
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ステップインジケーター */}
        <div className="flex justify-center gap-2 mt-4">
          {['neutral', 'range'].map((s) => {
            const stepOrder = ['neutral', 'transition', 'range', 'complete'];
            const currentIndex = stepOrder.indexOf(step);
            const targetIndex = stepOrder.indexOf(s);

            return (
              <div
                key={s}
                className={`w-3 h-3 rounded-full ${
                  step === s
                    ? 'bg-blue-500'
                    : currentIndex > targetIndex
                    ? 'bg-green-500'
                    : 'bg-gray-600'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 中央値を計算するヘルパー関数
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function calculateCalibrationSettingsFromSteps(
  neutralSamples: HeadRotationSample[],
  rangeSamples: HeadRotationSample[],
  neutralBlendshapes: BlendshapeSample[]
): CalibrationSettings {
  // 正面位置の平均を計算
  const baseYaw = neutralSamples.length > 0
    ? neutralSamples.reduce((a, b) => a + b.yaw, 0) / neutralSamples.length
    : 0;
  const basePitch = neutralSamples.length > 0
    ? neutralSamples.reduce((a, b) => a + b.pitch, 0) / neutralSamples.length
    : 0;

  // 可動域を計算（上下左右同時に収集したデータから）
  const pitches = rangeSamples.map((s) => s.pitch);
  const yaws = rangeSamples.map((s) => s.yaw);

  const measuredPitchMin = pitches.length > 0 ? Math.min(...pitches) : basePitch - 12;
  const measuredPitchMax = pitches.length > 0 ? Math.max(...pitches) : basePitch + 12;
  const yawMin = yaws.length > 0 ? Math.min(...yaws) : baseYaw - 15;
  const yawMax = yaws.length > 0 ? Math.max(...yaws) : baseYaw + 15;

  // pitchRangeを「な」キー（2段目中央）に配置するようシフト
  // 4行のうち2行目（row=1）の中央 = 全体の 3/8 の位置
  const measuredPitchRange = measuredPitchMax - measuredPitchMin;
  const idealPitchMin = basePitch - measuredPitchRange * 3 / 8;
  const idealPitchMax = basePitch + measuredPitchRange * 5 / 8;

  // 可動域内にクランプ
  const pitchMin = Math.max(measuredPitchMin, idealPitchMin);
  const pitchMax = Math.min(measuredPitchMax, idealPitchMax);

  // 口と眉のベース値（中央値で計算）
  const jawOpenBaseValue = median(neutralBlendshapes.map((s) => s.jawOpen));
  const mouthPuckerBaseValue = median(neutralBlendshapes.map((s) => s.mouthPucker));
  const browInnerUpBaseValue = median(neutralBlendshapes.map((s) => s.browInnerUp));

  // 終了閾値を計算（ベース値 × 1.5、ただし開始閾値を超えないようクランプ）
  const maxEndThreshold = DEFAULT_TRIGGER_THRESHOLD - 0.1;
  const jawOpenEndThreshold = Math.min(jawOpenBaseValue * 1.5, maxEndThreshold);
  const mouthPuckerEndThreshold = Math.min(mouthPuckerBaseValue * 1.5, maxEndThreshold);
  // 終了閾値は2つのうち大きい方を使用
  const triggerEndThreshold = Math.max(jawOpenEndThreshold, mouthPuckerEndThreshold, 0.1);

  return {
    baseYaw,
    basePitch,
    yawRange: { min: yawMin, max: yawMax },
    pitchRange: { min: pitchMin, max: pitchMax },
    triggerThreshold: DEFAULT_TRIGGER_THRESHOLD,
    triggerEndThreshold,
    jawOpenBaseValue,
    mouthPuckerBaseValue,
    smileThreshold: SMILE_THRESHOLD,
    browInnerUpThreshold: 0.2,
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
  isSpeaking?: boolean;
}

export function TextDisplay({ text, previewChar, isSpeaking = false }: TextDisplayProps) {
  return (
    <div className="bg-gray-800/60 backdrop-blur-sm rounded-lg p-4 min-h-[60px] relative overflow-hidden">
      {isSpeaking ? (
        // 読み上げ中は波形アニメーションを表示
        <WaveformAnimation />
      ) : (
        <p className="text-white text-xl font-medium break-all leading-relaxed line-clamp-2">
          {text}
          {previewChar && (
            <span className="text-yellow-400 animate-pulse">{previewChar}</span>
          )}
          <span className="animate-pulse text-gray-400">|</span>
        </p>
      )}
    </div>
  );
}

// ============================================
// 波形アニメーション（読み上げ中に表示）
// ============================================

function WaveformAnimation() {
  const barCount = 12;

  return (
    <div className="flex items-center justify-center h-10 gap-1">
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          className="w-1 bg-blue-400 rounded-full animate-waveform"
          style={{
            height: '100%',
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes waveform {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        .animate-waveform {
          animation: waveform 0.5s ease-in-out infinite;
          transform-origin: center;
        }
      `}</style>
    </div>
  );
}
