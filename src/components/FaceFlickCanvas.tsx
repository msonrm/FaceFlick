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
import { KEYBOARD_LAYOUT } from '../utils/keyboard-layout';
import { InputState } from '../types';

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
        const faceState = analyzeFace(result);
        if (faceState) {
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
  }, [video, cameraReady, landmarkerReady, detectFace, inputState, inputText]);

  function processInput(faceState: any) {
    const selectedKey = getSelectedKey(faceState);

    if (inputState.type === 'idle') {
      if (faceState.mouthOpen && selectedKey) {
        setInputState({ type: 'selecting', key: selectedKey });
      }
    } else if (inputState.type === 'selecting') {
      if (!faceState.mouthOpen) {
        // 口を閉じた = 入力確定
        const char = getCharFromFlick(inputState.key, null);
        addCharacter(char);
        setInputState({ type: 'idle' });
      } else {
        // 口を開けたまま = フリック判定
        const direction = getFlickDirection(faceState);
        if (direction) {
          setInputState({ type: 'flicking', key: inputState.key, direction });
        }
      }
    } else if (inputState.type === 'flicking') {
      if (!faceState.mouthOpen) {
        // 口を閉じた = フリック入力確定
        const char = getCharFromFlick(inputState.key, inputState.direction);
        addCharacter(char);
        setInputState({ type: 'idle' });
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
    const keyWidth = width / 3;
    const keyHeight = height / 4;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    KEYBOARD_LAYOUT.rows.forEach((row, rowIndex) => {
      row.forEach((key, colIndex) => {
        const x = colIndex * keyWidth;
        const y = rowIndex * keyHeight;

        // キーの枠を描画
        ctx.strokeRect(x, y, keyWidth, keyHeight);

        // 選択状態の表示
        const isSelected =
          inputState.type !== 'idle' &&
          inputState.key.base === key.base;

        if (isSelected) {
          ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
          ctx.fillRect(x, y, keyWidth, keyHeight);
        }

        // キーのテキストを描画
        ctx.fillStyle = isSelected ? '#ffff00' : '#ffffff';
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, height - 80, width, 80);

    ctx.fillStyle = '#ffffff';
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(inputText, 20, height - 40);
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
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
      />
      <button
        onClick={handleRecordToggle}
        className={`absolute top-4 right-4 px-6 py-3 rounded-lg font-bold text-white transition-colors ${
          isRecording
            ? 'bg-red-600 hover:bg-red-700'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isRecording ? '⏹ 録画停止' : '⏺ 録画開始'}
      </button>
    </div>
  );
}
