interface ToolbarProps {
  showAvatar: boolean;
  onToggleAvatar: () => void;
  onRecalibrate: () => void;
}

export function Toolbar({ showAvatar, onToggleAvatar, onRecalibrate }: ToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-gray-900/80 backdrop-blur-sm">
      <div className="text-white font-bold text-sm">FaceFlick</div>
      <div className="flex gap-2">
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
