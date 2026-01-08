# FaceFlick

顔の動きと口の開閉でフリック入力を行うWebアプリケーション

## 概要

FaceFlickは、顔の向きと口の開閉を認識して日本語フリック入力を実現するアクセシビリティWebアプリです。MediaPipe Face Landmarkerを使用して高精度な顔検出を実現し、Canvas APIによる高速な描画と録画機能を提供します。

## 主な機能

- リアルタイム顔検出とジェスチャー認識
- Canvas APIによる高速レンダリング
- 録画機能（Media Stream Recording API使用）
- 完全なWebアプリケーション（インストール不要）

## 操作方法

1. **キーの選択**: 顔を上下左右に動かして、3×4のキーボードグリッドから入力したいキーを選択
2. **キーの押下**: 口を開けてキーを「長押し」状態にする
3. **フリック入力**: 口を開けたまま顔を動かして、フリック方向を指定
   - 上: 上方向にフリック（例: あ→い）
   - 下: 下方向にフリック（例: あ→う）
   - 左: 左方向にフリック（例: あ→え）
   - 右: 右方向にフリック（例: あ→お）
4. **入力確定**: 口を閉じて文字を確定

## キーボード配列

```
あ(あいうえお) | か(かきくけこ) | さ(さしすせそ)
た(たちつてと) | な(なにぬねの) | は(はひふへほ)
ま(まみむめも) | や(（ゆ）よ)   | ら(らりるれろ)
゛(゛゜小)    | わ(をんー〜)   | ⌫(バックスペース)
```

## 技術スタック

- **React**: UIライブラリ
- **Vite**: 高速ビルドツール
- **TypeScript**: 型安全な開発
- **Tailwind CSS**: ユーティリティファーストCSSフレームワーク
- **MediaPipe Tasks Vision**: 顔検出・ランドマーク検出（Web版）
- **HTML5 Canvas API**: 高速描画
- **Media Stream Recording API**: 録画機能
- **Vercel**: デプロイプラットフォーム

## セットアップ

### 開発環境

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview
```

### Vercelへのデプロイ

```bash
# Vercel CLIのインストール（初回のみ）
npm i -g vercel

# デプロイ
vercel

# 本番環境へのデプロイ
vercel --prod
```

または、GitHubリポジトリを連携してVercelで自動デプロイ設定が可能です。

## 必要な権限

- **カメラ**: 顔の検出に必要（ブラウザで許可してください）

## プロジェクト構造

```
src/
├── main.tsx                  # アプリケーションエントリーポイント
├── App.tsx                   # メインアプリケーションコンポーネント
├── components/
│   └── FaceFlickCanvas.tsx  # Canvas描画とメインロジック
├── hooks/
│   ├── useCamera.ts         # カメラアクセスフック
│   ├── useFaceLandmarker.ts # MediaPipe顔検出フック
│   └── useRecording.ts      # 録画機能フック
├── types/
│   └── index.ts             # TypeScript型定義
└── utils/
    ├── face-detection.ts    # 顔検出解析ロジック
    ├── input-logic.ts       # 入力判定ロジック
    └── keyboard-layout.ts   # キーボード配列定義
```

## 入力フロー

```
[待機] → 口を開ける → [選択中] → 顔を動かす → [フリック中] → 口を閉じる → [入力確定]
                          ↓
                    口を閉じる（フリックなし）
                          ↓
                    [入力確定]
```

## 設定可能なパラメータ

`src/utils/keyboard-layout.ts`で以下の値を調整できます：

- `MOUTH_OPEN_THRESHOLD`: 口が開いていると判定する閾値（デフォルト: 0.3）
- `GRID_SENSITIVITY`: グリッド選択の感度（デフォルト: 15度）
- `FLICK_SENSITIVITY`: フリック判定の感度（デフォルト: 20度）

## ブラウザ要件

- モダンブラウザ（Chrome, Edge, Safari, Firefox）
- WebRTC対応（カメラアクセスに必要）
- WebAssembly対応（MediaPipeに必要）

## パフォーマンス最適化

- Canvas APIによる直接描画で高速レンダリング
- MediaPipe GPUデリゲートによる高速顔検出
- 30fpsでの安定した録画

## ライセンス

MIT

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を議論してください。
