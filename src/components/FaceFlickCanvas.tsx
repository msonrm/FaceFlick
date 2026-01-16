import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

// Hooks
import { useCamera } from '../hooks/useCamera';
import { useFaceLandmarker } from '../hooks/useFaceLandmarker';
import { useGLBAvatar } from '../hooks/useGLBAvatar';
import { useAppState } from '../hooks/useAppState';

// Utils
import { analyzeFace, PrevFaceState, isSmiling, isBrowRaised } from '../utils/face-detection';
import { getSelectedKeyPosition, getFlickDirection, getCharFromPosition } from '../utils/input-logic';
import { detectGesture } from '../utils/gesture-detection';
import { applyMediaPipeToGLB, CalibrationOffset, BlendshapeOverride } from '../utils/glb/applyMediaPipeToGLB';
import { getLayout, DETECTION_INTERVAL_MS, HOLD_DELAY_MS, SMILE_HOLD_MS } from '../utils/keyboard-layout';

// Components
import { Keyboard } from './Keyboard';
import { Toolbar } from './Toolbar';
import {
  LoadingOverlay,
  CalibrationOverlay,
  ErrorOverlay,
  TextDisplay,
  BlendshapeSample,
} from './Overlays';

// Types
import { HeadRotationSample, FaceState } from '../types';

export function FaceFlickCanvas() {
  const { state, actions } = useAppState();

  // リソース初期化
  const { videoRef, isReady: cameraReady, error: cameraError } = useCamera();
  const { isReady: faceReady, error: faceError, detectFace } = useFaceLandmarker();
  const { avatar, error: avatarError } = useGLBAvatar({ modelUrl: '/models/raccoon_head.glb' });

  // Three.js refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Animation & detection refs
  const animationIdRef = useRef<number>(0);
  const lastDetectionTimeRef = useRef<number>(0);
  const prevFaceStateRef = useRef<PrevFaceState>({ isTriggered: false });
  const currentFaceStateRef = useRef<FaceState | null>(null);

  // キャリブレーション用サンプル
  const [calibrationSamples, setCalibrationSamples] = useState<HeadRotationSample[]>([]);
  const [blendshapeSamples, setBlendshapeSamples] = useState<BlendshapeSample[]>([]);

  // アバター表示切替
  const [showAvatar, setShowAvatar] = useState(true);

  // 読み上げフィードバック用状態
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakClearProgress, setSpeakClearProgress] = useState<number | null>(null);
  const jawOpenOverrideRef = useRef<number | null>(null);
  const mouthAnimationRef = useRef<number | null>(null);

  // 入力状態管理用refs
  const triggerStartTimeRef = useRef<number | null>(null);
  const holdPositionRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const headRotationHistoryRef = useRef<HeadRotationSample[]>([]);
  const smileStartTimeRef = useRef<number | null>(null);
  const lastBackspaceTimeRef = useRef<number>(0); // 首振り（削除）のクールダウン用
  const smoothedHeadRotationRef = useRef<{ yaw: number; pitch: number } | null>(null); // ホバー平滑化用
  const wasRecognizedRef = useRef<boolean>(false); // 顔認識状態追跡用

  // エラーチェック
  useEffect(() => {
    if (cameraError) {
      actions.setError({
        type: cameraError.includes('denied') ? 'camera_denied' : 'camera_not_found',
      });
    } else if (faceError) {
      actions.setError({ type: 'face_landmarker_failed', message: faceError });
    } else if (avatarError) {
      actions.setError({ type: 'vrm_load_failed', message: avatarError });
    }
  }, [cameraError, faceError, avatarError, actions]);

  // リソース準備完了チェック（少し遅延させてからキャリブレーション開始）
  useEffect(() => {
    if (cameraReady && faceReady && avatar && state.phase === 'loading') {
      // 起動プロセスが安定するまで500ms待機
      const timer = setTimeout(() => {
        actions.resourcesLoaded();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [cameraReady, faceReady, avatar, state.phase, actions]);

  // Three.js初期化
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;

    // レンダラー
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    rendererRef.current = renderer;

    // シーン
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // カメラ（GLBモデル用に調整）
    const camera = new THREE.PerspectiveCamera(
      30, // FOVを広めに
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 0, 3.5); // 顔を小さく表示
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // ライト
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // リサイズ対応
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // GLBアバターをシーンに追加
  useEffect(() => {
    if (!avatar || !sceneRef.current) return;
    sceneRef.current.add(avatar.scene);
    return () => {
      if (sceneRef.current) {
        sceneRef.current.remove(avatar.scene);
      }
    };
  }, [avatar]);

  // 読み上げフィードバック: 開始
  const startSpeaking = useCallback(() => {
    setIsSpeaking(true);
  }, []);

  // 読み上げフィードバック: 終了
  const stopSpeaking = useCallback(() => {
    setIsSpeaking(false);
    jawOpenOverrideRef.current = null;
  }, []);

  // 口パクアニメーション開始（一定周期で上下）
  const startMouthAnimation = useCallback(() => {
    let phase = 0;
    const animate = () => {
      phase += 0.15; // 速度調整
      // 0.1〜0.3の範囲で上下
      const jawOpen = 0.2 + Math.sin(phase) * 0.1;
      jawOpenOverrideRef.current = jawOpen;
      mouthAnimationRef.current = requestAnimationFrame(animate);
    };
    mouthAnimationRef.current = requestAnimationFrame(animate);
  }, []);

  // 口パクアニメーション停止
  const stopMouthAnimation = useCallback(() => {
    if (mouthAnimationRef.current) {
      cancelAnimationFrame(mouthAnimationRef.current);
      mouthAnimationRef.current = null;
    }
    jawOpenOverrideRef.current = null;
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (mouthAnimationRef.current) {
        cancelAnimationFrame(mouthAnimationRef.current);
      }
    };
  }, []);

  // 入力処理
  const processInput = useCallback(
    (faceState: FaceState) => {
      if (state.phase !== 'ready' || !state.calibration) return;

      const layout = getLayout(state.keyboardModeId);
      const { headRotation, isTriggered, blendshapes } = faceState;
      const now = Date.now();

      // 頭の回転履歴を更新（ジェスチャー検出用：生の値を使用）
      headRotationHistoryRef.current.push({
        yaw: headRotation.yaw,
        pitch: headRotation.pitch,
        timestamp: now,
      });
      // 直近1秒分のみ保持
      headRotationHistoryRef.current = headRotationHistoryRef.current.filter(
        (s) => now - s.timestamp < 1000
      );

      // ホバー用に頭の回転を平滑化（EMA: 指数移動平均）
      // フリック中は速く反応、通常時は滑らかに
      const isFlicking = state.input.phase === 'selecting' || state.input.phase === 'flicking';
      const SMOOTHING_ALPHA = isFlicking ? 0.7 : 0.2;

      if (smoothedHeadRotationRef.current === null) {
        // 初回は現在値をそのまま使用
        smoothedHeadRotationRef.current = {
          yaw: headRotation.yaw,
          pitch: headRotation.pitch,
        };
      } else {
        // EMAで平滑化
        smoothedHeadRotationRef.current = {
          yaw: SMOOTHING_ALPHA * headRotation.yaw + (1 - SMOOTHING_ALPHA) * smoothedHeadRotationRef.current.yaw,
          pitch: SMOOTHING_ALPHA * headRotation.pitch + (1 - SMOOTHING_ALPHA) * smoothedHeadRotationRef.current.pitch,
        };
      }

      // キー位置計算（平滑化された値を使用）
      const keyPosition = getSelectedKeyPosition(
        smoothedHeadRotationRef.current,
        layout,
        state.calibration
      );

      // ===== 優先度付きトリガー・ジェスチャー検出 =====
      // 優先度: 1.口開け/口すぼめ > 2.首振り > 3.笑顔/眉上げ

      // 【優先度1】口開け/口すぼめ（キー入力トリガー）がアクティブな場合
      // → 他のすべてのジェスチャータイマーをリセット
      if (isTriggered) {
        smileStartTimeRef.current = null;
        // 首振り検出もスキップ（トリガー中は無効）
      }

      // 入力状態に応じた処理
      if (state.input.phase === 'idle') {
        // 笑顔/眉上げ検出中は「や」キーのフォーカスを固定
        const isSmileHolding = smileStartTimeRef.current !== null;
        const yaKeyPosition = { row: 2, col: 1 };

        // ホバー更新（笑顔/眉上げホールド中は「や」キーに固定）
        if (isSmileHolding) {
          actions.keyHover(yaKeyPosition);
        } else {
          actions.keyHover(keyPosition);
        }

        // トリガーなしの場合のみジェスチャー検出
        if (!isTriggered) {
          // 【優先度2】首振りジェスチャー検出（バックスペース）
          // ※笑顔/眉上げホールド中は首振り検出をスキップ
          if (!isSmileHolding) {
            const BACKSPACE_COOLDOWN_MS = 1000; // 1秒のクールダウン
            const gesture = detectGesture(headRotationHistoryRef.current);
            if (gesture === 'head_shake' && now - lastBackspaceTimeRef.current >= BACKSPACE_COOLDOWN_MS) {
              actions.backspace();
              headRotationHistoryRef.current = []; // 履歴クリア
              lastBackspaceTimeRef.current = now;
              smileStartTimeRef.current = null; // 他のジェスチャータイマーもリセット
              return;
            }
          }

          // 【優先度3】笑顔/眉上げジェスチャー検出（「や」キー上で）
          // ホールド中は継続判定、それ以外は「や」キー上でのみ開始
          const isOnYaKey = keyPosition.row === 2 && keyPosition.col === 1;
          const shouldCheckSmile = isSmileHolding || (isOnYaKey && state.text.length > 0);

          if (shouldCheckSmile && state.text.length > 0) {
            const smiling = isSmiling(blendshapes, state.calibration.smileThreshold);
            const browRaised = isBrowRaised(
              blendshapes,
              state.calibration.browInnerUpBaseValue,
              state.calibration.browInnerUpThreshold
            );

            if (smiling || browRaised) {
              if (!smileStartTimeRef.current) {
                smileStartTimeRef.current = now;
                setSpeakClearProgress(0);
              } else {
                const elapsed = now - smileStartTimeRef.current;
                const progress = Math.min(elapsed / SMILE_HOLD_MS, 1);
                setSpeakClearProgress(progress);

                if (elapsed >= SMILE_HOLD_MS) {
                  // 読み上げ開始
                  setSpeakClearProgress(null);
                  startSpeaking();
                  actions.speakAndClear({
                    onStart: () => {
                      // 口パクアニメーション開始
                      startMouthAnimation();
                    },
                    onBoundary: () => {
                      // 単語境界で口を大きく開ける
                      jawOpenOverrideRef.current = 0.5;
                      setTimeout(() => { jawOpenOverrideRef.current = null; }, 100);
                    },
                    onEnd: () => {
                      // 読み上げ終了
                      stopMouthAnimation();
                      stopSpeaking();
                    },
                  });
                  smileStartTimeRef.current = null;
                }
              }
            } else {
              smileStartTimeRef.current = null;
              setSpeakClearProgress(null);
            }
          } else if (!isSmileHolding) {
            // ホールド中でなく、「や」キー上でもない場合のみリセット
            smileStartTimeRef.current = null;
            setSpeakClearProgress(null);
          }
        }

        // トリガー検出 → 即座にtriggering状態へ（背景色変更）
        if (isTriggered) {
          triggerStartTimeRef.current = now;
          // ホールド位置は平滑化された値を使用（フリック検出と基準を合わせる）
          holdPositionRef.current = {
            yaw: smoothedHeadRotationRef.current!.yaw,
            pitch: smoothedHeadRotationRef.current!.pitch,
          };
          actions.triggerDetected(keyPosition);
        }
      } else if (state.input.phase === 'triggering') {
        // トリガー検出中（ホールド時間待ち）
        // ※ この状態ではキー位置は固定（ホバー更新しない）
        if (isTriggered) {
          if (triggerStartTimeRef.current && now - triggerStartTimeRef.current >= HOLD_DELAY_MS) {
            // ホールド時間経過 → selecting状態へ（文字色も変更）
            actions.triggerStart(state.input.selectedKey!, holdPositionRef.current!);
          }
        } else {
          // トリガー解除 → idleに戻る（文字入力なし）
          actions.triggerEnd();
          triggerStartTimeRef.current = null;
          holdPositionRef.current = null;
        }
      } else if (state.input.phase === 'selecting' || state.input.phase === 'flicking') {
        if (isTriggered && state.input.holdPosition) {
          // フリック方向検出（平滑化された値を使用）
          const flickDir = getFlickDirection(
            smoothedHeadRotationRef.current!,
            state.input.holdPosition,
            state.input.selectedKey!,
            layout,
            state.calibration
          );
          if (flickDir !== state.input.flickDirection) {
            actions.flickDetected(flickDir);
          }
        } else {
          // トリガー解除 → 文字確定
          if (state.input.selectedKey) {
            const { char, isModifier } = getCharFromPosition(
              state.input.selectedKey,
              state.input.flickDirection,
              state.keyboardModeId
            );

            if (isModifier) {
              actions.toggleModifier();
            } else if (char) {
              actions.charInput(char);
            }
          }
          actions.triggerEnd();
          triggerStartTimeRef.current = null;
          holdPositionRef.current = null;
        }
      }
    },
    [state, actions]
  );

  // アニメーションループ
  useEffect(() => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    if (!videoRef.current || !cameraReady || !faceReady) return;

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const video = videoRef.current;

    const animate = (timestamp: number) => {
      animationIdRef.current = requestAnimationFrame(animate);

      // 顔認識（30fps制限）
      if (timestamp - lastDetectionTimeRef.current >= DETECTION_INTERVAL_MS) {
        lastDetectionTimeRef.current = timestamp;

        const result = detectFace(video, timestamp);
        const faceState = result
          ? analyzeFace(result, state.calibration, prevFaceStateRef.current)
          : null;

        if (faceState) {
          // 顔認識成功
          wasRecognizedRef.current = true;
          currentFaceStateRef.current = faceState;
          prevFaceStateRef.current = {
            isTriggered: faceState.isTriggered,
            blendshapes: faceState.blendshapes,
          };

          // GLBアバターに表情適用（キャリブレーション角度を正面とする）
          if (avatar) {
            let calibrationOffset: CalibrationOffset | undefined;
            if (state.calibration) {
              // 度からラジアンに変換
              const degToRad = Math.PI / 180;
              calibrationOffset = {
                pitch: -state.calibration.basePitch * degToRad,
                yaw: state.calibration.baseYaw * degToRad,
              };
            }
            // 口パクオーバーライド（読み上げ中）
            const blendshapeOverride: BlendshapeOverride | undefined =
              jawOpenOverrideRef.current !== null
                ? { jawOpen: jawOpenOverrideRef.current }
                : undefined;
            applyMediaPipeToGLB(avatar, result!, calibrationOffset, blendshapeOverride);
          }

          // キャリブレーション中はサンプル収集
          if (state.phase === 'calibrating') {
            setCalibrationSamples((prev) => [
              ...prev,
              {
                yaw: faceState.headRotation.yaw,
                pitch: faceState.headRotation.pitch,
                timestamp: Date.now(),
              },
            ]);
            setBlendshapeSamples((prev) => [
              ...prev,
              {
                jawOpen: faceState.blendshapes.jawOpen,
                mouthPucker: faceState.blendshapes.mouthPucker,
                browInnerUp: faceState.blendshapes.browInnerUp,
              },
            ]);
          }

          // 入力処理
          if (state.phase === 'ready') {
            processInput(faceState);
          }
        } else if (wasRecognizedRef.current) {
          // 顔認識が途切れた → 状態をリセット（アバターは一時停止）
          wasRecognizedRef.current = false;

          // ready状態であれば入力をリセット
          if (state.phase === 'ready') {
            actions.recognitionLost();

            // refsもリセット
            triggerStartTimeRef.current = null;
            holdPositionRef.current = null;
            headRotationHistoryRef.current = [];
            smileStartTimeRef.current = null;
            smoothedHeadRotationRef.current = null;
            setSpeakClearProgress(null);
          }

          // アバターは更新しない（最後の状態で一時停止）
        }
      }

      // 描画
      renderer.render(scene, camera);
    };

    animationIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [
    videoRef,
    cameraReady,
    faceReady,
    avatar,
    state.phase,
    state.calibration,
    detectFace,
    processInput,
    actions,
  ]);

  // キャリブレーション完了ハンドラ
  const handleCalibrationComplete = useCallback(
    (settings: Parameters<typeof actions.calibrationComplete>[0]) => {
      actions.calibrationComplete(settings);
    },
    [actions]
  );

  // 再キャリブレーション
  const handleRecalibrate = useCallback(() => {
    setCalibrationSamples([]);
    setBlendshapeSamples([]);
    actions.recalibrate();
  }, [actions]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {/* ビデオ背景（アバター表示時はぼかす） */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-all duration-300 ${
          showAvatar ? 'blur-md brightness-75' : ''
        }`}
      />

      {/* WebGL Canvas (GLB Avatar) */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300 ${
          showAvatar ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* UI Layer */}
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {/* ツールバー */}
        {state.phase === 'ready' && (
          <div className="pointer-events-auto">
            <Toolbar
              showAvatar={showAvatar}
              onToggleAvatar={() => setShowAvatar(!showAvatar)}
              onRecalibrate={handleRecalibrate}
            />
          </div>
        )}

        {/* テキスト表示エリア */}
        {state.phase === 'ready' && (
          <div className="px-4 pt-2 pointer-events-auto">
            <TextDisplay
              text={state.text}
              previewChar={state.input.previewChar}
              isSpeaking={isSpeaking}
            />
          </div>
        )}

        {/* キーボード */}
        {state.phase === 'ready' && (
          <div className="px-4 pt-2 pointer-events-auto">
            <Keyboard
              layoutId={state.keyboardModeId}
              selectedKey={state.input.selectedKey}
              flickDirection={state.input.flickDirection}
              inputPhase={state.input.phase}
              previewChar={state.input.previewChar}
              isHidden={isSpeaking}
              speakClearProgress={speakClearProgress}
              hasText={state.text.length > 0}
            />
            {/* ヘルプ */}
            <p className="text-gray-400 text-xs text-center mt-2" style={{ opacity: isSpeaking ? 0 : 1, transition: 'opacity 0.3s' }}>
              顔を動かしてキー選択 / 口を開けて決定 / 首振りで削除
            </p>
          </div>
        )}

        {/* 下部スペーサー */}
        <div className="flex-1" />
      </div>

      {/* オーバーレイ */}
      {state.phase === 'loading' && (
        <LoadingOverlay
          cameraReady={cameraReady}
          faceReady={faceReady}
          vrmReady={!!avatar}
        />
      )}

      {state.phase === 'calibrating' && (
        <CalibrationOverlay
          samples={calibrationSamples}
          blendshapeSamples={blendshapeSamples}
          onComplete={handleCalibrationComplete}
        />
      )}

      {state.error && (
        <ErrorOverlay
          error={state.error}
          onRetry={() => window.location.reload()}
        />
      )}
    </div>
  );
}
