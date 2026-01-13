/**
 * 頭の回転履歴からジェスチャーを検出するユーティリティ
 */

export interface HeadRotationSample {
  yaw: number;
  pitch: number;
  roll: number;
  timestamp: number;
}

/**
 * 頭の回転履歴からジェスチャーを検出
 * 現在は「首振り（head_shake）」のみ対応
 */
export function detectGesture(
  history: HeadRotationSample[]
): 'head_shake' | null {
  // 最低0.3秒のデータが必要（左→右→左の動きを検出）
  if (history.length < 6) return null;

  const timeSpan = history[history.length - 1].timestamp - history[0].timestamp;
  if (timeSpan < 300) return null;

  // ヘッドシェイク検出（左右に振る）
  // yaw値の変化を見て、方向転換が2回以上あるかチェック
  let yawDirectionChanges = 0;
  let lastYawDirection: 'left' | 'right' | null = null;

  for (let i = 1; i < history.length; i++) {
    const yawDiff = history[i].yaw - history[i - 1].yaw;
    if (Math.abs(yawDiff) > 2) { // 2度以上の変化
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

  return null;
}
