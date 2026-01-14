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

### アーキテクチャ

```
┌─────────────────────────────────┐
│  z-index: 30  入力テキスト表示   │  ← HTML/CSS
├─────────────────────────────────┤
│  z-index: 20  キーボード        │  ← HTML/CSS (Tailwind)
├─────────────────────────────────┤
│  z-index: 10  VRM アバター      │  ← WebGL Canvas
├─────────────────────────────────┤
│  z-index: 0   カメラ映像        │  ← Video要素
└─────────────────────────────────┘
```

**設計方針**:
- キーボードはHTML/CSSで描画（Three.jsではなく）
- WebGL CanvasはVRMアバターのみ担当
- 画面遷移なし：状態（loading → calibrating → ready）で表示を切り替え
- useReducerによる一元的な状態管理

### 主要ファイル
```
src/
├── components/
│   ├── FaceFlickCanvas.tsx   # メインコンポーネント
│   ├── Keyboard.tsx          # キーボードUI（HTML/CSS）
│   └── Overlays.tsx          # ローディング/キャリブレーション/エラー
├── hooks/
│   ├── useAppState.ts        # アプリ状態管理（useReducer）
│   ├── useCamera.ts          # カメラアクセス
│   ├── useFaceLandmarker.ts  # 顔認識
│   ├── useVRMAvatar.ts       # VRMロード
│   └── useRecording.ts       # 画面録画
├── utils/
│   ├── face-detection.ts     # 顔分析・トリガー判定
│   ├── input-logic.ts        # キー選択・フリック判定
│   ├── keyboard-layout.ts    # キーボード配列・定数
│   ├── gesture-detection.ts  # ジェスチャー検出
│   ├── character-utils.ts    # 濁点・半濁点・小文字変換
│   ├── speech.ts             # 音声読み上げ
│   └── vrm/
│       └── applyMediaPipeToVRM.ts  # VRM表情適用
└── types/
    └── index.ts              # 型定義
```

---

## キーボードレイアウト

### レイアウトモード切り替え

アプリはキーボードレイアウトを動的に切り替え可能：

| モードID | 名前 | タイプ | グリッドサイズ |
|----------|------|--------|---------------|
| `flick-3x4` | フリック 3×4 | flick | 4行×3列 |
| `tap-5x10` | 50音 5×10 | tap | 10行×5列 |

新しいレイアウトは `keyboard-layout.ts` の `KEYBOARD_LAYOUTS` に追加で登録可能。

### フリック3×4レイアウト（デフォルト）
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
- **中央（center）**: base文字（あ、か、さ...）
- **上（up）**: up文字（う、く、す...）
- **下（down）**: down文字（お、こ、そ...）
- **左（left）**: left文字（い、き、し...）
- **右（right）**: right文字（え、け、せ...）

---

## アプリケーション状態

### フェーズ遷移
```
loading → calibrating → ready
   │           │           │
   │           │           └─ 入力可能
   │           └─ 自動キャリブレーション実行中
   └─ リソース読み込み中（カメラ、顔認識、VRM）
```

### 入力状態遷移
```
idle → (トリガー開始 + 0.4秒ホールド) → selecting
selecting → (フリック検出) → flicking
selecting/flicking → (トリガー解除) → idle (文字確定)
```

### 状態管理（useReducer）
```typescript
interface AppState {
  phase: 'loading' | 'calibrating' | 'ready';
  input: {
    phase: 'idle' | 'selecting' | 'flicking';
    selectedKey: KeyPosition | null;
    flickDirection: FlickDirection;
    holdPosition: { yaw: number; pitch: number } | null;
    previewChar: string | null;
  };
  text: string;
  calibration: CalibrationSettings | null;
  keyboardModeId: string;
  faceDisplayMode: 'none' | 'vrm';
  error: AppError | null;
}
```

---

## 入力フロー

### 1. キー選択（頭の向き）
```
頭の向き (yaw, pitch)
    ↓
キャリブレーション範囲で正規化
    ↓
グリッドにマッピング（レイアウトに応じて）
    ↓
選択中のキーをハイライト表示
```

**マッピングロジック**:
- `yaw` (左右): 列数で分割
- `pitch` (上下): 行数で分割
- 鏡像反転: 顔を左に振る → 右列を選択

### 2. トリガー（入力開始）

**シンプル化**: `jawOpen` と `mouthPucker` を統一した閾値で判定

| 状態 | 判定 |
|------|------|
| トリガー開始 | max(jawOpen, mouthPucker) > 0.45 |
| トリガー終了 | max(jawOpen, mouthPucker) < 0.2 |

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

---

## キャリブレーション

### 自動キャリブレーション
メイン画面ロード後に自動実行。安定検出で自動完了。

| 条件 | 値 |
|------|-----|
| 最低時間 | 2秒 |
| 最大時間 | 5秒 |
| 安定判定 | 標準偏差 < 2度 |

**設定される値**:
- `baseYaw` / `basePitch`: 顔の中心位置
- `yawRange` / `pitchRange`: キーボードの有効範囲
- `browInnerUpBaseValue`: 眉の基準値
- トリガー閾値（統一）

### CalibrationSettings
```typescript
interface CalibrationSettings {
  baseYaw: number;
  basePitch: number;
  yawRange: { min: number; max: number };
  pitchRange: { min: number; max: number };
  triggerThreshold: number;       // 統一開始閾値 (0.45)
  triggerEndThreshold: number;    // 統一終了閾値 (0.2)
  smileThreshold: number;         // 笑顔閾値 (0.6)
  browInnerUpThreshold: number;   // 眉上げ閾値差分 (0.2)
  browInnerUpBaseValue: number;   // 眉の基準値
  gridSensitivity: number;        // グリッド感度 (15度)
  flickSensitivity: number;       // フリック感度 (10度)
}
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

## パフォーマンス最適化

### 顔認識の頻度制御
- 顔認識: 30fps（~33ms間隔）
- VRM描画: 60fps（requestAnimationFrame）

```typescript
const DETECTION_INTERVAL_MS = 33; // ~30fps

// アニメーションループ内
if (timestamp - lastDetectionTime >= DETECTION_INTERVAL_MS) {
  detectFace(video, timestamp);
  lastDetectionTime = timestamp;
}
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
- `'vrm'`: VRMアバター表示

---

## デフォルト値一覧

```typescript
// 閾値
DEFAULT_TRIGGER_THRESHOLD = 0.45    // 統一トリガー開始閾値
DEFAULT_TRIGGER_END_THRESHOLD = 0.2 // 統一トリガー終了閾値
SMILE_THRESHOLD = 0.6
BROW_THRESHOLD = 0.5

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
CALIBRATION_MIN_MS = 2000     // キャリブレーション最低時間
CALIBRATION_MAX_MS = 5000     // キャリブレーション最大時間
CALIBRATION_STABILITY_THRESHOLD = 2 // 安定判定の標準偏差閾値（度）

// 顔認識頻度
DETECTION_INTERVAL_MS = 33    // ~30fps

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
