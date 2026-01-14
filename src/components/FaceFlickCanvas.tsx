/**
 * FaceFlickCanvas - 最小構成
 *
 * 再実装時はSPEC.mdを参照してください。
 *
 * 利用可能なhooks/utils:
 * - useCamera: カメラアクセス
 * - useFaceLandmarker: 顔認識
 * - useVRMAvatar: VRMロード
 * - analyzeFace: 顔分析・トリガー判定
 * - getSelectedKey, getFlickDirection, getCharFromFlick: 入力ロジック
 * - detectGesture: ジェスチャー検出
 * - applyMediaPipeToVRM: VRM表情適用
 * - toggleCharacter, vibrate: 文字変換・振動
 * - speakText: 音声読み上げ
 */

export function FaceFlickCanvas() {
  return (
    <div className="flex items-center justify-center w-full h-full bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">FaceFlick</h1>
        <p className="text-gray-400">再実装待ち</p>
        <p className="text-gray-500 text-sm mt-2">SPEC.mdを参照</p>
      </div>
    </div>
  );
}
