import type { DebugInfo } from '../utils/canvas';

interface ThreeDebugInfo {
  rendererSize: { x: number; y: number };
  sceneChildren: number;
  vrmBounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
  cameraPosition: { x: number; y: number; z: number };
  renderCount: number;
  objectStatus?: { scene: boolean; camera: boolean; renderer: boolean; canvas: boolean };
}

interface DebugPanelProps {
  debugInfo: DebugInfo;
  vrmStatus?: {
    isLoading: boolean;
    hasVRM: boolean;
    error: string | null;
  };
  threeDebugInfo?: ThreeDebugInfo;
  threeInitialized?: boolean;
}

export function DebugPanel({ debugInfo, vrmStatus, threeDebugInfo, threeInitialized }: DebugPanelProps) {
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

      {/* Three.js状態表示 */}
      <div className="mb-3 pb-2 border-b border-gray-600">
        <div className="font-bold text-sm text-orange-300 mb-1">Three.js Status</div>
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span className="text-gray-300">Initialized:</span>
            <span className={threeInitialized ? 'text-green-400 font-bold' : 'text-red-400'}>
              {threeInitialized ? 'Yes' : 'No'}
            </span>
          </div>
          {threeDebugInfo && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-300">Renderer Size:</span>
                <span className={threeDebugInfo.rendererSize.x > 0 ? 'text-green-400' : 'text-red-400 font-bold'}>
                  {threeDebugInfo.rendererSize.x}x{threeDebugInfo.rendererSize.y}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Scene Children:</span>
                <span className={threeDebugInfo.sceneChildren > 2 ? 'text-green-400' : 'text-yellow-400'}>
                  {threeDebugInfo.sceneChildren}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Render Count:</span>
                <span className={threeDebugInfo.renderCount > 0 ? 'text-green-400' : 'text-red-400'}>
                  {threeDebugInfo.renderCount}
                </span>
              </div>
              {threeDebugInfo.objectStatus && (
                <div className="flex justify-between">
                  <span className="text-gray-300">Objects:</span>
                  <span className="text-[10px]">
                    <span className={threeDebugInfo.objectStatus.scene ? 'text-green-400' : 'text-red-400'}>S</span>
                    <span className={threeDebugInfo.objectStatus.camera ? 'text-green-400' : 'text-red-400'}>C</span>
                    <span className={threeDebugInfo.objectStatus.renderer ? 'text-green-400' : 'text-red-400'}>R</span>
                    <span className={threeDebugInfo.objectStatus.canvas ? 'text-green-400' : 'text-red-400'}>V</span>
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-300">Camera Pos:</span>
                <span className="text-blue-300">
                  ({threeDebugInfo.cameraPosition.x.toFixed(1)}, {threeDebugInfo.cameraPosition.y.toFixed(1)}, {threeDebugInfo.cameraPosition.z.toFixed(1)})
                </span>
              </div>
              {threeDebugInfo.vrmBounds && (
                <>
                  <div className="text-gray-400 text-[10px] mt-1">VRM Bounds:</div>
                  <div className="text-[10px] text-blue-200">
                    min: ({threeDebugInfo.vrmBounds.min.x.toFixed(2)}, {threeDebugInfo.vrmBounds.min.y.toFixed(2)}, {threeDebugInfo.vrmBounds.min.z.toFixed(2)})
                  </div>
                  <div className="text-[10px] text-blue-200">
                    max: ({threeDebugInfo.vrmBounds.max.x.toFixed(2)}, {threeDebugInfo.vrmBounds.max.y.toFixed(2)}, {threeDebugInfo.vrmBounds.max.z.toFixed(2)})
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

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
