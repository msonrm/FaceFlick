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
  const [showDebugInfo, setShowDebugInfo] = useState(true);
  const [faceDisplayMode, setFaceDisplayMode] = useState<'none' | 'points' | 'mesh'>('points');
  const [gestureFeedback, setGestureFeedback] = useState<{ type: 'backspace' | 'newline'; timestamp: number } | null>(null);
  const [calibrationSettings, setCalibrationSettings] = useState<CalibrationSettings>({
    yawRange: { min: -30, max: 30 },
    pitchRange: { min: -1, max: 15 },
    mouthOpenThreshold: MOUTH_OPEN_THRESHOLD,
    mouthPuckerThreshold: MOUTH_PUCKER_THRESHOLD,
    earThreshold: EAR_THRESHOLD,
    gridSensitivity: GRID_SENSITIVITY,
    flickSensitivity: FLICK_SENSITIVITY,
  });
  const animationFrameRef = useRef<number | null>(null);
  const triggerStartTimeRef = useRef<number | null>(null);
  const headRotationHistoryRef = useRef<Array<{ yaw: number; pitch: number; timestamp: number }>>([]);
  const lastGestureTimeRef = useRef<number>(0);

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

  function detectGesture(
    history: Array<{ yaw: number; pitch: number; timestamp: number }>
  ): 'head_shake' | 'nod' | null {
    // 最低0.5秒のデータが必要
    if (history.length < 10) return null;

    const timeSpan = history[history.length - 1].timestamp - history[0].timestamp;
    if (timeSpan < 500) return null;

    // ヘッドシェイク検出（左右に振る）
    // yaw値の変化を見て、方向転換が2回以上あるかチェック
    let yawDirectionChanges = 0;
    let lastYawDirection: 'left' | 'right' | null = null;

    for (let i = 1; i < history.length; i++) {
      const yawDiff = history[i].yaw - history[i - 1].yaw;
      if (Math.abs(yawDiff) > 3) { // 3度以上の変化
        const currentDirection = yawDiff > 0 ? 'left' : 'right';
        if (lastYawDirection && lastYawDirection !== currentDirection) {
          yawDirectionChanges++;
        }
        lastYawDirection = currentDirection;
      }
    }

    // 2回以上方向転換があればヘッドシェイク
    if (yawDirectionChanges >= 2) {
      return 'head_shake';
    }

    // ノッド検出（頷く）
    // pitch値の変化を見て、下→上の動きがあるかチェック
    let pitchDirectionChanges = 0;
    let lastPitchDirection: 'down' | 'up' | null = null;
    let maxPitchDown = -Infinity;

    for (let i = 1; i < history.length; i++) {
      const pitchDiff = history[i].pitch - history[i - 1].pitch;
      if (Math.abs(pitchDiff) > 2) { // 2度以上の変化
        const currentDirection = pitchDiff > 0 ? 'down' : 'up';
        if (lastPitchDirection && lastPitchDirection !== currentDirection) {
          pitchDirectionChanges++;
        }
        lastPitchDirection = currentDirection;
        if (currentDirection === 'down') {
          maxPitchDown = Math.max(maxPitchDown, history[i].pitch);
        }
      }
    }

    // 下→上の動きが少なくとも1回あり、十分な振り幅があればノッド
    if (pitchDirectionChanges >= 1 && maxPitchDown > 5) {
      return 'nod';
    }

    return null;
  }

  function processInput(faceState: any) {
    const selectedKey = getSelectedKey(faceState, calibrationSettings);
    const HOLD_DELAY_MS = 800; // 0.8秒のホールド遅延

    // 頭の回転履歴を更新（ジェスチャー検出用）
    const now = Date.now();
    headRotationHistoryRef.current.push({
      yaw: faceState.headRotation.yaw,
      pitch: faceState.headRotation.pitch,
      timestamp: now,
    });

    // 1秒以上古い履歴を削除
    headRotationHistoryRef.current = headRotationHistoryRef.current.filter(
      (h) => now - h.timestamp < 1000
    );

    // ジェスチャー検出（idle状態のみ、かつ前回のジェスチャーから1秒以上経過）
    if (inputState.type === 'idle' && now - lastGestureTimeRef.current > 1000) {
      const gesture = detectGesture(headRotationHistoryRef.current);
      if (gesture === 'head_shake') {
        // バックスペース
        setInputText((prev) => prev.slice(0, -1));
        setGestureFeedback({ type: 'backspace', timestamp: now });
        lastGestureTimeRef.current = now;
        headRotationHistoryRef.current = []; // 履歴をクリア
      } else if (gesture === 'nod') {
        // 改行
        setInputText((prev) => prev + '\n');
        setGestureFeedback({ type: 'newline', timestamp: now });
        lastGestureTimeRef.current = now;
        headRotationHistoryRef.current = []; // 履歴をクリア
      }
    }

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
    // 「つ」の特殊なサイクル: つ→っ→づ→つ
    if (char === 'つ') return 'っ';
    if (char === 'っ') return 'づ';
    if (char === 'づ') return 'つ';

    // 濁点変換マップ
    const dakutenMap: Record<string, string> = {
      'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
      'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
      'た': 'だ', 'ち': 'ぢ', 'て': 'で', 'と': 'ど',
      'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
    };

    // 半濁点変換マップ（は行のみ）
    const handakutenMap: Record<string, string> = {
      'ば': 'ぱ', 'び': 'ぴ', 'ぶ': 'ぷ', 'べ': 'ぺ', 'ぼ': 'ぽ',
    };

    // 小文字変換マップ
    const smallMap: Record<string, string> = {
      'あ': 'ぁ', 'い': 'ぃ', 'う': 'ぅ', 'え': 'ぇ', 'お': 'ぉ',
      'や': 'ゃ', 'ゆ': 'ゅ', 'よ': 'ょ', 'わ': 'ゎ',
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

    // まず顔全体を半透明の緑で覆う（プライバシー保護）
    // 顔の輪郭ポイントを使用（MediaPipe Face Meshの顔輪郭インデックス）
    const faceOvalIndices = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
    ];

    ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
    ctx.beginPath();
    faceOvalIndices.forEach((idx, i) => {
      if (idx < landmarks.length) {
        const landmark = landmarks[idx];
        const x = width - landmark.x * width; // 反転
        const y = landmark.y * height;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    ctx.closePath();
    ctx.fill();

    // その上にワイヤーフレームを描画
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
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
    const debugInfoHeight = showDebugInfo ? 80 : 0;
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

        // フリック方向の判定（isSelectedの場合のみ）
        const activeDirection = isSelected && inputState.type === 'flicking' ? inputState.direction : null;
        const isCenterActive = isSelected && !activeDirection;

        // キーのテキストを描画（ドロップシャドウ付き）
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        if (isCenterActive) {
          ctx.font = '36px sans-serif'; // ホールド時は大きく
          ctx.fillStyle = '#00ffff'; // シアン
        } else {
          ctx.font = '32px sans-serif';
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(key.base, x + keySize / 2, y + keySize / 2);
        ctx.shadowColor = 'transparent'; // シャドウをリセット
        ctx.font = '32px sans-serif'; // フォントをリセット

        // フリック方向を描画（キーホールド中のみ）
        if (isSelected) {

          // ドロップシャドウを有効化
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // 左（left）
          if (key.left) {
            const isActive = activeDirection === 'left';
            ctx.font = isActive ? '28px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ffff' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(key.left, x + keySize * 0.15, y + keySize / 2);
          }

          // 上（up）
          if (key.up) {
            const isActive = activeDirection === 'up';
            ctx.font = isActive ? '28px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ffff' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(key.up, x + keySize / 2, y + keySize * 0.15);
          }

          // 右（right）
          if (key.right) {
            const isActive = activeDirection === 'right';
            ctx.font = isActive ? '28px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ffff' : 'rgba(255, 255, 255, 0.6)';
            ctx.fillText(key.right, x + keySize * 0.85, y + keySize / 2);
          }

          // 下（down）
          if (key.down) {
            const isActive = activeDirection === 'down';
            ctx.font = isActive ? '28px sans-serif' : '14px sans-serif';
            ctx.fillStyle = isActive ? '#00ffff' : 'rgba(255, 255, 255, 0.6)';
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
    const debugInfoHeight = showDebugInfo ? 80 : 0; // デバッグ情報エリアの高さ
    const keySize = width / 3;
    const keyboardHeight = keySize * 4;
    const keyboardTop = toolbarHeight + debugInfoHeight;
    const inputAreaTop = keyboardTop + keyboardHeight;
    const inputAreaHeight = height - inputAreaTop;

    // デバッグ情報エリアの背景（ツールバーの下、キーボードの上）
    if (debugInfo && showDebugInfo) {
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

    // テキストを折り返して描画（改行対応）
    const lineHeight = 30;
    const maxWidth = width - 40;
    const lines: string[] = [];

    // まず改行で分割
    const paragraphs = inputText.split('\n');

    // 各段落を折り返し処理
    paragraphs.forEach((paragraph, paragraphIndex) => {
      let currentLine = '';

      for (let i = 0; i < paragraph.length; i++) {
        const testLine = currentLine + paragraph[i];
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = paragraph[i];
        } else {
          currentLine = testLine;
        }
      }

      // 段落の終わりに現在の行を追加
      if (currentLine || paragraphIndex < paragraphs.length - 1) {
        lines.push(currentLine);
      }
    });

    // 最大3行まで表示
    const displayLines = lines.slice(-3);
    let textY = inputAreaTop + 10;
    displayLines.forEach((line) => {
      ctx.fillText(line, 20, textY);
      textY += lineHeight;
    });

    // カーソル表示（CLI風の点滅）
    const cursorVisible = Math.floor(Date.now() / 500) % 2 === 0; // 0.5秒ごとに点滅
    if (cursorVisible) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      // 最後の行の終わりにカーソルを表示
      const cursorX = displayLines.length > 0
        ? 20 + ctx.measureText(displayLines[displayLines.length - 1]).width
        : 20;
      const cursorY = textY - lineHeight + (displayLines.length === 0 ? 0 : 0);
      ctx.fillText('|', cursorX, cursorY);
    }

    // 入力状態表示
    const statusY = inputAreaTop + inputAreaHeight - 30;

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

    // ジェスチャーフィードバック表示（テキストエリア内の右側）
    if (gestureFeedback) {
      const feedbackAge = Date.now() - gestureFeedback.timestamp;
      const opacity = Math.max(0, 1 - feedbackAge / 1000); // 1秒かけてフェードアウト

      ctx.save();
      ctx.fillStyle = `rgba(0, 255, 255, ${opacity})`;
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = `rgba(0, 0, 0, ${opacity * 0.8})`;
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      const text = gestureFeedback.type === 'backspace' ? '⌫ 削除' : '↵ 改行';
      ctx.fillText(text, width - 20, statusY);
      ctx.restore();
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
      <div className="absolute top-0 left-0 right-0 backdrop-blur-md bg-black/60 px-4 py-2 flex items-center justify-between z-10" style={{ height: '50px' }}>
        {/* タイトル（左寄せ） */}
        <div className="text-white text-lg font-semibold tracking-wide">
          Face Flick
        </div>

        {/* 右側のボタン群 */}
        <div className="flex gap-2">
          {/* 録画ボタン */}
          <button
            onClick={handleRecordToggle}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? 'bg-red-500/80 hover:bg-red-500 backdrop-blur-sm'
                : 'bg-white/30 hover:bg-white/40 backdrop-blur-sm'
            }`}
            title={isRecording ? '録画停止' : '録画開始'}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>
              {isRecording ? 'stop' : 'fiber_manual_record'}
            </span>
          </button>

          {/* プライバシーボタン */}
          <button
            onClick={() => {
              setFaceDisplayMode((prev) => {
                if (prev === 'none') return 'points';
                if (prev === 'points') return 'mesh';
                return 'none';
              });
            }}
            className="w-10 h-10 bg-white/30 hover:bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
            title={`顔表示: ${faceDisplayMode === 'none' ? '非表示' : faceDisplayMode === 'points' ? 'ポイント' : 'メッシュ'}`}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>
              {faceDisplayMode === 'none' ? 'visibility_off' : faceDisplayMode === 'points' ? 'blur_on' : 'grid_on'}
            </span>
          </button>

          {/* デバッグ情報トグルボタン */}
          <button
            onClick={() => setShowDebugInfo((prev) => !prev)}
            className="w-10 h-10 bg-white/30 hover:bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
            title={showDebugInfo ? 'デバッグ情報を非表示' : 'デバッグ情報を表示'}
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>
              {showDebugInfo ? 'bug_report' : 'code_off'}
            </span>
          </button>

          {/* キャリブレーションボタン */}
          <button
            onClick={() => setShowCalibration(true)}
            className="w-10 h-10 bg-white/30 hover:bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
            title="設定"
          >
            <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>
              settings
            </span>
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
