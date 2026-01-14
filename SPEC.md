# FaceFlick 技術仕様書

## 概要

FaceFlickは、顔の動きだけで日本語フリック入力を行うWebアプリケーション。
手を使わずに文字入力ができるアクセシビリティツール。

## 技術スタック

### コア技術
- **フレームワーク**: React + TypeScript + Vite
- **顔認識**: MediaPipe Face Landmarker (@mediapipe/tasks-vision)
- **3Dアバター**: Three.js + @pixiv/three-vrm + Kalidokit
- **スタイリング**: Tailwind CSS

### 主要ファイル（再利用可能）
```
src/
├── hooks/
│   ├── useCamera.ts          # カメラアクセス（動作確認済）
│   ├── useFaceLandmarker.ts  # 顔認識（動作確認済）
│   ├── useVRMAvatar.ts       # VRMロード（動作確認済）
│   └── useRecording.ts       # 画面録画
├── utils/
│   ├── face-detection.ts     # 顔分析・トリガー判定（動作確認済）
│   ├── input-logic.ts        # キー選択・フリック判定（動作確認済）
│   ├── keyboard-layout.ts    # キーボード配列定義
│   ├── gesture-detection.ts  # ジェスチャー検出（動作確認済）
│   ├── character-utils.ts    # 濁点・半濁点・小文字変換
│   ├── speech.ts             # 音声読み上げ
│   └── vrm/
│       └── applyMediaPipeToVRM.ts  # VRM表情適用（動作確認済）
└── types/
    └── index.ts              # 型定義
```

---

## キーボード配列

### 3x4 フリックキーボード
```
┌─────────┬─────────┬─────────┐
│ あ行    │ か行    │ さ行    │  Row 0
│あいうえお│かきくけこ│さしすせそ│
├─────────┼─────────┼─────────┤
│ た行    │ な行    │ は行    │  Row 1
│たちつてと│なにぬねの│はひふへほ│
├─────────┼─────────┼─────────┤
│ ま行    │ や行    │ ら行    │  Row 2
│まみむめも│や「ゆ」よ│らりるれろ│
├─────────┼─────────┼─────────┤
│ ゛゜小  │ わ行    │ 記号    │  Row 3
│(トグル) │わをんー〜│、。？！…│
└─────────┴─────────┴─────────┘
  Col 0     Col 1     Col 2
```

### フリック方向
- **中央タップ**: base文字（あ、か、さ...）
- **上フリック**: up文字（う、く、す...）
- **下フリック**: down文字（お、こ、そ...）
- **左フリック**: left文字（い、き、し...）
- **右フリック**: right文字（え、け、せ...）

---

## 入力フロー

### 1. キー選択（頭の向き）
```
頭の向き (yaw, pitch)
    ↓
キャリブレーション範囲で正規化
    ↓
3x4グリッドにマッピング
    ↓
選択中のキーをハイライト表示
```

**マッピングロジック**:
- `yaw` (左右): 3分割 → Col 0/1/2
- `pitch` (上下): 4分割 → Row 0/1/2/3
- 鏡像反転: 顔を左に振る → 右列を選択

### 2. トリガー（入力開始）
| トリガー | Blendshape | 開始閾値 | 終了閾値 |
|----------|------------|----------|----------|
| 口開け   | jawOpen    | 0.5      | 0.2      |
| 口すぼめ | mouthPucker| 0.4      | 0.2      |

**ヒステリシス**: 開始閾値を超えたら入力開始、終了閾値を下回ったら入力確定

### 3. フリック（文字選択）
```
トリガー維持中に頭を動かす
    ↓
ホールド位置からの相対移動量を計算
    ↓
閾値を超えた方向をフリック方向として認識
    ↓
トリガー解除で文字確定
```

**フリック閾値**: キー端では外側方向に敏感、内側方向に鈍感（エッジ補正）

### 4. 入力状態遷移
```
idle → (トリガー開始 + 0.4秒ホールド) → selecting
selecting → (フリック検出) → flicking
selecting/flicking → (トリガー解除) → idle (文字確定)
```

---

## ジェスチャー

### 首振り（バックスペース）
- **検出条件**: yaw値の方向転換が2回以上（0.3秒以内）
- **動作**: 直前の1文字を削除

### 笑顔（読み上げ＆クリア）
- **検出条件**:
  - 「や」キー上にフォーカス
  - mouthSmileLeft/Right ≥ 0.6
  - 1.5秒間維持
- **動作**: 入力テキストを読み上げ → テキストクリア

### 眉上げ（読み上げ＆クリア）
- **検出条件**:
  - 「や」キー上にフォーカス
  - browInnerUp ≥ キャリブレーション値 + 0.2
  - 1.5秒間維持
- **動作**: 入力テキストを読み上げ → テキストクリア

---

## キャリブレーション

### 初期キャリブレーション（3秒）
起動時に実行。ユーザーが正面を向いた状態で3秒間サンプリング。

**設定される値**:
- `baseYaw` / `basePitch`: 顔の中心位置
- `yawRange` / `pitchRange`: キーボードの有効範囲
- `jawOpenBaseValue` / `mouthPuckerBaseValue`: 口の基準値
- `browInnerUpBaseValue`: 眉の基準値
- 各終了閾値: ベース値 + 0.1

### キャリブレーション設定
```typescript
interface CalibrationSettings {
  yawRange: { min: number; max: number };      // デフォルト: ±20度
  pitchRange: { min: number; max: number };    // デフォルト: -1〜10度
  jawOpenThreshold: number;                    // 開始閾値 (0.5)
  mouthPuckerThreshold: number;                // 開始閾値 (0.4)
  smileThreshold: number;                      // 笑顔閾値 (0.6)
  browInnerUpThreshold: number;                // 眉上げ閾値
  jawOpenEndThreshold: number;                 // 終了閾値
  mouthPuckerEndThreshold: number;             // 終了閾値
  gridSensitivity: number;                     // グリッド感度 (15度)
  flickSensitivity: number;                    // フリック感度 (10度)
}
```

---

## VRM アバター

### ファイル
- **パス**: `/public/models/avatar.vrm`
- **フォーマット**: VRM 1.0

### MediaPipe → VRM マッピング
```typescript
// 頭部回転（Kalidokit経由）
headBone.rotation.set(
  riggedFace.head.x * 0.8,  // Pitch
  riggedFace.head.y * 0.8,  // Yaw
  riggedFace.head.z * 0.5   // Roll
);

// Blendshapes → VRM Expression
jawOpen       → 'aa' (あ口)
mouthPucker   → 'ou' (お・う口)
mouthSmile*   → 'happy'
eyeBlink*     → 'blinkLeft/Right'
browInnerUp   → 'surprised'
```

### カメラ位置
```javascript
camera.position.set(0, 1.0, 3.0);
camera.lookAt(0, 1, 0);
camera.fov = 30;
```

---

## 文字変換

### 濁点・半濁点・小文字トグル
「゛゜小」キーで直前の文字を変換:
```
か→が→か
は→ば→ぱ→は
つ→っ→づ→つ
あ→ぁ→あ
や→ゃ→や
```

---

## 音声読み上げ

```typescript
speakText(text: string, voice: VoiceType): void

// VoiceType
- 'robot_low':    { rate: 1.0, pitch: 0.8 }
- 'robot_normal': { rate: 1.0, pitch: 1.0 }
- 'human_high':   { rate: 1.0, pitch: 1.2 }  // デフォルト
```

---

## 画面モード

### フェイス表示モード
- `'none'`: 顔表示なし（カメラ背景のみ）
- `'points'`: ランドマークポイント表示
- `'vrm'`: VRMアバター表示

---

## 既知の問題・再設計の推奨事項

### 現在の問題
1. **Canvas要素の二重構造**: 2D Canvas (キーボード) + WebGL Canvas (VRM) のz-index管理が複雑
2. **画面遷移時のCanvas切り替え**: キャリブレーション画面→メイン画面で別のDOM要素になりThree.jsの再初期化が困難
3. **アニメーションループの管理**: requestAnimationFrameとReactのライフサイクルの競合

### 推奨アーキテクチャ
1. **単一のキャンバス戦略**: WebGL Canvas一本化、キーボードもThree.jsで描画
2. **コンポーネント分離**: キャリブレーション/メイン画面を別コンポーネントにせず、状態で切り替え
3. **Canvasの永続化**: 条件付きレンダリングを避け、常に同じCanvas要素を維持

---

## デフォルト値一覧

```typescript
// 閾値
JAW_OPEN_THRESHOLD = 0.5
MOUTH_PUCKER_THRESHOLD = 0.4
SMILE_THRESHOLD = 0.6
BROW_INNER_UP_THRESHOLD = 0.5

// 感度
GRID_SENSITIVITY = 15  // 度
FLICK_SENSITIVITY = 10 // 度

// タイミング
HOLD_DELAY_MS = 400           // トリガーホールド時間
GESTURE_COOLDOWN_MS = 1000    // ジェスチャー後のクールダウン
CONFIRM_COOLDOWN_MS = 300     // 文字確定後のクールダウン
FACE_LOST_TIMEOUT_MS = 300    // 顔認識ロスト判定時間
SMILE_HOLD_MS = 1500          // 笑顔ホールド時間
BROW_HOLD_MS = 1500           // 眉上げホールド時間

// EMA平滑化係数
HEAD_ROTATION_ALPHA = 0.4     // 頭の回転（通常時）
HEAD_ROTATION_ALPHA_FLICK = 0.7  // 頭の回転（フリック中）
BLENDSHAPES_ALPHA = 0.7       // Blendshapes
```

---

## 依存パッケージ

```json
{
  "@mediapipe/tasks-vision": "顔認識",
  "@pixiv/three-vrm": "VRMローダー・ランタイム",
  "kalidokit": "MediaPipe→アバター変換",
  "three": "3Dレンダリング"
}
```
