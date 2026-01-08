import { useEffect, useRef, useState } from 'react';
import { useFaceLandmarker } from '../hooks/useFaceLandmarker';
import { useCamera } from '../hooks/useCamera';
import { useRecording } from '../hooks/useRecording';
import { analyzeFace } from '../utils/face-detection';
import {
  getSelectedKey,
  getFlickDirection,
  getCharFromFlick,
} from '../utils/input-logic';
import {
  KEYBOARD_LAYOUT,
  MOUTH_OPEN_THRESHOLD,
  MOUTH_PUCKER_THRESHOLD,
  EAR_THRESHOLD,
  GRID_SENSITIVITY,
  FLICK_SENSITIVITY,
} from '../utils/keyboard-layout';
import { InputState, CalibrationSettings } from '../types';
import { CalibrationModal } from './CalibrationModal';

export function FaceFlickCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { video, isReady: cameraReady, error: cameraError } = useCamera();
  const {
    isReady: landmarkerReady,
    error: landmarkerError,
    detectFace,
  } = useFaceLandmarker();
  const { isRecording, startRecording, stopRecording } = useRecording();

  const [inputState, setInputState] = useState<InputState>({ type: 'idle' });
  const [inputText, setInputText] = useState('');
  const [currentFaceState, setCurrentFaceState] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<{
    ear: { left: number; right: number };
    mar: number;
    mouthPucker: number;
    triggerType: string;
    headRotation: { yaw: number; pitch: number };
  } | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibrationSettings, setCalibrationSettings] = useState<CalibrationSettings>({
    yawRange: { min: -30, max: 30 },
    pitchRange: { min: -30, max: 30 },
    mouthOpenThreshold: MOUTH_OPEN_THRESHOLD,
    mouthPuckerThreshold: MOUTH_PUCKER_THRESHOLD,
    earThreshold: EAR_THRESHOLD,
    gridSensitivity: GRID_SENSITIVITY,
    flickSensitivity: FLICK_SENSITIVITY,
  });
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !video || !cameraReady || !landmarkerReady) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function animate(timestamp: number) {
      if (!ctx || !canvas || !video) return;

      // キャンバスサイズを設定
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // ビデオを描画（反転）
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      // 顔検出
      const result = detectFace(video, timestamp);
      if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
        const faceState = analyzeFace(result, calibrationSettings);
        if (faceState) {
          // 現在の顔の状態を保存
          setCurrentFaceState(faceState);

          // デバッグ情報を更新
          setDebugInfo({
            ear: faceState.ear,
            mar: faceState.mar,
            mouthPucker: faceState.mouthPucker,
            triggerType: faceState.triggerType || 'none',
            headRotation: faceState.headRotation,
          });

          // 入力ロジック
          processInput(faceState);

          // 顔のランドマークを描画
          drawFaceLandmarks(ctx, faceState.landmarks, canvas.width, canvas.height);
        }
      }

      // キーボードオーバーレイを描画
      drawKeyboard(ctx, canvas.width, canvas.height);

      // 入力テキストを描画
      drawInputText(ctx, canvas.width, canvas.height);

      animationFrameRef.current = requestAnimationFrame(animate);
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [video, cameraReady, landmarkerReady, detectFace, inputState, inputText, calibrationSettings]);

  function processInput(faceState: any) {
    const selectedKey = getSelectedKey(faceState, calibrationSettings);

    if (inputState.type === 'idle') {
      // いずれかのトリガーがアクティブでキーが選択されている
      if (faceState.isTriggered && selectedKey) {
        setInputState({
          type: 'selecting',
          key: selectedKey,
          triggerType: faceState.triggerType,
        });
      }
    } else if (inputState.type === 'selecting') {
      // トリガーが解除された = 入力確定
      if (!faceState.isTriggered || faceState.triggerType !== inputState.triggerType) {
        const char = getCharFromFlick(inputState.key, null);
        addCharacter(char);
        setInputState({ type: 'idle' });
      } else {
        // トリガーを維持したまま = フリック判定
        const direction = getFlickDirection(faceState, calibrationSettings);
        if (direction) {
          setInputState({
            type: 'flicking',
            key: inputState.key,
            direction,
            triggerType: inputState.triggerType,
          });
        }
      }
    } else if (inputState.type === 'flicking') {
      // トリガーが解除された = フリック入力確定
      if (!faceState.isTriggered || faceState.triggerType !== inputState.triggerType) {
        const char = getCharFromFlick(inputState.key, inputState.direction);
        addCharacter(char);
        setInputState({ type: 'idle' });
      }
      // フリック中に方向が変わったら更新
      else {
        const direction = getFlickDirection(faceState, calibrationSettings);
        if (direction && direction !== inputState.direction) {
          setInputState({
            type: 'flicking',
            key: inputState.key,
            direction,
            triggerType: inputState.triggerType,
          });
        }
      }
    }
  }

  function addCharacter(char: string) {
    if (char === '⌫') {
      setInputText((prev) => prev.slice(0, -1));
    } else if (char) {
      setInputText((prev) => prev + char);
    }
  }

  function drawFaceLandmarks(
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    width: number,
    height: number
  ) {
    ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
    for (const landmark of landmarks) {
      const x = width - landmark.x * width; // 反転
      const y = landmark.y * height;
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  function drawKeyboard(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    // ツールバーの高さ
    const toolbarHeight = 60;
    // デバッグ情報エリアの高さ
    const debugHeight = 140;
    // キーボードエリアの高さ
    const keyboardAreaHeight = height - toolbarHeight - debugHeight;

    const keyWidth = width / 3;
    const keyHeight = keyboardAreaHeight / 4;

    // 現在顔が向いているキーを取得
    const currentKey = currentFaceState ? getSelectedKey(currentFaceState, calibrationSettings) : null;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    KEYBOARD_LAYOUT.rows.forEach((row, rowIndex) => {
      row.forEach((key, colIndex) => {
        const x = colIndex * keyWidth;
        const y = toolbarHeight + rowIndex * keyHeight;

        // キーの枠を描画
        ctx.strokeRect(x, y, keyWidth, keyHeight);

        // 顔が向いているキー（トリガーなし）
        const isHovered = currentKey && currentKey.base === key.base;

        // トリガーでホールド中のキー
        const isSelected =
          inputState.type !== 'idle' &&
          inputState.key.base === key.base;

        // ハイライト表示
        if (isSelected) {
          // トリガーでホールド中 = 強調表示（黄色）
          ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
          ctx.fillRect(x, y, keyWidth, keyHeight);
        } else if (isHovered) {
          // 顔が向いているだけ = 薄いハイライト（青）
          ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
          ctx.fillRect(x, y, keyWidth, keyHeight);
        }

        // キーのテキストを描画
        ctx.fillStyle = isSelected ? '#ffff00' : isHovered ? '#aaddff' : '#ffffff';
        ctx.fillText(key.base, x + keyWidth / 2, y + keyHeight / 2);

        // フリック方向を描画
        ctx.font = '16px sans-serif';
        if (key.up) {
          ctx.fillText(key.up, x + keyWidth / 2, y + 20);
        }
        if (key.down) {
          ctx.fillText(key.down, x + keyWidth / 2, y + keyHeight - 20);
        }
        if (key.left) {
          ctx.fillText(key.left, x + 20, y + keyHeight / 2);
        }
        if (key.right) {
          ctx.fillText(key.right, x + keyWidth - 20, y + keyHeight / 2);
        }
        ctx.font = '32px sans-serif';
      });
    });
  }

  function drawInputText(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    // 入力テキストエリア（拡大）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, height - 140, width, 140);

    // 入力テキスト
    ctx.fillStyle = '#ffffff';
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(inputText, 20, height - 100);

    // 入力状態表示
    if (inputState.type === 'selecting') {
      ctx.fillStyle = '#ffff00';
      ctx.font = '20px sans-serif';
      ctx.fillText('選択中...', 20, height - 120);
    } else if (inputState.type === 'flicking') {
      ctx.fillStyle = '#00ff00';
      ctx.font = '20px sans-serif';
      const directionText = getDirectionDisplayText(inputState.direction);
      ctx.fillText(`フリック: ${directionText}`, 20, height - 120);
    }

    // デバッグ情報表示（複数行に分割）
    if (debugInfo) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px monospace';

      const triggerText = getTriggerDisplayText(debugInfo.triggerType);
      ctx.fillText(`トリガー: ${triggerText}`, 20, height - 70);

      // EAR値
      ctx.fillText(
        `EAR: L=${debugInfo.ear.left.toFixed(2)} R=${debugInfo.ear.right.toFixed(2)}`,
        20,
        height - 55
      );

      // MAR/Pucker値
      ctx.fillText(
        `MAR: ${debugInfo.mar.toFixed(2)} Pucker: ${debugInfo.mouthPucker.toFixed(2)}`,
        width / 2,
        height - 55
      );

      // 頭の向き
      ctx.fillText(
        `Yaw: ${debugInfo.headRotation.yaw.toFixed(1)}° Pitch: ${debugInfo.headRotation.pitch.toFixed(1)}°`,
        20,
        height - 40
      );

      // グリッド感度の参考値
      ctx.fillText(
        `[グリッド閾値: ±15° フリック閾値: ±20°]`,
        20,
        height - 25
      );
    }
  }

  function getTriggerDisplayText(triggerType: string): string {
    switch (triggerType) {
      case 'mouth_open':
        return '口を開ける 👄';
      case 'mouth_pucker':
        return 'キス顔 💋';
      case 'wink_left':
        return '左ウィンク 😉';
      case 'wink_right':
        return '右ウィンク 😉';
      default:
        return 'なし';
    }
  }

  function getDirectionDisplayText(direction: string | null): string {
    switch (direction) {
      case 'up':
        return '↑ 上';
      case 'down':
        return '↓ 下';
      case 'left':
        return '← 左';
      case 'right':
        return '→ 右';
      default:
        return '';
    }
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

  return (
    <div className="relative w-full h-full">
      {/* ツールバー */}
      <div className="absolute top-0 left-0 right-0 bg-black bg-opacity-50 p-3 flex gap-3 z-10">
        <button
          onClick={() => setShowCalibration(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded font-bold text-white"
        >
          ⚙️ キャリブレーション
        </button>
        <button
          onClick={handleRecordToggle}
          className={`px-4 py-2 rounded font-bold text-white ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isRecording ? '⏹ 録画停止' : '⏺ 録画開始'}
        </button>
        <div className="flex-1"></div>
        <div className="text-white text-sm self-center">
          FaceFlick - 顔ジェスチャー入力
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
      />

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
                mar: debugInfo.mar,
                mouthPucker: debugInfo.mouthPucker,
                ear: debugInfo.ear,
              }
            : null
        }
      />
    </div>
  );
}
