import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';

// Hooks
import { useCamera } from '../hooks/useCamera';
import { useFaceLandmarker } from '../hooks/useFaceLandmarker';
import { useVRMAvatar } from '../hooks/useVRMAvatar';
import { useAppState } from '../hooks/useAppState';

// Utils
import { analyzeFace, PrevFaceState, isSmiling, isBrowRaised } from '../utils/face-detection';
import { getSelectedKeyPosition, getFlickDirection, getCharFromPosition } from '../utils/input-logic';
import { detectGesture } from '../utils/gesture-detection';
import { applyMediaPipeToVRM, CalibrationOffset } from '../utils/vrm/applyMediaPipeToVRM';
import { getLayout, DETECTION_INTERVAL_MS, HOLD_DELAY_MS, SMILE_HOLD_MS } from '../utils/keyboard-layout';

// Components
import { Keyboard } from './Keyboard';
import {
  LoadingOverlay,
  CalibrationOverlay,
  ErrorOverlay,
  TextDisplay,
} from './Overlays';

// Types
import { HeadRotationSample, FaceState } from '../types';

export function FaceFlickCanvas() {
  const { state, actions } = useAppState();

  // リソース初期化
  const { videoRef, isReady: cameraReady, error: cameraError } = useCamera();
  const { isReady: faceReady, error: faceError, detectFace } = useFaceLandmarker();
  const { vrm, error: vrmError } = useVRMAvatar({ modelUrl: '/models/avatar.vrm' });

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
  const [blendshapeSamples, setBlendshapeSamples] = useState<{ browInnerUp: number }[]>([]);

  // デバッグ用：現在のbrowInnerUp値
  const [debugBrowValue, setDebugBrowValue] = useState<number>(0);

  // 入力状態管理用refs
  const triggerStartTimeRef = useRef<number | null>(null);
  const holdPositionRef = useRef<{ yaw: number; pitch: number } | null>(null);
  const headRotationHistoryRef = useRef<HeadRotationSample[]>([]);
  const smileStartTimeRef = useRef<number | null>(null);

  // エラーチェック
  useEffect(() => {
    if (cameraError) {
      actions.setError({
        type: cameraError.includes('denied') ? 'camera_denied' : 'camera_not_found',
      });
    } else if (faceError) {
      actions.setError({ type: 'face_landmarker_failed', message: faceError });
    } else if (vrmError) {
      actions.setError({ type: 'vrm_load_failed', message: vrmError });
    }
  }, [cameraError, faceError, vrmError, actions]);

  // リソース準備完了チェック
  useEffect(() => {
    if (cameraReady && faceReady && vrm && state.phase === 'loading') {
      actions.resourcesLoaded();
    }
  }, [cameraReady, faceReady, vrm, state.phase, actions]);

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

    // カメラ（顔をキーボード2段目の高さに表示）
    // VRMの顔は約y=1.4-1.5にある。顔より上を見ることで、顔が画面下部に表示される
    const camera = new THREE.PerspectiveCamera(
      30, // FOVを広めに
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 1.6, 1.2); // カメラを顔より上に配置
    camera.lookAt(0, 1.6, 0); // 顔より上（首あたり）を見ることで、顔が画面下部に表示
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

  // VRMをシーンに追加
  useEffect(() => {
    if (!vrm || !sceneRef.current) return;
    sceneRef.current.add(vrm.scene);
    return () => {
      if (sceneRef.current) {
        sceneRef.current.remove(vrm.scene);
      }
    };
  }, [vrm]);

  // 入力処理
  const processInput = useCallback(
    (faceState: FaceState) => {
      if (state.phase !== 'ready' || !state.calibration) return;

      const layout = getLayout(state.keyboardModeId);
      const { headRotation, isTriggered, blendshapes } = faceState;

      // 頭の回転履歴を更新（ジェスチャー検出用）
      const now = Date.now();
      headRotationHistoryRef.current.push({
        yaw: headRotation.yaw,
        pitch: headRotation.pitch,
        timestamp: now,
      });
      // 直近1秒分のみ保持
      headRotationHistoryRef.current = headRotationHistoryRef.current.filter(
        (s) => now - s.timestamp < 1000
      );

      // 首振りジェスチャー検出（バックスペース）
      const gesture = detectGesture(headRotationHistoryRef.current);
      if (gesture === 'head_shake' && state.input.phase === 'idle') {
        actions.backspace();
        headRotationHistoryRef.current = []; // 履歴クリア
        return;
      }

      // キー位置計算
      const keyPosition = getSelectedKeyPosition(
        headRotation,
        layout,
        state.calibration
      );

      // 入力状態に応じた処理
      if (state.input.phase === 'idle') {
        // ホバー更新
        actions.keyHover(keyPosition);

        // 笑顔/眉上げジェスチャー検出（「や」キー上で）
        const isOnYaKey = keyPosition.row === 2 && keyPosition.col === 1;
        if (isOnYaKey) {
          const smiling = isSmiling(blendshapes, state.calibration.smileThreshold);
          const browRaised = isBrowRaised(
            blendshapes,
            state.calibration.browInnerUpBaseValue,
            state.calibration.browInnerUpThreshold
          );

          if (smiling || browRaised) {
            if (!smileStartTimeRef.current) {
              smileStartTimeRef.current = now;
            } else if (now - smileStartTimeRef.current >= SMILE_HOLD_MS) {
              actions.speakAndClear();
              smileStartTimeRef.current = null;
            }
          } else {
            smileStartTimeRef.current = null;
          }
        } else {
          smileStartTimeRef.current = null;
        }

        // トリガー開始
        if (isTriggered) {
          if (!triggerStartTimeRef.current) {
            triggerStartTimeRef.current = now;
            holdPositionRef.current = { yaw: headRotation.yaw, pitch: headRotation.pitch };
          } else if (now - triggerStartTimeRef.current >= HOLD_DELAY_MS) {
            // ホールド時間経過 → selecting状態へ
            actions.triggerStart(keyPosition, holdPositionRef.current!);
          }
        } else {
          triggerStartTimeRef.current = null;
          holdPositionRef.current = null;
        }
      } else if (state.input.phase === 'selecting' || state.input.phase === 'flicking') {
        if (isTriggered && state.input.holdPosition) {
          // フリック方向検出
          const flickDir = getFlickDirection(
            headRotation,
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
        if (result) {
          const faceState = analyzeFace(
            result,
            state.calibration,
            prevFaceStateRef.current
          );

          if (faceState) {
            currentFaceStateRef.current = faceState;
            prevFaceStateRef.current = {
              isTriggered: faceState.isTriggered,
              blendshapes: faceState.blendshapes,
            };

            // デバッグ用：browInnerUp値を更新
            setDebugBrowValue(faceState.blendshapes.browInnerUp);

            // VRMに表情適用（キャリブレーション角度を正面とする）
            if (vrm) {
              let calibrationOffset: CalibrationOffset | undefined;
              if (state.calibration) {
                // 度からラジアンに変換
                const degToRad = Math.PI / 180;
                calibrationOffset = {
                  pitch: -state.calibration.basePitch * degToRad, // 符号反転（applyHeadRotationと合わせる）
                  yaw: state.calibration.baseYaw * degToRad,
                };
              }
              applyMediaPipeToVRM(vrm, result, calibrationOffset);
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
                { browInnerUp: faceState.blendshapes.browInnerUp },
              ]);
            }

            // 入力処理
            if (state.phase === 'ready') {
              processInput(faceState);
            }
          }
        }
      }

      // VRM更新
      if (vrm) {
        vrm.update(1 / 60);
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
    vrm,
    state.phase,
    state.calibration,
    detectFace,
    processInput,
  ]);

  // キャリブレーション完了ハンドラ
  const handleCalibrationComplete = useCallback(
    (settings: Parameters<typeof actions.calibrationComplete>[0]) => {
      actions.calibrationComplete(settings);
    },
    [actions]
  );

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      {/* ビデオ背景 */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover -scale-x-100"
      />

      {/* WebGL Canvas (VRM) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* UI Layer */}
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        {/* テキスト表示エリア */}
        {state.phase === 'ready' && (
          <div className="p-4 pointer-events-auto">
            <TextDisplay
              text={state.text}
              previewChar={state.input.previewChar}
            />
          </div>
        )}

        {/* キーボード（テキストエリアの直下に配置） */}
        {state.phase === 'ready' && (
          <div className="px-4 pointer-events-auto">
            <Keyboard
              layoutId={state.keyboardModeId}
              selectedKey={state.input.selectedKey}
              flickDirection={state.input.flickDirection}
              inputPhase={state.input.phase}
              previewChar={state.input.previewChar}
            />
          </div>
        )}

        {/* 下部スペーサー（アバターの顔が見える領域） */}
        <div className="flex-1" />
      </div>

      {/* オーバーレイ */}
      {state.phase === 'loading' && (
        <LoadingOverlay
          cameraReady={cameraReady}
          faceReady={faceReady}
          vrmReady={!!vrm}
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

      {/* デバッグ情報 */}
      {state.phase === 'ready' && (
        <div className="absolute top-20 right-2 bg-black/70 text-white text-xs p-2 rounded max-w-[150px]">
          <div>VRM: {vrm ? '✓' : '✗'}</div>
          <div>Brow: {debugBrowValue.toFixed(2)}</div>
          <div>Key: {state.input.selectedKey ? `${state.input.selectedKey.row},${state.input.selectedKey.col}` : '-'}</div>
          <div>Phase: {state.input.phase}</div>
        </div>
      )}
    </div>
  );
}
