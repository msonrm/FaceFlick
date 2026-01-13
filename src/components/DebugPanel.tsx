import type { DebugInfo } from '../utils/canvas';

interface DebugPanelProps {
  debugInfo: DebugInfo;
}

export function DebugPanel({ debugInfo }: DebugPanelProps) {
  if (!debugInfo.allBlendshapes || debugInfo.allBlendshapes.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-96 bg-black/80 backdrop-blur-sm rounded-lg p-3 overflow-y-auto text-white text-xs font-mono">
      <div className="font-bold mb-2 text-sm bg-black/90 pb-1">
        全Blendshapes ({debugInfo.allBlendshapes.length})
      </div>
      <div className="space-y-1">
        {debugInfo.allBlendshapes.map((bs, idx) => (
          <div key={idx} className="flex justify-between items-center">
            <span className="text-cyan-300">{bs.name}</span>
            <span className={bs.value > 0.3 ? 'text-yellow-400 font-bold' : 'text-gray-400'}>
              {bs.value.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
