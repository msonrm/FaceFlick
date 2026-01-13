import type { DebugInfo } from '../utils/canvas';

interface DebugPanelProps {
  debugInfo: DebugInfo;
  vrmStatus?: {
    isLoading: boolean;
    hasVRM: boolean;
    error: string | null;
  };
}

export function DebugPanel({ debugInfo, vrmStatus }: DebugPanelProps) {
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 max-h-96 bg-black/80 backdrop-blur-sm rounded-lg p-3 overflow-y-auto text-white text-xs font-mono">
      {/* VRM状態表示 */}
      {vrmStatus && (
        <div className="mb-3 pb-2 border-b border-gray-600">
          <div className="font-bold text-sm text-purple-300 mb-1">VRM Status</div>
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span className="text-gray-300">Loading:</span>
              <span className={vrmStatus.isLoading ? 'text-yellow-400' : 'text-green-400'}>
                {vrmStatus.isLoading ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">VRM Loaded:</span>
              <span className={vrmStatus.hasVRM ? 'text-green-400 font-bold' : 'text-red-400'}>
                {vrmStatus.hasVRM ? 'Yes' : 'No'}
              </span>
            </div>
            {vrmStatus.error && (
              <div className="mt-1">
                <span className="text-red-400">Error:</span>
                <div className="text-red-300 text-xs mt-0.5 break-words">{vrmStatus.error}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blendshapes表示 */}
      {debugInfo.allBlendshapes && debugInfo.allBlendshapes.length > 0 && (
        <>
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
        </>
      )}

      {/* 顔検出なしの警告 */}
      {(!debugInfo.allBlendshapes || debugInfo.allBlendshapes.length === 0) && (
        <div className="text-yellow-300 text-xs">
          顔が検出されていません
        </div>
      )}
    </div>
  );
}
