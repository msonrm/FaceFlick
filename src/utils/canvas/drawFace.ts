import { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type FaceDisplayMode = 'none' | 'points' | 'mesh' | 'vrm';

export interface DrawFaceLandmarksOptions {
  ctx: CanvasRenderingContext2D;
  landmarks: NormalizedLandmark[];
  width: number;
  height: number;
  displayMode: FaceDisplayMode;
}

/**
 * 顔のランドマークを描画する（モードに応じてポイントまたはメッシュ）
 */
export function drawFaceLandmarks(options: DrawFaceLandmarksOptions): void {
  const { ctx, landmarks, width, height, displayMode } = options;

  if (displayMode === 'none') {
    return;
  }

  if (displayMode === 'points') {
    drawFacePoints(ctx, landmarks, width, height);
  } else if (displayMode === 'mesh') {
    drawFaceMesh(ctx, landmarks, width, height);
  }
}

/**
 * ポイント表示（Instagram風 with glow）
 */
function drawFacePoints(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number
): void {
  for (const landmark of landmarks) {
    const x = width - landmark.x * width; // 反転
    const y = landmark.y * height;

    // 多層グローエフェクト（外側から内側へ）
    // 外側の大きなグロー
    ctx.shadowBlur = 30;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fill();

    // 中間のグロー
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(255, 255, 255, 1.0)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
    ctx.fill();

    // 中心の明るい点
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(255, 255, 255, 1.0)';
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.beginPath();
    ctx.arc(x, y, 0.8, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Shadowをリセット
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

/**
 * メッシュ表示（Max Headroom風ワイヤーフレーム）
 * SNES風フラットシェーディング + ランバート反射
 */
function drawFaceMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number
): void {
  // ストロークとぼかしでポリゴンのエッジを目立たなくする
  ctx.save();

  // 光源方向（正規化されたベクトル）: 左上から
  const lightDir = { x: 0.5, y: -0.8, z: 0.3 };
  const lightMag = Math.sqrt(lightDir.x ** 2 + lightDir.y ** 2 + lightDir.z ** 2);
  const light = {
    x: lightDir.x / lightMag,
    y: lightDir.y / lightMag,
    z: lightDir.z / lightMag
  };

  // サンドグレイ（#c9c9c2 = rgb(201, 201, 194)）
  const sandGray = { r: 201, g: 201, b: 194 };
  // 白（rgb(255, 255, 255)）
  const white = { r: 255, g: 255, b: 255 };

  const connections = FaceLandmarker.FACE_LANDMARKS_TESSELATION;

  // 3つの連続したConnectionから三角形を構成
  // 各三角形は3つの辺で定義される: (A,B), (B,C), (C,A)
  for (let i = 0; i < connections.length; i += 3) {
    if (i + 2 >= connections.length) break;

    const c0 = connections[i];
    const c1 = connections[i + 1];
    const c2 = connections[i + 2];

    // 3つの辺から3つのユニークな頂点を抽出（順序を保持）
    // 最初の辺から開始して、接続された辺を追跡
    const allIndices = [c0.start, c0.end, c1.start, c1.end, c2.start, c2.end];
    const uniqueIndices = Array.from(new Set(allIndices));

    // 正しく3つの頂点が見つからない場合はスキップ
    if (uniqueIndices.length !== 3) continue;

    // 最初の辺の頂点順序を使用
    const i0 = c0.start;
    const i1 = c0.end;
    // 3番目の頂点は、c0に含まれない頂点
    const i2 = uniqueIndices.find(idx => idx !== i0 && idx !== i1)!;

    if (i0 >= landmarks.length || i1 >= landmarks.length || i2 >= landmarks.length) continue;

    const lm0 = landmarks[i0];
    const lm1 = landmarks[i1];
    const lm2 = landmarks[i2];

    if (!lm0 || !lm1 || !lm2) continue;

    // 法線ベクトルを正規化された3D座標系で計算（スクリーン変換前）
    // MediaPipeのz座標は小さいスケールなので拡大して使用
    const zScale = 50; // z座標を大幅に拡大して立体感を強調
    const v1 = {
      x: lm1.x - lm0.x,
      y: lm1.y - lm0.y,
      z: ((lm1.z || 0) - (lm0.z || 0)) * zScale
    };
    const v2 = {
      x: lm2.x - lm0.x,
      y: lm2.y - lm0.y,
      z: ((lm2.z || 0) - (lm0.z || 0)) * zScale
    };

    // 外積で法線ベクトルを計算
    const normal = {
      x: v1.y * v2.z - v1.z * v2.y,
      y: v1.z * v2.x - v1.x * v2.z,
      z: v1.x * v2.y - v1.y * v2.x
    };

    // 法線を正規化
    const normalMag = Math.sqrt(normal.x ** 2 + normal.y ** 2 + normal.z ** 2);
    if (normalMag < 0.0001) continue; // 退化した三角形をスキップ

    const n = {
      x: normal.x / normalMag,
      y: normal.y / normalMag,
      z: normal.z / normalMag
    };

    // ランバート反射：内積を計算
    let diffuse = n.x * light.x + n.y * light.y + n.z * light.z;
    diffuse = Math.max(0.7, Math.min(1.0, diffuse)); // アンビエント 0.7（より明るく）

    // diffuse値（0.7〜1.0）をサンドグレイから白にマッピング
    // diffuse = 0.7 → サンドグレイ、diffuse = 1.0 → 白
    const t = (diffuse - 0.7) / 0.3; // 0.0〜1.0に正規化
    const r = Math.floor(sandGray.r + (white.r - sandGray.r) * t);
    const g = Math.floor(sandGray.g + (white.g - sandGray.g) * t);
    const b = Math.floor(sandGray.b + (white.b - sandGray.b) * t);

    // スクリーン座標に変換（描画用）
    const p0 = {
      x: width - lm0.x * width, // 反転
      y: lm0.y * height
    };
    const p1 = {
      x: width - lm1.x * width,
      y: lm1.y * height
    };
    const p2 = {
      x: width - lm2.x * width,
      y: lm2.y * height
    };

    // 三角形を塗りつぶし（フラットシェーディング）
    const color = `rgb(${r}, ${g}, ${b})`;

    // ぼかし効果でエッジを柔らかく
    ctx.shadowBlur = 1;
    ctx.shadowColor = color;

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;

    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // エフェクトをリセット
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.restore();
}
