import type { FaceDisplayMode } from '../utils/canvas';

interface ToolbarProps {
  isRecording: boolean;
  onRecordToggle: () => void;
  faceDisplayMode: FaceDisplayMode;
  onFaceDisplayModeChange: () => void;
  showDebugInfo: boolean;
  onDebugInfoToggle: () => void;
  onCalibrationOpen: () => void;
}

export function Toolbar({
  isRecording,
  onRecordToggle,
  faceDisplayMode,
  onFaceDisplayModeChange,
  showDebugInfo,
  onDebugInfoToggle,
  onCalibrationOpen,
}: ToolbarProps) {
  return (
    <div
      className="absolute top-0 left-0 right-0 backdrop-blur-md bg-black/60 px-4 py-2 flex items-center justify-between z-10"
      style={{ height: '50px' }}
    >
      {/* タイトル（左寄せ） */}
      <div className="text-white text-lg font-semibold tracking-wide">
        Face Flick
      </div>

      {/* 右側のボタン群 */}
      <div className="flex gap-2">
        {/* 録画ボタン */}
        <button
          onClick={onRecordToggle}
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
          onClick={onFaceDisplayModeChange}
          className="w-10 h-10 bg-white/30 hover:bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
          title={`顔表示: ${faceDisplayMode === 'none' ? '非表示' : faceDisplayMode === 'points' ? 'ポイント' : 'メッシュ'}`}
        >
          <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>
            {faceDisplayMode === 'none' ? 'visibility_off' : faceDisplayMode === 'points' ? 'blur_on' : 'grid_on'}
          </span>
        </button>

        {/* デバッグ情報トグルボタン */}
        <button
          onClick={onDebugInfoToggle}
          className="w-10 h-10 bg-white/30 hover:bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
          title={showDebugInfo ? 'デバッグ情報を非表示' : 'デバッグ情報を表示'}
        >
          <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>
            {showDebugInfo ? 'code' : 'code_off'}
          </span>
        </button>

        {/* キャリブレーションボタン */}
        <button
          onClick={onCalibrationOpen}
          className="w-10 h-10 bg-white/30 hover:bg-white/40 backdrop-blur-sm rounded-full flex items-center justify-center transition-all"
          title="設定"
        >
          <span className="material-symbols-outlined text-white" style={{ fontSize: '20px' }}>
            settings
          </span>
        </button>
      </div>
    </div>
  );
}
