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
import { FaceLandmarker } from '@mediapipe/tasks-vision';

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
  const [faceDisplayMode, setFaceDisplayMode] = useState<'none' | 'points' | 'mesh'>('points');
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
  const triggerStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !video || !cameraReady || !landmarkerReady) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function animate(timestamp: number) {
      if (!ctx || !canvas || !video) return;

      // キャンバスサイズをビューポートサイズに合わせる
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

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

          // 顔のランドマークを描画（モードに応じて）
          if (faceDisplayMode !== 'none') {
            drawFaceLandmarks(ctx, faceState.landmarks, canvas.width, canvas.height, result);
          }
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
  }, [video, cameraReady, landmarkerReady, detectFace, inputState, inputText, calibrationSettings, faceDisplayMode]);

  function processInput(faceState: any) {
    const selectedKey = getSelectedKey(faceState, calibrationSettings);
    const HOLD_DELAY_MS = 800; // 0.8秒のホールド遅延

    if (inputState.type === 'idle') {
      // トリガーがアクティブでキーが選択されている
      if (faceState.isTriggered && selectedKey) {
        // トリガー開始時刻を記録
        if (triggerStartTimeRef.current === null) {
          triggerStartTimeRef.current = Date.now();
        }

        // 0.8秒経過したかチェック
        const elapsedTime = Date.now() - triggerStartTimeRef.current;
        if (elapsedTime >= HOLD_DELAY_MS) {
          setInputState({
            type: 'selecting',
            key: selectedKey,
            triggerType: faceState.triggerType,
            holdPosition: {
              yaw: faceState.headRotation.yaw,
              pitch: faceState.headRotation.pitch,
            },
          });
          triggerStartTimeRef.current = null; // リセット
        }
      } else {
        // トリガーが解除されたらタイマーリセット
        triggerStartTimeRef.current = null;
      }
    } else if (inputState.type === 'selecting') {
      // トリガーが解除された = 入力確定
      if (!faceState.isTriggered || faceState.triggerType !== inputState.triggerType) {
        const char = getCharFromFlick(inputState.key, null);
        addCharacter(char);
        setInputState({ type: 'idle' });
      } else {
        // トリガーを維持したまま = フリック判定（ホールド位置を基準に）
        const direction = getFlickDirection(faceState, inputState.holdPosition, calibrationSettings);
        if (direction) {
          setInputState({
            type: 'flicking',
            key: inputState.key,
            direction,
            triggerType: inputState.triggerType,
            holdPosition: inputState.holdPosition,
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
      // フリック中に方向が変わったら更新（ホールド位置を基準に）
      else {
        const direction = getFlickDirection(faceState, inputState.holdPosition, calibrationSettings);
        if (direction && direction !== inputState.direction) {
          setInputState({
            type: 'flicking',
            key: inputState.key,
            direction,
            triggerType: inputState.triggerType,
            holdPosition: inputState.holdPosition,
          });
        }
      }
    }
  }

  function addCharacter(char: string) {
    if (char === '⌫') {
      setInputText((prev) => prev.slice(0, -1));
    } else if (char === '゛゜小') {
      // 直前の文字を濁点・半濁点・小文字・通常文字でトグル
      setInputText((prev) => {
        if (prev.length === 0) return prev;
        const lastChar = prev[prev.length - 1];
        const restText = prev.slice(0, -1);
        const newChar = toggleCharacter(lastChar);
        return restText + newChar;
      });
    } else if (char) {
      setInputText((prev) => prev + char);
    }
  }

  function toggleCharacter(char: string): string {
    // 濁点変換マップ
    const dakutenMap: Record<string, string> = {
      'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
      'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
      'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど',
      'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
    };

    // 半濁点変換マップ（は行のみ）
    const handakutenMap: Record<string, string> = {
      'ば': 'ぱ', 'び': 'ぴ', 'ぶ': 'ぷ', 'べ': 'ぺ', 'ぼ': 'ぽ',
    };

    // 小文字変換マップ
    const smallMap: Record<string, string> = {
      'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ',
      'つ': 'っ', 'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ',
    };

    // 逆マップ（元に戻す）
    const reverseDakuten: Record<string, string> = Object.fromEntries(
      Object.entries(dakutenMap).map(([k, v]) => [v, k])
    );
    const reverseHandakuten: Record<string, string> = Object.fromEntries(
      Object.entries(handakutenMap).map(([k, v]) => [v, k])
    );
    const reverseSmall: Record<string, string> = Object.fromEntries(
      Object.entries(smallMap).map(([k, v]) => [v, k])
    );

    // は行の濁点→半濁点→通常のサイクル
    if (handakutenMap[char]) {
      return handakutenMap[char];
    }
    if (reverseHandakuten[char]) {
      return reverseDakuten[reverseHandakuten[char]] || char;
    }

    // 濁点のサイクル（通常→濁点→通常）
    if (dakutenMap[char]) {
      return dakutenMap[char];
    }
    if (reverseDakuten[char]) {
      return reverseDakuten[char];
    }

    // 小文字のサイクル（通常→小文字→通常）
    if (smallMap[char]) {
      return smallMap[char];
    }
    if (reverseSmall[char]) {
      return reverseSmall[char];
    }

    // 変換できない文字はそのまま
    return char;
  }

  function drawFaceLandmarks(
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    width: number,
    height: number,
    _result: any
  ) {
    if (faceDisplayMode === 'points') {
      // ポイント表示（Instagram風）
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      for (const landmark of landmarks) {
        const x = width - landmark.x * width; // 反転
        const y = landmark.y * height;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    } else if (faceDisplayMode === 'mesh') {
      // メッシュ表示（Max Headroom風ワイヤーフレーム）
      drawFaceMesh(ctx, landmarks, width, height);
    }
  }

  function drawFaceMesh(
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    width: number,
    height: number
  ) {
    // MediaPipe公式のFACE_LANDMARKS_TESSELATIONデータを使用
    const connections = FaceLandmarker.FACE_LANDMARKS_TESSELATION;

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 1;

    // 各接続を線で描画
    for (const connection of connections) {
      const startIdx = connection.start;
      const endIdx = connection.end;

      if (startIdx < landmarks.length && endIdx < landmarks.length) {
        const p0 = landmarks[startIdx];
        const p1 = landmarks[endIdx];

        const x0 = width - p0.x * width; // 反転
        const y0 = p0.y * height;
        const x1 = width - p1.x * width;
        const y1 = p1.y * height;

        // 線を描画
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
  }

  function drawKeyboard(
    ctx: CanvasRenderingContext2D,
    width: number,
    _height: number
  ) {
    // ツールバーの高さ
    const toolbarHeight = 50;
    // デバッグ情報エリアの高さ
    const debugInfoHeight = 80;
    // キーボードの開始位置
    const keyboardTop = toolbarHeight + debugInfoHeight;
    // キーを正方形にする（画面幅基準）
    const keySize = width / 3;

    // 現在顔が向いているキーを取得（idle状態のみ）
    const currentKey = (inputState.type === 'idle' && currentFaceState)
      ? getSelectedKey(currentFaceState, calibrationSettings)
      : null;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    KEYBOARD_LAYOUT.rows.forEach((row, rowIndex) => {
      row.forEach((key, colIndex) => {
        const x = colIndex * keySize;
        const y = keyboardTop + rowIndex * keySize;

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
          // トリガーでホールド中 = 強調表示（半透明の青）
          ctx.fillStyle = 'rgba(100, 150, 255, 0.5)';
          ctx.fillRect(x, y, keySize, keySize);
        } else if (isHovered) {
          // 顔が向いているだけ = 薄いハイライト（半透明の白）
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.fillRect(x, y, keySize, keySize);
        }

        // キーのテキストを描画（ドロップシャドウ付き）
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(key.base, x + keySize / 2, y + keySize / 2);
        ctx.shadowColor = 'transparent'; // シャドウをリセット

        // フリック方向を描画（キーホールド中のみ）
        if (isSelected) {
          const activeDirection = inputState.type === 'flicking' ? inputState.direction : null;

          // ドロップシャドウを有効化
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // 左（left）
          if (key.left) {
            const isActive = activeDirection === 'left';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(key.left, x + keySize * 0.15, y + keySize / 2);
          }

          // 上（up）
          if (key.up) {
            const isActive = activeDirection === 'up';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(key.up, x + keySize / 2, y + keySize * 0.15);
          }

          // 右（right）
          if (key.right) {
            const isActive = activeDirection === 'right';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(key.right, x + keySize * 0.85, y + keySize / 2);
          }

          // 下（down）
          if (key.down) {
            const isActive = activeDirection === 'down';
            ctx.font = isActive ? '24px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ff00' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(key.down, x + keySize / 2, y + keySize * 0.85);
          }

          ctx.font = '32px sans-serif';
          ctx.shadowColor = 'transparent'; // シャドウをリセット
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
    const debugInfoHeight = 80; // デバッグ情報エリアの高さ
    const keySize = width / 3;
    const keyboardHeight = keySize * 4;
    const keyboardTop = toolbarHeight + debugInfoHeight;
    const inputAreaTop = keyboardTop + keyboardHeight;
    const inputAreaHeight = height - inputAreaTop;

    // デバッグ情報エリアの背景（ツールバーの下、キーボードの上）
    if (debugInfo) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, toolbarHeight, width, debugInfoHeight);

      // デバッグ情報表示
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const triggerText = getTriggerDisplayText(debugInfo.triggerType);
      ctx.fillText(`トリガー: ${triggerText}`, 10, toolbarHeight + 10);

      // EAR値
      ctx.fillText(
        `EAR: L=${debugInfo.ear.left.toFixed(2)} R=${debugInfo.ear.right.toFixed(2)}`,
        10,
        toolbarHeight + 25
      );

      // MAR/Pucker値
      ctx.fillText(
        `MAR: ${debugInfo.mar.toFixed(2)} Pucker: ${debugInfo.mouthPucker.toFixed(2)}`,
        10,
        toolbarHeight + 40
      );

      // 頭の向き
      ctx.fillText(
        `Yaw: ${debugInfo.headRotation.yaw.toFixed(1)}° Pitch: ${debugInfo.headRotation.pitch.toFixed(1)}°`,
        10,
        toolbarHeight + 55
      );
    }

    // 入力テキストエリアの背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, inputAreaTop, width, inputAreaHeight);

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
    let textY = inputAreaTop + 10;
    displayLines.forEach((line) => {
      ctx.fillText(line, 20, textY);
      textY += lineHeight;
    });

    // 入力状態表示
    if (inputState.type === 'selecting') {
      ctx.fillStyle = '#ffff00';
      ctx.font = '16px sans-serif';
      ctx.fillText('選択中...', 20, inputAreaTop + inputAreaHeight - 30);
    } else if (inputState.type === 'flicking') {
      ctx.fillStyle = '#00ff00';
      ctx.font = '16px sans-serif';
      const directionText = getDirectionDisplayText(inputState.direction);
      ctx.fillText(`フリック: ${directionText}`, 20, inputAreaTop + inputAreaHeight - 30);
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
      <div className="absolute top-0 left-0 right-0 bg-black bg-opacity-50 p-2 flex items-center z-10" style={{ height: '50px' }}>
        {/* 左側のボタン群 */}
        <div className="flex gap-2">
          {/* 録画ボタン */}
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

          {/* プライバシーボタン（サングラス） */}
          <button
            onClick={() => {
              setFaceDisplayMode((prev) => {
                if (prev === 'none') return 'points';
                if (prev === 'points') return 'mesh';
                return 'none';
              });
            }}
            className="w-12 h-12 bg-gray-600 hover:bg-gray-700 rounded-full flex items-center justify-center text-2xl"
            title={`顔表示: ${faceDisplayMode === 'none' ? '無加工' : faceDisplayMode === 'points' ? 'ポイント' : 'メッシュ'}`}
          >
            🕶️
          </button>
        </div>

        {/* タイトル（中央） */}
        <div className="flex-1 text-center text-white text-lg font-bold">
          Face Flick
        </div>

        {/* 右側のボタン群 */}
        <div className="flex gap-2">
          {/* キャリブレーションボタン */}
          <button
            onClick={() => setShowCalibration(true)}
            className="w-12 h-12 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center text-2xl"
          >
            ⚙️
          </button>
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
