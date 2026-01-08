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
    // ツールバーの高さ（縮小）
    const toolbarHeight = 50;
    // キーを正方形にする（画面幅基準）
    const keySize = width / 3;
    const keyboardHeight = keySize * 4;
    // デバッグ情報エリアの高さ
    const debugHeight = height - toolbarHeight - keyboardHeight;

    // 現在顔が向いているキーを取得
    const currentKey = currentFaceState ? getSelectedKey(currentFaceState, calibrationSettings) : null;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    KEYBOARD_LAYOUT.rows.forEach((row, rowIndex) => {
      row.forEach((key, colIndex) => {
        const x = colIndex * keySize;
        const y = toolbarHeight + rowIndex * keySize;

        // キーの枠を描画
        ctx.strokeRect(x, y, keySize, keySize);

        // トリガーでホールド中のキー
        const isSelected =
          inputState.type !== 'idle' &&
          inputState.key.base === key.base;

        // 顔が向いているキー（トリガーなし時のみ）
        const isHovered = !isSelected && inputState.type === 'idle' && currentKey && currentKey.base === key.base;

        // ハイライト表示
        if (isSelected) {
          // トリガーでホールド中 = 強調表示（黄色）
          ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
          ctx.fillRect(x, y, keySize, keySize);
        } else if (isHovered) {
          // 顔が向いているだけ = 薄いハイライト（青）
          ctx.fillStyle = 'rgba(100, 150, 255, 0.3)';
          ctx.fillRect(x, y, keySize, keySize);
        }

        // キーのテキストを描画
        ctx.fillStyle = isSelected ? '#ffff00' : isHovered ? '#aaddff' : '#ffffff';
        ctx.fillText(key.base, x + keySize / 2, y + keySize / 2);

        // フリック方向を描画（キーホールド中のみ）
        if (isSelected) {
          const activeDirection = inputState.type === 'flicking' ? inputState.direction : null;

          // 上
          if (key.up) {
            const isActive = activeDirection === 'up';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.5)';
            ctx.fillText(key.up, x + keySize / 2, y + keySize * 0.15);
          }

          // 下
          if (key.down) {
            const isActive = activeDirection === 'down';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.5)';
            ctx.fillText(key.down, x + keySize / 2, y + keySize * 0.85);
          }

          // 左
          if (key.left) {
            const isActive = activeDirection === 'left';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.5)';
            ctx.fillText(key.left, x + keySize * 0.15, y + keySize / 2);
          }

          // 右
          if (key.right) {
            const isActive = activeDirection === 'right';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.5)';
            ctx.fillText(key.right, x + keySize * 0.85, y + keySize / 2);
          }

          ctx.font = '32px sans-serif';
        }
      });
    });
  }

  function drawInputText(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) {
    // レイアウト計算
    const toolbarHeight = 50;
    const keySize = width / 3;
    const keyboardHeight = keySize * 4;
    const debugAreaHeight = height - toolbarHeight - keyboardHeight;
    const debugAreaTop = toolbarHeight + keyboardHeight;

    // デバッグ/入力エリアの背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, debugAreaTop, width, debugAreaHeight);

    // 入力テキスト（複数行対応）
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // テキストを折り返して描画
    const lineHeight = 30;
    const maxWidth = width - 40;
    const lines: string[] = [];
    let currentLine = '';

    for (let i = 0; i < inputText.length; i++) {
      const testLine = currentLine + inputText[i];
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = inputText[i];
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    // 最大3行まで表示
    const displayLines = lines.slice(-3);
    let textY = debugAreaTop + 10;
    displayLines.forEach((line) => {
      ctx.fillText(line, 20, textY);
      textY += lineHeight;
    });

    // 入力状態表示
    const statusY = debugAreaTop + debugAreaHeight - 75;
    if (inputState.type === 'selecting') {
      ctx.fillStyle = '#ffff00';
      ctx.font = '16px sans-serif';
      ctx.fillText('選択中...', 20, statusY);
    } else if (inputState.type === 'flicking') {
      ctx.fillStyle = '#00ff00';
      ctx.font = '16px sans-serif';
      const directionText = getDirectionDisplayText(inputState.direction);
      ctx.fillText(`フリック: ${directionText}`, 20, statusY);
    }

    // デバッグ情報表示（複数行に分割）
    if (debugInfo) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';

      const triggerText = getTriggerDisplayText(debugInfo.triggerType);
      ctx.fillText(`トリガー: ${triggerText}`, 20, debugAreaTop + debugAreaHeight - 55);

      // EAR値
      ctx.fillText(
        `EAR: L=${debugInfo.ear.left.toFixed(2)} R=${debugInfo.ear.right.toFixed(2)}`,
        20,
        debugAreaTop + debugAreaHeight - 40
      );

      // MAR/Pucker値
      ctx.fillText(
        `MAR: ${debugInfo.mar.toFixed(2)} Pucker: ${debugInfo.mouthPucker.toFixed(2)}`,
        width / 2,
        debugAreaTop + debugAreaHeight - 40
      );

      // 頭の向き
      ctx.fillText(
        `Yaw: ${debugInfo.headRotation.yaw.toFixed(1)}° Pitch: ${debugInfo.headRotation.pitch.toFixed(1)}°`,
        20,
        debugAreaTop + debugAreaHeight - 25
      );

      // キャリブレーション情報
      ctx.fillText(
        `[相対範囲: Yaw 3分割, Pitch 4分割]`,
        20,
        debugAreaTop + debugAreaHeight - 10
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
      <div className="absolute top-0 left-0 right-0 bg-black bg-opacity-50 p-2 flex items-center justify-between z-10" style={{ height: '50px' }}>
        {/* 録画ボタン（左） */}
        <button
          onClick={handleRecordToggle}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isRecording ? '⏹' : '⏺'}
        </button>

        {/* タイトル（中央） */}
        <div className="text-white text-lg font-bold">
          Face Flick
        </div>

        {/* キャリブレーションボタン（右） */}
        <button
          onClick={() => setShowCalibration(true)}
          className="w-12 h-12 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center text-2xl"
        >
          ⚙️
        </button>
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
