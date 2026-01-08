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
          holdPosition: {
            yaw: faceState.headRotation.yaw,
            pitch: faceState.headRotation.pitch,
          },
        });
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
    // MediaPipe Face Landmarks Tessellation（完全版）
    // 全468点のランドマークを三角形メッシュで結ぶ
    const FACE_MESH_TRIANGLES = [
      127, 34, 139, 11, 0, 37, 232, 231, 120, 72, 37, 39, 128, 121, 47, 232, 121, 128,
      104, 69, 67, 175, 171, 148, 157, 154, 155, 118, 50, 101, 73, 39, 40, 9, 151, 108,
      48, 115, 131, 194, 204, 211, 74, 40, 185, 80, 42, 183, 40, 92, 186, 230, 229, 118,
      202, 212, 214, 83, 18, 17, 76, 61, 146, 160, 29, 30, 56, 157, 173, 106, 204, 194,
      135, 214, 192, 203, 165, 98, 21, 71, 68, 51, 45, 4, 144, 24, 23, 77, 146, 91,
      205, 50, 187, 201, 200, 18, 91, 106, 182, 90, 91, 181, 85, 84, 17, 206, 203, 36,
      148, 171, 140, 92, 40, 39, 193, 189, 244, 159, 158, 28, 247, 246, 161, 236, 3, 196,
      54, 68, 104, 193, 168, 8, 117, 228, 31, 189, 193, 55, 98, 97, 99, 126, 47, 100,
      166, 79, 218, 155, 154, 26, 209, 49, 131, 135, 136, 150, 47, 126, 217, 223, 52, 53,
      45, 51, 134, 211, 170, 140, 67, 69, 108, 43, 106, 91, 230, 119, 120, 226, 130, 247,
      63, 53, 52, 238, 20, 242, 46, 70, 156, 78, 62, 96, 46, 53, 63, 143, 34, 227,
      123, 117, 111, 44, 125, 19, 236, 134, 51, 216, 206, 205, 154, 153, 22, 39, 37, 167,
      200, 201, 208, 36, 142, 100, 57, 212, 202, 20, 60, 99, 28, 158, 157, 35, 226, 113,
      160, 159, 27, 204, 202, 210, 113, 225, 46, 43, 202, 204, 62, 76, 77, 137, 123, 116,
      41, 38, 72, 203, 129, 142, 64, 98, 240, 49, 102, 64, 41, 73, 74, 212, 216, 207,
      42, 74, 184, 169, 170, 211, 170, 149, 176, 105, 66, 69, 122, 6, 168, 123, 147, 187,
      96, 77, 90, 65, 55, 107, 89, 90, 180, 101, 100, 120, 63, 105, 104, 93, 137, 227,
      15, 86, 85, 129, 102, 49, 14, 87, 86, 55, 8, 9, 100, 47, 121, 145, 23, 22,
      88, 89, 179, 6, 122, 196, 88, 95, 96, 138, 172, 136, 215, 58, 172, 115, 48, 219,
      42, 80, 81, 195, 3, 51, 43, 146, 61, 171, 175, 199, 81, 82, 38, 53, 46, 225,
      144, 163, 110, 52, 65, 66, 229, 228, 117, 34, 127, 234, 107, 108, 69, 109, 108, 151,
      48, 64, 235, 62, 78, 191, 129, 209, 126, 111, 35, 143, 117, 123, 50, 222, 65, 52,
      19, 125, 141, 221, 55, 65, 3, 195, 197, 25, 7, 33, 220, 237, 44, 70, 71, 139,
      122, 193, 245, 247, 130, 33, 71, 21, 162, 170, 169, 150, 188, 174, 196, 216, 186, 92,
      144, 145, 24, 206, 216, 212, 98, 99, 26, 206, 97, 96, 3, 35, 143, 0, 11, 67,
      178, 177, 152, 75, 76, 140, 82, 81, 133, 203, 48, 149, 39, 38, 12, 234, 128, 127,
      162, 21, 54, 139, 71, 162, 222, 56, 55, 179, 89, 219, 124, 46, 156, 85, 15, 239,
      10, 151, 9, 160, 27, 29, 246, 247, 33, 140, 76, 148, 206, 96, 97, 77, 62, 191,
      78, 96, 62, 183, 42, 41, 0, 37, 11, 72, 38, 37, 121, 232, 120, 73, 72, 39,
      114, 128, 47, 233, 232, 128, 103, 104, 67, 152, 175, 148, 173, 157, 155, 119, 118, 101,
      74, 73, 40, 107, 9, 108, 49, 48, 131, 32, 194, 211, 184, 74, 185, 191, 80, 183,
      185, 40, 186, 119, 230, 118, 210, 202, 214, 84, 83, 17, 77, 76, 146, 161, 160, 30,
      190, 56, 173, 182, 106, 194, 138, 135, 192, 129, 203, 98, 54, 21, 68, 5, 51, 4,
      145, 144, 23, 90, 77, 91, 207, 205, 187, 83, 201, 18, 181, 91, 182, 180, 90, 181,
      16, 85, 17, 205, 206, 36, 176, 148, 140, 165, 92, 39, 245, 193, 244, 27, 159, 28,
      30, 247, 161, 174, 236, 196, 103, 54, 104, 55, 193, 8, 111, 117, 31, 221, 189, 55,
      240, 98, 99, 142, 126, 100, 219, 166, 218, 112, 155, 26, 198, 209, 131, 169, 135, 150,
      114, 47, 217, 224, 223, 53, 220, 45, 134, 32, 211, 140, 109, 67, 108, 146, 43, 91,
      231, 230, 120, 113, 226, 247, 105, 63, 52, 241, 238, 242, 124, 46, 156, 95, 78, 96,
      70, 46, 63, 116, 143, 227, 116, 123, 111, 1, 44, 19, 3, 236, 51, 207, 216, 205,
      26, 154, 22, 165, 39, 167, 199, 200, 208, 101, 36, 100, 43, 57, 202, 242, 20, 99,
      56, 28, 157, 124, 35, 113, 29, 160, 27, 211, 204, 210, 124, 113, 46, 106, 43, 204,
      96, 62, 77, 227, 137, 116, 73, 41, 72, 36, 203, 142, 235, 64, 240, 48, 49, 64,
      42, 41, 74, 214, 212, 207, 183, 42, 184, 210, 169, 211, 140, 170, 176, 104, 105, 69,
      193, 122, 168, 50, 123, 187, 89, 96, 90, 66, 65, 107, 179, 89, 180, 119, 101, 120,
      68, 63, 104, 234, 93, 227, 16, 15, 85, 209, 129, 49, 15, 14, 86, 107, 55, 9,
      120, 100, 121, 153, 145, 22, 178, 88, 179, 197, 6, 196, 89, 88, 96, 135, 138, 136,
      138, 215, 172, 218, 115, 219, 41, 42, 81, 5, 195, 51, 57, 43, 61, 208, 171, 199,
      41, 81, 38, 224, 53, 225, 24, 144, 110, 105, 52, 66, 118, 229, 117, 227, 34, 234,
      66, 107, 69, 10, 109, 151, 219, 48, 235, 183, 62, 191, 142, 129, 126, 116, 111, 143,
      205, 123, 50, 222, 221, 65, 141, 19, 125, 6, 220, 44, 237, 171, 139, 193, 122, 245,
      247, 33, 7, 154, 246, 33, 22, 71, 162, 170, 150, 169, 188, 196, 174, 217, 186, 92,
      145, 24, 144, 163, 206, 212, 98, 26, 99, 203, 206, 96, 4, 3, 143, 11, 0, 67,
      151, 178, 152, 76, 75, 140, 133, 82, 81, 204, 203, 149, 37, 39, 12, 127, 234, 127,
      162, 54, 21, 139, 162, 71, 194, 222, 55, 178, 179, 219, 46, 124, 156, 239, 85, 15,
      151, 10, 9, 159, 160, 29, 30, 246, 33, 148, 140, 76, 97, 206, 97, 191, 77, 62,
      177, 78, 62, 41, 183, 41, 11, 0, 11, 72, 37, 38, 232, 121, 120, 39, 73, 39,
      128, 114, 47, 232, 233, 128, 103, 67, 104, 175, 152, 148, 157, 173, 155, 118, 119, 101,
      73, 74, 40, 151, 107, 108, 48, 49, 131, 194, 32, 211, 74, 184, 185, 80, 191, 183,
      40, 185, 186, 230, 119, 118, 202, 210, 214, 83, 84, 17, 76, 77, 146, 160, 161, 30,
      56, 190, 173, 106, 182, 194, 135, 138, 192, 203, 129, 98, 21, 54, 68, 51, 5, 4,
      144, 145, 23, 77, 90, 91, 205, 207, 187, 201, 83, 18, 91, 181, 182, 90, 180, 181,
      85, 16, 17, 206, 205, 36, 148, 176, 140, 92, 165, 39, 193, 245, 244, 159, 27, 28,
      247, 30, 161, 236, 174, 196, 54, 103, 104, 193, 55, 8, 117, 111, 31, 189, 221, 55,
      98, 240, 99, 126, 142, 100, 166, 219, 218, 155, 112, 26, 209, 198, 131, 135, 169, 150,
      47, 114, 217, 223, 224, 53, 45, 220, 134, 211, 32, 140, 67, 109, 108, 43, 146, 91,
      230, 231, 120, 226, 113, 247, 63, 105, 52, 238, 241, 242, 46, 124, 156, 78, 95, 96,
      46, 70, 63, 143, 116, 227, 123, 116, 111, 44, 1, 19, 236, 3, 51, 216, 207, 205,
      154, 26, 22, 39, 165, 167, 200, 199, 208, 36, 101, 100, 57, 43, 202, 20, 242, 99,
      28, 56, 157, 35, 124, 113, 160, 29, 27, 204, 211, 210, 113, 124, 46, 43, 106, 204,
      62, 96, 77, 137, 227, 116, 41, 73, 72, 203, 36, 142, 64, 235, 240, 49, 48, 64,
      41, 42, 74, 212, 214, 207, 42, 183, 184, 169, 210, 211, 170, 140, 176, 105, 104, 69,
      122, 193, 168, 123, 50, 187, 96, 89, 90, 65, 66, 107, 89, 179, 180, 101, 119, 120,
      63, 68, 104, 93, 234, 227, 15, 16, 85, 129, 209, 49, 14, 15, 86, 55, 107, 9,
      100, 120, 121, 145, 153, 22, 88, 178, 179, 6, 197, 196, 88, 89, 96, 138, 135, 136,
      215, 138, 172, 115, 218, 219, 42, 41, 81, 195, 5, 51, 43, 57, 61, 171, 208, 199,
      81, 41, 38, 53, 224, 225, 144, 24, 110, 52, 105, 66, 229, 118, 117, 34, 227, 234,
      107, 66, 69, 109, 10, 151, 48, 219, 235, 62, 183, 191, 129, 142, 126, 111, 116, 143,
      123, 205, 50, 221, 222, 65, 19, 141, 125, 220, 6, 44, 171, 237, 139, 122, 193, 245,
      33, 247, 7, 246, 154, 33, 71, 22, 162, 150, 170, 169, 174, 188, 196, 186, 217, 92,
      24, 145, 144, 206, 163, 212, 26, 98, 99, 206, 203, 96, 3, 4, 143, 0, 11, 67,
      178, 151, 152, 75, 76, 140, 82, 133, 81, 203, 204, 149, 39, 37, 12, 234, 127, 127,
      54, 162, 21, 162, 139, 71, 222, 194, 55, 179, 178, 219, 124, 46, 156, 85, 239, 15,
    ];

    ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
    ctx.lineWidth = 1;

    // 各三角形のワイヤーフレームを描画
    // FACE_MESH_TRIANGLESは連続した3つのインデックスで1つの三角形を表す
    for (let i = 0; i < FACE_MESH_TRIANGLES.length; i += 3) {
      const idx0 = FACE_MESH_TRIANGLES[i];
      const idx1 = FACE_MESH_TRIANGLES[i + 1];
      const idx2 = FACE_MESH_TRIANGLES[i + 2];

      if (idx0 < landmarks.length && idx1 < landmarks.length && idx2 < landmarks.length) {
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
