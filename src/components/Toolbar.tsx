import type { RecordingStatus } from '../hooks/useRecording';

interface ToolbarProps {
  showAvatar: boolean;
  onToggleAvatar: () => void;
  onRecalibrate: () => void;
  recordingStatus: RecordingStatus;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function Toolbar({
  showAvatar,
  onToggleAvatar,
  onRecalibrate,
  recordingStatus,
  onStartRecording,
  onStopRecording,
}: ToolbarProps) {
  const isRecording = recordingStatus === 'recording';
  const isStopping = recordingStatus === 'stopping';

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-900/80 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="text-white font-bold text-sm">FaceFlick</span>
        {isRecording && (
          <span className="flex items-center gap-1 text-red-500 text-xs">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            REC
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {/* 録画ボタン */}
        {isRecording || isStopping ? (
          <button
            onClick={onStopRecording}
            disabled={isStopping}
            className="px-3 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isStopping ? '停止中...' : '録画停止'}
          </button>
        ) : (
          <button
            onClick={onStartRecording}
            className="px-3 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            録画
          </button>
        )}
        <button
          onClick={onToggleAvatar}
          className={`px-3 py-1 rounded text-xs transition-colors ${
            showAvatar
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300'
          }`}
        >
          {showAvatar ? 'Avatar ON' : 'Avatar OFF'}
        </button>
        <button
          onClick={onRecalibrate}
          className="px-3 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
        >
          再調整
        </button>
      </div>
    </div>
  );
}
