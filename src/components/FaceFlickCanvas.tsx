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
    height: number,
    _result: any
  ) {
    if (faceDisplayMode === 'points') {
      // ポイント表示
      ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
      for (const landmark of landmarks) {
        const x = width - landmark.x * width; // 反転
        const y = landmark.y * height;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
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
    // ポリゴンワイヤーフレーム: 三角形メッシュで顔全体を構成
    // アルカノイドのモアイ風
    const triangles = [
      // 額の領域（上部）
      [10, 338, 297], [10, 297, 109], [109, 297, 67], [67, 297, 332],
      [67, 332, 103], [103, 332, 284], [103, 284, 54], [54, 284, 251],
      [54, 251, 21], [21, 251, 389], [21, 389, 162], [162, 389, 356],
      [162, 356, 127], [127, 356, 454], [127, 454, 234], [234, 454, 323],

      // 左頬の領域
      [234, 93, 127], [93, 132, 58], [58, 172, 136], [136, 150, 149],
      [149, 176, 148], [148, 152, 377], [377, 400, 378],
      [234, 127, 93], [127, 162, 93], [93, 58, 132], [58, 136, 172],

      // 右頬の領域
      [454, 323, 361], [361, 288, 397], [397, 365, 379], [379, 378, 400],
      [454, 356, 323], [323, 361, 454], [361, 288, 323], [288, 397, 361],

      // 左目の周辺
      [33, 7, 163], [163, 144, 145], [145, 153, 154], [154, 155, 133],
      [133, 173, 157], [157, 158, 159], [159, 160, 161], [161, 246, 33],
      [33, 133, 7], [7, 133, 163], [163, 133, 144], [144, 154, 145],
      [154, 133, 155], [133, 157, 173], [157, 159, 158], [159, 161, 160],

      // 右目の周辺
      [362, 382, 381], [381, 380, 374], [374, 373, 390], [390, 249, 263],
      [263, 466, 388], [388, 387, 386], [386, 385, 384], [384, 398, 362],
      [362, 263, 382], [382, 263, 381], [381, 263, 380], [380, 374, 263],
      [263, 390, 249], [390, 374, 373], [263, 388, 466], [388, 386, 387],

      // 鼻の領域
      [168, 6, 197], [197, 195, 5], [5, 4, 1], [1, 2, 98], [98, 327, 326],
      [168, 197, 6], [197, 5, 195], [5, 1, 4], [1, 98, 2], [98, 326, 327],
      [1, 164, 2], [2, 164, 98], [168, 6, 164], [164, 6, 1],

      // 左眉の領域
      [70, 63, 105], [105, 66, 107], [107, 55, 65], [65, 52, 53],
      [70, 105, 63], [105, 107, 66], [107, 65, 55], [65, 53, 52],

      // 右眉の領域
      [300, 293, 334], [334, 296, 336], [336, 285, 295], [295, 282, 283],
      [300, 334, 293], [334, 336, 296], [336, 295, 285], [295, 283, 282],

      // 口の周辺（外側）
      [61, 146, 91], [91, 181, 84], [84, 17, 314], [314, 405, 321],
      [321, 375, 291], [291, 409, 270], [270, 269, 267], [267, 0, 37],
      [37, 39, 40], [40, 185, 61],
      [61, 91, 146], [91, 84, 181], [84, 314, 17], [314, 321, 405],
      [321, 291, 375], [291, 270, 409], [270, 267, 269], [267, 37, 0],
      [37, 40, 39], [40, 61, 185],

      // 口の周辺（内側）
      [78, 95, 88], [88, 178, 87], [87, 14, 317], [317, 402, 318],
      [318, 324, 308], [308, 415, 310], [310, 311, 312], [312, 13, 82],
      [82, 81, 80], [80, 191, 78],
      [78, 88, 95], [88, 87, 178], [87, 317, 14], [317, 318, 402],
      [318, 308, 324], [308, 310, 415], [310, 312, 311], [312, 82, 13],
      [82, 80, 81], [80, 78, 191],

      // 顎の領域
      [152, 377, 400], [400, 378, 379], [379, 365, 397], [397, 288, 361],
      [152, 400, 377], [400, 379, 378], [379, 397, 365], [397, 361, 288],

      // 顔の中央部分のブリッジング
      [10, 151, 9], [9, 8, 168], [151, 337, 299], [299, 333, 298],
      [234, 127, 34], [34, 139, 156], [156, 70, 63],
      [454, 366, 264], [264, 368, 383], [383, 300, 293],

      // 鼻と口の間
      [164, 167, 165], [165, 92, 186], [186, 57, 43], [43, 106, 182],
      [182, 83, 18], [18, 313, 406], [406, 335, 273], [273, 287, 410],
      [410, 322, 391], [391, 393, 164],
    ];

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 1;

    // 各三角形のワイヤーフレームを描画
    for (const triangle of triangles) {
      if (triangle.every(idx => idx < landmarks.length)) {
        const [idx0, idx1, idx2] = triangle;
        const p0 = landmarks[idx0];
        const p1 = landmarks[idx1];
        const p2 = landmarks[idx2];

        const x0 = width - p0.x * width; // 反転
        const y0 = p0.y * height;
        const x1 = width - p1.x * width;
        const y1 = p1.y * height;
        const x2 = width - p2.x * width;
        const y2 = p2.y * height;

        // 三角形の辺を描画
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();
        ctx.stroke();
      }
    }
  }

  function drawKeyboard(
    ctx: CanvasRenderingContext2D,
    width: number,
    _height: number
  ) {
    // ツールバーの高さ（縮小）
    const toolbarHeight = 50;
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
