import { useEffect, useRef, useState } from 'react';
import { useFaceLandmarker } from '../hooks/useFaceLandmarker';
import { useCamera } from '../hooks/useCamera';
import { useRecording } from '../hooks/useRecording';
import { useVRMAvatar } from '../hooks/useVRMAvatar';
import { useThreeScene } from '../hooks/useThreeScene';
import { analyzeFace } from '../utils/face-detection';
import {
  getSelectedKey,
  getFlickDirection,
  getCharFromFlick,
} from '../utils/input-logic';
import {
  JAW_OPEN_THRESHOLD,
  MOUTH_PUCKER_THRESHOLD,
  SMILE_THRESHOLD,
  GRID_SENSITIVITY,
  FLICK_SENSITIVITY,
} from '../utils/keyboard-layout';
import { InputState, CalibrationSettings } from '../types';
import { CalibrationModal } from './CalibrationModal';
import { Toolbar } from './Toolbar';
import { DebugPanel } from './DebugPanel';
import {
  drawKeyboard,
  drawFaceLandmarks,
  drawInputText,
  UI_LAYOUT,
} from '../utils/canvas';
import type { FaceDisplayMode, GestureFeedback, DebugInfo } from '../utils/canvas';
import { toggleCharacter, vibrate } from '../utils/character-utils';
import { speakText } from '../utils/speech';
import { detectGesture, HeadRotationSample } from '../utils/gesture-detection';
import { applyMediaPipeToVRM } from '../utils/vrm';

export function FaceFlickCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWebGLRef = useRef<HTMLCanvasElement>(null);
  const { video, isReady: cameraReady, error: cameraError } = useCamera();
  const {
    isReady: landmarkerReady,
    error: landmarkerError,
    detectFace,
  } = useFaceLandmarker();
  const { isRecording, startRecording, stopRecording } = useRecording();

  // VRM関連
  const { vrm, isLoading: vrmLoading, error: vrmError } = useVRMAvatar({
    modelUrl: '/models/avatar.vrm'
  });
  const { render: renderVRM, forceResize } = useThreeScene({
    canvasRef: canvasWebGLRef,
    vrm
  });

  // レンダリングカウンター（デバッグ用）
  const renderCountRef = useRef(0);
  const [renderCount, setRenderCount] = useState(0);

  const [inputState, setInputState] = useState<InputState>({ type: 'idle' });
  const [inputText, setInputText] = useState('');
  const [currentFaceState, setCurrentFaceState] = useState<any>(null);
  const [smoothedFaceState, setSmoothedFaceState] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [faceDisplayMode, setFaceDisplayMode] = useState<FaceDisplayMode>('points');
  const [gestureFeedback, setGestureFeedback] = useState<GestureFeedback | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(true);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationSettings, setCalibrationSettings] = useState<CalibrationSettings>({
    yawRange: { min: -20, max: 20 },
    pitchRange: { min: -1, max: 10 },
    jawOpenThreshold: JAW_OPEN_THRESHOLD,
    mouthPuckerThreshold: MOUTH_PUCKER_THRESHOLD,
    smileThreshold: SMILE_THRESHOLD,
    browInnerUpThreshold: 0.5,
    gridSensitivity: GRID_SENSITIVITY,
    flickSensitivity: FLICK_SENSITIVITY,
  });

  // VRMロード状態をログ出力（デバッグ用）
  useEffect(() => {
    console.log('[VRM] Loading:', vrmLoading, 'VRM:', !!vrm, 'Error:', vrmError);
  }, [vrmLoading, vrm, vrmError]);

  // VRMモードに切り替わったタイミングでリサイズを強制実行
  useEffect(() => {
    if (faceDisplayMode === 'vrm' && forceResize) {
      console.log('[VRM Mode] Forcing resize...');
      // 少し遅延させて、DOMレイアウトが確定するのを待つ
      setTimeout(() => {
        forceResize();
      }, 100);
      setTimeout(() => {
        forceResize();
      }, 500);
      setTimeout(() => {
        forceResize();
      }, 1000);
    }
  }, [faceDisplayMode, forceResize]);
  const animationFrameRef = useRef<number | null>(null);
  const triggerStartTimeRef = useRef<number | null>(null);
  const headRotationHistoryRef = useRef<HeadRotationSample[]>([]);
  const lastGestureTimeRef = useRef<number>(0);
  const calibrationStartTimeRef = useRef<number | null>(null);
  const calibrationSamplesRef = useRef<{ yaw: number; pitch: number; roll: number; jawOpen: number; mouthPucker: number; browInnerUp: number }[]>([]);
  const baseYawRef = useRef<number | null>(null);
  const basePitchRef = useRef<number | null>(null);
  const smoothedHeadRotationRef = useRef<{ yaw: number; pitch: number; roll: number } | null>(null);
  const browRaiseStartTimeRef = useRef<number | null>(null);
  const hasVibratedBrowRef = useRef<boolean>(false);
  const smileStartTimeRef = useRef<number | null>(null);
  const hasVibratedSmileRef = useRef<boolean>(false);
  const lastConfirmTimeRef = useRef<number | null>(null); // 文字確定時刻を記録（連続入力防止用）
  const faceDetectionLostTimeRef = useRef<number | null>(null); // 顔認識が切れた時刻
  const lastDetectedFaceStateRef = useRef<any>(null); // 最後に検出された顔の状態（表示保持用）
  const lastDetectedResultRef = useRef<any>(null); // 最後に検出された result（表示保持用）
  const prevTriggerStateRef = useRef<{ isTriggered: boolean; triggerType?: any } | undefined>(undefined); // 前フレームのトリガー状態（ヒステリシス用）
  const triggerStartPositionRef = useRef<{ yaw: number; pitch: number } | null>(null); // トリガー開始時の顔位置（フォーカス固定用）
  const prevBlendshapesRef = useRef<{ jawOpen: number; mouthPucker: number; mouthSmileLeft: number; mouthSmileRight: number; eyeBlinkLeft: number; eyeBlinkRight: number; browInnerUp: number } | undefined>(undefined); // 前フレームのBlendshapes（平滑化用）
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 }); // Canvas サイズキャッシュ（パフォーマンス最適化用）
  const prevDebugInfoRef = useRef<string>(''); // デバッグ情報のキャッシュ（変化検出用）
  const prevFaceStateKeyRef = useRef<string>(''); // FaceStateのキャッシュ（変化検出用）

  // パフォーマンス最適化: animate関数内で最新の値を参照するためのref
  const inputStateRef = useRef(inputState);
  const inputTextRef = useRef(inputText);
  const calibrationSettingsRef = useRef(calibrationSettings);
  const faceDisplayModeRef = useRef(faceDisplayMode);
  const isCalibratingRef = useRef(isCalibrating);

  // refを最新の値で更新
  inputStateRef.current = inputState;
  inputTextRef.current = inputText;
  calibrationSettingsRef.current = calibrationSettings;
  faceDisplayModeRef.current = faceDisplayMode;
  isCalibratingRef.current = isCalibrating;

  // ジェスチャーフィードバックを自動消去
  useEffect(() => {
    if (gestureFeedback) {
      const timer = setTimeout(() => {
        setGestureFeedback(null);
      }, 1000); // 1秒後に消去

      return () => clearTimeout(timer);
    }
  }, [gestureFeedback]);

  useEffect(() => {
    if (!canvasRef.current || !video || !cameraReady || !landmarkerReady) {
      return;
    }

    function animate(timestamp: number) {
      // 毎フレームcanvasRef.currentを参照（条件付きレンダリングでCanvas再作成時に対応）
      const canvas = canvasRef.current;
      if (!canvas || !video) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // キャンバスサイズをビューポートサイズに合わせる（高DPI対応）
      // パフォーマンス最適化: サイズ変更時のみ更新
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const newWidth = rect.width * dpr;
      const newHeight = rect.height * dpr;

      // Canvas要素が再作成された場合も検出するため、canvas.width/heightも比較
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
        canvasSizeRef.current = { width: newWidth, height: newHeight };
      }

      // 高DPI用にスケーリング（setTransformで累積を防ぐ）
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // ビデオを描画（反転） - VRMモード以外で背景として表示
      if (faceDisplayModeRef.current !== 'vrm') {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -rect.width, 0, rect.width, rect.height);
        ctx.restore();
      } else {
        // VRMモード時はCanvas 2Dをクリア（透明化）
        ctx.clearRect(0, 0, rect.width, rect.height);
      }

      // 初期キャリブレーション処理（顔検出の前に実行）
      if (isCalibratingRef.current) {
        const now = Date.now();
        if (calibrationStartTimeRef.current === null) {
          calibrationStartTimeRef.current = now;
        }

        const elapsedTime = now - calibrationStartTimeRef.current;
        const progress = Math.min(100, (elapsedTime / 3000) * 100);
        setCalibrationProgress(progress);

        if (elapsedTime >= 3000) {
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

            // yawRange/pitchRangeを設定：avgYaw/avgPitchが「な」キー（中央列、2段目）の中央になるように調整
            // yawRange: 幅40度を維持、avgYawを中央列の中央に配置
            const yawRange = { min: avgYaw - 20, max: avgYaw + 20 };

            // pitchRange: 幅11度を維持、avgPitchを2段目の中央に配置
            // 2段目（row=1）は全体の3/8の位置（4分割の2番目の中央）
            const pitchTotalRange = 11;
            const pitchRange = {
              min: avgPitch - pitchTotalRange * 3 / 8,  // avgPitch - 4.125
              max: avgPitch + pitchTotalRange * 5 / 8,  // avgPitch + 6.875
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
        }
      }

      // 顔検出
      const result = detectFace(video, timestamp);
      const now = Date.now();

      if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
        const faceState = analyzeFace(result, calibrationSettingsRef.current, prevTriggerStateRef.current, prevBlendshapesRef.current);
        if (faceState) {
          // 次フレーム用にトリガー状態を保存
          prevTriggerStateRef.current = {
            isTriggered: faceState.isTriggered,
            triggerType: faceState.triggerType,
          };
          // 次フレーム用にBlendshapesを保存（平滑化用）
          prevBlendshapesRef.current = {
            jawOpen: faceState.blendshapes.jawOpen,
            mouthPucker: faceState.blendshapes.mouthPucker,
            mouthSmileLeft: faceState.blendshapes.mouthSmileLeft,
            mouthSmileRight: faceState.blendshapes.mouthSmileRight,
            eyeBlinkLeft: faceState.blendshapes.eyeBlinkLeft,
            eyeBlinkRight: faceState.blendshapes.eyeBlinkRight,
            browInnerUp: faceState.blendshapes.browInnerUp,
          };
          // 顔が検出されたので、認識切れタイマーをリセット
          faceDetectionLostTimeRef.current = null;

          // 最後に検出された状態を保存（表示保持用）
          lastDetectedFaceStateRef.current = faceState;
          lastDetectedResultRef.current = result;

          // 現在の顔の状態を保存（パフォーマンス最適化: 重要な値が変化したときのみ更新）
          const faceStateKey = `${faceState.isTriggered}-${faceState.triggerType}-${Math.round(faceState.headRotation.yaw)}-${Math.round(faceState.headRotation.pitch)}`;
          if (faceStateKey !== prevFaceStateKeyRef.current) {
            setCurrentFaceState(faceState);
            prevFaceStateKeyRef.current = faceStateKey;
          }

          // デバッグ情報を更新（パフォーマンス最適化: 値が変化したときのみ更新）
          const allBlendshapes = result.faceBlendshapes && result.faceBlendshapes.length > 0
            ? result.faceBlendshapes[0].categories.map(b => ({
                name: b.categoryName,
                value: b.score
              }))
            : [];

          const debugKey = `${faceState.triggerType}-${Math.round(faceState.headRotation.yaw)}-${Math.round(faceState.headRotation.pitch)}-${Math.round(faceState.blendshapes.jawOpen * 100)}-${Math.round(faceState.blendshapes.mouthPucker * 100)}`;
          if (debugKey !== prevDebugInfoRef.current) {
            setDebugInfo({
              blendshapes: faceState.blendshapes,
              allBlendshapes,
              triggerType: faceState.triggerType || 'none',
              headRotation: faceState.headRotation,
            });
            prevDebugInfoRef.current = debugKey;
          }

          // キャリブレーション中はサンプリングのみ実行
          if (isCalibratingRef.current) {
            calibrationSamplesRef.current.push({
              yaw: faceState.headRotation.yaw,
              pitch: faceState.headRotation.pitch,
              roll: faceState.headRotation.roll,
              jawOpen: faceState.blendshapes.jawOpen,
              mouthPucker: faceState.blendshapes.mouthPucker,
              browInnerUp: faceState.blendshapes.browInnerUp,
            });
          } else {
            // 入力ロジック
            processInput(faceState);
          }

          // 顔の表示（モードに応じて）
          if (faceDisplayModeRef.current !== 'none') {
            if (faceDisplayModeRef.current === 'vrm') {
              // VRMモード: MediaPipeの結果をVRMに適用
              if (vrm) {
                applyMediaPipeToVRM(vrm, result);
              }
            } else {
              // ポイント/メッシュモード: 2Dランドマークを描画
              drawFaceLandmarks({
                ctx,
                landmarks: faceState.landmarks,
                width: rect.width,
                height: rect.height,
                displayMode: faceDisplayModeRef.current,
              });
            }
          }
        }
      } else {
        // 顔が検出されない場合
        if (faceDetectionLostTimeRef.current === null) {
          // 初めて認識が切れた時刻を記録
          faceDetectionLostTimeRef.current = now;
        } else {
          // 0.3秒経過したら入力状態をリセット
          const lostDuration = now - faceDetectionLostTimeRef.current;
          if (lostDuration >= 300) {
            // 入力状態をリセット（キャンセル）
            if (inputStateRef.current.type !== 'idle') {
              setInputState({ type: 'idle' });
            }
            // 各種タイマーをリセット
            triggerStartTimeRef.current = null;
            browRaiseStartTimeRef.current = null;
            smileStartTimeRef.current = null;
            lastConfirmTimeRef.current = null;
            hasVibratedBrowRef.current = false;
            hasVibratedSmileRef.current = false;
            prevBlendshapesRef.current = undefined; // 平滑化状態をリセット

            // デバッグ情報をクリア（パフォーマンス最適化: 一度だけ更新）
            if (prevDebugInfoRef.current !== 'cleared') {
              setDebugInfo({
                blendshapes: {
                  jawOpen: 0,
                  mouthPucker: 0,
                  mouthSmileLeft: 0,
                  mouthSmileRight: 0,
                  eyeBlinkLeft: 0,
                  eyeBlinkRight: 0,
                  browInnerUp: 0,
                },
                allBlendshapes: [],
                triggerType: 'none',
                headRotation: { yaw: 0, pitch: 0, roll: 0 },
              });
              prevDebugInfoRef.current = 'cleared';
            }
          }
        }

        // 最後に検出された顔の状態で描画を保持（プライバシー保護）
        if (lastDetectedFaceStateRef.current && lastDetectedResultRef.current && faceDisplayModeRef.current !== 'none') {
          if (faceDisplayModeRef.current === 'vrm') {
            // VRMモード: 最後のポーズを保持（何もしない）
            // VRMは最後に適用されたポーズを保持する
          } else {
            // ポイント/メッシュモード: 2Dランドマークを描画
            drawFaceLandmarks({
              ctx,
              landmarks: lastDetectedFaceStateRef.current.landmarks,
              width: rect.width,
              height: rect.height,
              displayMode: faceDisplayModeRef.current,
            });
          }
        }
      }

      // キーボードオーバーレイを描画（顔検出の有無に関わらず描画）
      // ただし、顔が検出されていない場合はハイライトなし
      const isFaceDetected = !!(result && result.faceLandmarks && result.faceLandmarks.length > 0);
      drawKeyboard({
        ctx,
        width: rect.width,
        height: rect.height,
        toolbarHeight: UI_LAYOUT.toolbarHeight,
        textInputHeight: UI_LAYOUT.textInputHeight,
        triggerGestureHeight: UI_LAYOUT.triggerGestureHeight,
        flickFeedbackHeight: UI_LAYOUT.flickFeedbackHeight,
        inputState: inputStateRef.current,
        smoothedFaceState: smoothedFaceState,
        calibrationSettings: calibrationSettingsRef.current,
        isFaceDetected,
        isSmileRecognizing: smileStartTimeRef.current !== null,
        isBrowRaiseRecognizing: browRaiseStartTimeRef.current !== null,
      });

      // 入力テキストを描画
      drawInputText({
        ctx,
        width: rect.width,
        height: rect.height,
        toolbarHeight: UI_LAYOUT.toolbarHeight,
        inputText: inputTextRef.current,
        inputState: inputStateRef.current,
        gestureFeedback,
        debugInfo,
        showDebugInfo,
        isSmileRecognizing: smileStartTimeRef.current !== null,
        isBrowRaiseRecognizing: browRaiseStartTimeRef.current !== null,
      });

      // VRMレンダリング
      if (faceDisplayModeRef.current === 'vrm') {
        if (vrm && renderVRM) {
          try {
            renderVRM();
            // レンダリングカウンターを更新（デバッグ用）
            renderCountRef.current++;
            if (renderCountRef.current % 60 === 0) {
              setRenderCount(renderCountRef.current);
            }
          } catch (error) {
            console.error('VRM rendering error:', error);
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, cameraReady, landmarkerReady, detectFace]); // inputState, inputText, calibrationSettings, faceDisplayModeはrefで参照

  function processInput(faceState: any) {
    const HOLD_DELAY_MS = 400; // 0.4秒のホールド遅延
    const now = Date.now();

    // 頭の回転に平滑化を適用（EMA: 指数移動平均）
    // フリック中は速く反応、通常時は滑らかに
    const alpha = inputStateRef.current.type === 'flicking' ? 0.7 : 0.4;
    if (smoothedHeadRotationRef.current === null) {
      // 初回は現在値をそのまま使用
      smoothedHeadRotationRef.current = {
        yaw: faceState.headRotation.yaw,
        pitch: faceState.headRotation.pitch,
        roll: faceState.headRotation.roll,
      };
    } else {
      // EMAで平滑化
      smoothedHeadRotationRef.current = {
        yaw: alpha * faceState.headRotation.yaw + (1 - alpha) * smoothedHeadRotationRef.current.yaw,
        pitch: alpha * faceState.headRotation.pitch + (1 - alpha) * smoothedHeadRotationRef.current.pitch,
        roll: alpha * faceState.headRotation.roll + (1 - alpha) * smoothedHeadRotationRef.current.roll,
      };
    }

    // キー選択には平滑化された頭の位置を使用
    const smoothedState = {
      ...faceState,
      headRotation: smoothedHeadRotationRef.current,
    };
    setSmoothedFaceState(smoothedState);

    // トリガー認識中はフォーカスを固定（トリガー開始位置を基準に）
    let selectedKey;
    if (faceState.isTriggered && triggerStartPositionRef.current) {
      selectedKey = getSelectedKey(smoothedState, calibrationSettingsRef.current, triggerStartPositionRef.current);
    } else {
      selectedKey = getSelectedKey(smoothedState, calibrationSettingsRef.current);
    }

    // 頭の回転履歴を更新（ジェスチャー検出用：生の値を使用）
    headRotationHistoryRef.current.push({
      yaw: faceState.headRotation.yaw,
      pitch: faceState.headRotation.pitch,
      roll: faceState.headRotation.roll,
      timestamp: now,
    });

    // 1秒以上古い履歴を削除
    headRotationHistoryRef.current = headRotationHistoryRef.current.filter(
      (h) => now - h.timestamp < 1000
    );

    // ===== 優先度付きトリガー・ジェスチャー検出 =====
    // 優先度: 1.口開け/口すぼめ > 2.首振り > 3.笑顔 > 4.目閉じ

    // 【優先度1】口開け/口すぼめ（キー入力トリガー）がアクティブな場合
    // → 他のすべてのジェスチャータイマーをリセット
    if (faceState.isTriggered) {
      browRaiseStartTimeRef.current = null;
      hasVibratedBrowRef.current = false;
      smileStartTimeRef.current = null;
      hasVibratedSmileRef.current = false;
      // キー入力処理は後続の処理で実行される
    }

    // idle状態かつトリガーなしの場合のみ、ジェスチャー検出を行う
    if (inputStateRef.current.type === 'idle' && !faceState.isTriggered && now - lastGestureTimeRef.current > 1000) {

      // 【優先度2】首を振る（バックスペース）
      const gesture = detectGesture(headRotationHistoryRef.current);
      if (gesture === 'head_shake') {
        // バックスペース実行
        setInputText((prev) => prev.slice(0, -1));
        setGestureFeedback({ type: 'backspace', timestamp: now });
        lastGestureTimeRef.current = now;
        headRotationHistoryRef.current = []; // 履歴をクリア
        vibrate();
        // 首振りが検出されたので、笑顔と眉上げのタイマーをリセット
        smileStartTimeRef.current = null;
        hasVibratedSmileRef.current = false;
        browRaiseStartTimeRef.current = null;
        hasVibratedBrowRef.current = false;
      } else {
        // 首振りがない場合のみ、笑顔と眉上げをチェック

        // 【優先度3】笑顔ジェスチャー（読み上げ&クリア）
        // 「や」のキーにハイライトがあるときのみ発動
        const isSmiling =
          selectedKey?.base === 'や' &&
          faceState.blendshapes.mouthSmileLeft >= calibrationSettingsRef.current.smileThreshold &&
          faceState.blendshapes.mouthSmileRight >= calibrationSettingsRef.current.smileThreshold;

        if (isSmiling) {
          if (smileStartTimeRef.current === null) {
            // 笑顔を始めた時刻を記録
            smileStartTimeRef.current = now;
            hasVibratedSmileRef.current = false;
            // 笑顔が始まったので眉上げタイマーをリセット
            browRaiseStartTimeRef.current = null;
            hasVibratedBrowRef.current = false;
          } else {
            // 1.5秒経過したら発声&クリア
            const smileDuration = now - smileStartTimeRef.current;
            if (smileDuration >= 1500 && !hasVibratedSmileRef.current) {
              // 読み上げ&クリア
              speakText(inputTextRef.current, 'human_high');
              setInputText('');
              setGestureFeedback({ type: 'copy_speak_clear', timestamp: now });
              lastGestureTimeRef.current = now;
              vibrate(200);
              hasVibratedSmileRef.current = true;
              smileStartTimeRef.current = null; // リセット
              return;
            }
          }
        } else {
          // 笑顔をやめたらリセット
          smileStartTimeRef.current = null;
          hasVibratedSmileRef.current = false;

          // 【優先度4】眉を上げる（読み上げ&クリア）
          // 笑顔がない場合のみチェック
          // 「や」のキーにハイライトがあるときのみ発動
          const isBrowRaised =
            selectedKey?.base === 'や' &&
            faceState.blendshapes.browInnerUp >= (calibrationSettingsRef.current.browInnerUpThreshold ?? 0.5);

          if (isBrowRaised) {
            if (browRaiseStartTimeRef.current === null) {
              // 眉を上げ始めた時刻を記録
              browRaiseStartTimeRef.current = now;
              hasVibratedBrowRef.current = false;
            } else {
              // 1.5秒経過したら発声&クリア
              const raiseDuration = now - browRaiseStartTimeRef.current;
              if (raiseDuration >= 1500 && !hasVibratedBrowRef.current) {
                // 読み上げ&クリア
                speakText(inputTextRef.current, 'human_high');
                setInputText('');
                setGestureFeedback({ type: 'copy_speak_clear', timestamp: now });
                lastGestureTimeRef.current = now;
                vibrate(200);
                hasVibratedBrowRef.current = true;
                browRaiseStartTimeRef.current = null; // リセット
                return;
              }
            }
          } else {
            // 眉を下げたら、または「や」キーから離れたらリセット
            browRaiseStartTimeRef.current = null;
            hasVibratedBrowRef.current = false;
          }
        }
      }
    }

    if (inputStateRef.current.type === 'idle') {
      // トリガーがアクティブでキーが選択されている
      if (faceState.isTriggered && selectedKey) {
        // 文字確定後のクールダウン期間をチェック（連続入力防止）
        const COOLDOWN_MS = 300; // 300ms のクールダウン
        const timeSinceLastConfirm = lastConfirmTimeRef.current ? now - lastConfirmTimeRef.current : Infinity;

        if (timeSinceLastConfirm < COOLDOWN_MS) {
          // クールダウン期間中は新しい入力を開始しない
          triggerStartTimeRef.current = null;
        } else {
          // トリガー開始時刻を記録
          if (triggerStartTimeRef.current === null) {
            triggerStartTimeRef.current = Date.now();
            // トリガー開始時の位置を記録（フォーカス固定用）
            triggerStartPositionRef.current = {
              yaw: smoothedHeadRotationRef.current!.yaw,
              pitch: smoothedHeadRotationRef.current!.pitch,
            };
          }

          // 0.4秒経過したかチェック
          const elapsedTime = Date.now() - triggerStartTimeRef.current;
          if (elapsedTime >= HOLD_DELAY_MS) {
            setInputState({
              type: 'selecting',
              key: selectedKey,
              triggerType: faceState.triggerType,
              holdPosition: triggerStartPositionRef.current!,
            });
            triggerStartTimeRef.current = null; // リセット
          }
        }
      } else {
        // トリガーが解除されたらタイマーと確定時刻をリセット
        triggerStartTimeRef.current = null;
        triggerStartPositionRef.current = null;
        lastConfirmTimeRef.current = null;
      }
    } else if (inputStateRef.current.type === 'selecting') {
      // トリガーが解除された = 入力確定
      if (!faceState.isTriggered || faceState.triggerType !== inputStateRef.current.triggerType) {
        const char = getCharFromFlick(inputStateRef.current.key, null);
        addCharacter(char);
        setInputState({ type: 'idle' });
        triggerStartTimeRef.current = null; // 保持時間をリセット
      } else {
        // トリガーを維持したまま = フリック判定（ホールド位置を基準に、平滑化された値を使用）
        const direction = getFlickDirection(smoothedState, inputStateRef.current.holdPosition, calibrationSettingsRef.current);
        if (direction) {
          setInputState({
            type: 'flicking',
            key: inputStateRef.current.key,
            direction,
            triggerType: inputStateRef.current.triggerType,
            holdPosition: inputStateRef.current.holdPosition,
          });
        }
      }
    } else if (inputStateRef.current.type === 'flicking') {
      // トリガーが解除された = フリック入力確定
      if (!faceState.isTriggered || faceState.triggerType !== inputStateRef.current.triggerType) {
        const char = getCharFromFlick(inputStateRef.current.key, inputStateRef.current.direction);
        addCharacter(char);
        setInputState({ type: 'idle' });
        triggerStartTimeRef.current = null; // 保持時間をリセット
      }
      // フリック中に方向が変わったら更新（ホールド位置を基準に、平滑化された値を使用）
      else {
        const direction = getFlickDirection(smoothedState, inputStateRef.current.holdPosition, calibrationSettingsRef.current);
        if (direction !== inputStateRef.current.direction) {
          if (direction) {
            // 方向が変わった場合
            setInputState({
              type: 'flicking',
              key: inputStateRef.current.key,
              direction,
              triggerType: inputStateRef.current.triggerType,
              holdPosition: inputStateRef.current.holdPosition,
            });
          } else {
            // 中央に戻った場合
            setInputState({
              type: 'selecting',
              key: inputStateRef.current.key,
              triggerType: inputStateRef.current.triggerType,
              holdPosition: inputStateRef.current.holdPosition,
            });
          }
        }
      }
    }
  }

  function addCharacter(char: string) {
    if (char === '⌫') {
      setInputText((prev) => prev.slice(0, -1));
      vibrate();
    } else if (char === '゛゜小') {
      // 直前の文字を濁点・半濁点・小文字・通常文字でトグル
      setInputText((prev) => {
        if (prev.length === 0) return prev;
        const lastChar = prev[prev.length - 1];
        const restText = prev.slice(0, -1);
        const newChar = toggleCharacter(lastChar);
        return restText + newChar;
      });
      vibrate();
    } else if (char) {
      setInputText((prev) => prev + char);
      vibrate();
    }
    // 文字確定時刻を記録（連続入力防止用）
    lastConfirmTimeRef.current = Date.now();
  }

  function handleRecordToggle() {
    if (!canvasRef.current) return;

    if (isRecording) {
      stopRecording();
    } else {
      startRecording(canvasRef.current);
    }
  }

  if (cameraError || landmarkerError) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-gray-900 text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">エラーが発生しました</h2>
          <p>{cameraError || landmarkerError}</p>
        </div>
      </div>
    );
  }

  if (!cameraReady || !landmarkerReady) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p>初期化中...</p>
        </div>
      </div>
    );
  }

  // キャリブレーション画面
  if (isCalibrating) {
    return (
      <div className="relative w-full h-full">
        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full h-full object-cover"
        />

        {/* キャリブレーション オーバーレイ */}
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-gray-800 text-white p-8 rounded-lg text-center max-w-md">
            <h2 className="text-2xl font-bold mb-4">初期設定</h2>
            <p className="mb-6">
              頭をまっすぐにして、口を閉じた状態で3秒間静止してください
            </p>

            {/* プログレスバー */}
            <div className="w-full bg-gray-700 rounded-full h-4 mb-4">
              <div
                className="bg-blue-500 h-4 rounded-full transition-all duration-100"
                style={{ width: `${calibrationProgress}%` }}
              ></div>
            </div>

            <p className="text-sm text-gray-400">
              {Math.ceil((100 - calibrationProgress) / 100 * 3)}秒残り
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleFaceDisplayModeChange = () => {
    setFaceDisplayMode((prev) => {
      if (prev === 'none') return 'points';
      if (prev === 'points') return 'vrm';
      return 'none';
    });
  };

  return (
    <div className="relative w-full h-full">
      {/* ツールバー */}
      <Toolbar
        isRecording={isRecording}
        onRecordToggle={handleRecordToggle}
        faceDisplayMode={faceDisplayMode}
        onFaceDisplayModeChange={handleFaceDisplayModeChange}
        showDebugInfo={showDebugInfo}
        onDebugInfoToggle={() => setShowDebugInfo((prev) => !prev)}
        onCalibrationOpen={() => setShowCalibration(true)}
      />

      {/* WebGL Canvas (VRMアバター) - 常に存在、表示制御はvisibilityで */}
      <canvas
        ref={canvasWebGLRef}
        className="absolute top-0 left-0 w-full h-full object-cover"
        style={{
          zIndex: 2,
          visibility: faceDisplayMode === 'vrm' ? 'visible' : 'hidden',
          pointerEvents: 'none'
        }}
      />

      {/* Canvas 2D (ビデオ・キーボード・UI) */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full object-cover"
        style={{ zIndex: 1, pointerEvents: 'auto' }}
      />

      {/* VRM状態表示（常に表示 - デバッグ用） */}
      <div className="absolute top-16 right-4 z-30 bg-black/80 backdrop-blur-sm rounded-lg p-3 text-white text-xs font-mono">
        <div className="font-bold text-sm text-purple-300 mb-2">VRM Status</div>
        <div className="space-y-1">
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">Loading:</span>
            <span className={vrmLoading ? 'text-yellow-400' : 'text-green-400'}>
              {vrmLoading ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">VRM Loaded:</span>
            <span className={vrm ? 'text-green-400 font-bold' : 'text-red-400'}>
              {vrm ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">Mode:</span>
            <span className="text-cyan-300">{faceDisplayMode}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">Canvas:</span>
            <span className={canvasWebGLRef.current ? 'text-green-400' : 'text-red-400'}>
              {canvasWebGLRef.current ? 'OK' : 'NG'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">Canvas Size:</span>
            <span className="text-cyan-300">
              {canvasWebGLRef.current ? `${canvasWebGLRef.current.width}x${canvasWebGLRef.current.height}` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">Layout Size:</span>
            <span className="text-cyan-300">
              {canvasWebGLRef.current ?
                `${Math.round(canvasWebGLRef.current.getBoundingClientRect().width)}x${Math.round(canvasWebGLRef.current.getBoundingClientRect().height)}`
                : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">Visibility:</span>
            <span className="text-cyan-300">
              {canvasWebGLRef.current?.style.visibility || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-300">Renders:</span>
            <span className={renderCount > 0 ? 'text-green-400' : 'text-red-400'}>
              {renderCount}
            </span>
          </div>
          {vrmError && (
            <div className="mt-2 pt-2 border-t border-gray-600">
              <span className="text-red-400">Error:</span>
              <div className="text-red-300 text-xs mt-1 break-words max-w-xs">
                {vrmError}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VRMローディング表示 */}
      {vrmLoading && faceDisplayMode === 'vrm' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="bg-black/70 backdrop-blur-md rounded-lg px-6 py-4">
            <p className="text-white text-sm">VRMモデル読み込み中...</p>
          </div>
        </div>
      )}

      {/* VRMエラー表示 */}
      {vrmError && faceDisplayMode === 'vrm' && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="bg-red-500/70 backdrop-blur-md rounded-lg px-6 py-4">
            <p className="text-white text-sm">VRMモデルの読み込みに失敗しました</p>
            <p className="text-white text-xs mt-1">{vrmError}</p>
          </div>
        </div>
      )}

      {/* デバッグパネル */}
      {showDebugInfo && (
        <DebugPanel
          debugInfo={debugInfo || {
            blendshapes: {
              jawOpen: 0,
              mouthPucker: 0,
              mouthSmileLeft: 0,
              mouthSmileRight: 0,
              eyeBlinkLeft: 0,
              eyeBlinkRight: 0,
              browInnerUp: 0,
            },
            allBlendshapes: [],
            triggerType: 'none',
            headRotation: { yaw: 0, pitch: 0, roll: 0 },
          }}
          vrmStatus={{
            isLoading: vrmLoading,
            hasVRM: !!vrm,
            error: vrmError
          }}
        />
      )}

      {/* キャリブレーションモーダル */}
      <CalibrationModal
        isOpen={showCalibration}
        onClose={() => setShowCalibration(false)}
        settings={calibrationSettings}
        onSave={setCalibrationSettings}
        currentValues={
          currentFaceState && debugInfo
            ? {
                yaw: debugInfo.headRotation.yaw,
                pitch: debugInfo.headRotation.pitch,
                blendshapes: debugInfo.blendshapes,
              }
            : null
        }
      />
    </div>
  );
}
