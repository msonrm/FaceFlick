import { useState } from 'react';
import { CalibrationSettings } from '../types';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CalibrationSettings;
  onSave: (settings: CalibrationSettings) => void;
  currentValues: {
    yaw: number;
    pitch: number;
    mar: number;
    mouthPucker: number;
    ear: { left: number; right: number };
  } | null;
}

export function CalibrationModal({
  isOpen,
  onClose,
  settings,
  onSave,
  currentValues,
}: CalibrationModalProps) {
  const [localSettings, setLocalSettings] = useState<CalibrationSettings>(settings);
  const [calibrationMode, setCalibrationMode] = useState<
    'yaw' | 'pitch' | 'triggers' | null
  >(null);
  const [recordedYaw, setRecordedYaw] = useState<number[]>([]);
  const [recordedPitch, setRecordedPitch] = useState<number[]>([]);

  if (!isOpen) return null;

  const startCalibration = (mode: 'yaw' | 'pitch') => {
    setCalibrationMode(mode);
    if (mode === 'yaw') {
      setRecordedYaw([]);
    } else {
      setRecordedPitch([]);
    }
  };

  const recordValue = () => {
    if (!currentValues) return;

    if (calibrationMode === 'yaw') {
      setRecordedYaw([...recordedYaw, currentValues.yaw]);
    } else if (calibrationMode === 'pitch') {
      setRecordedPitch([...recordedPitch, currentValues.pitch]);
    }
  };

  const applyCalibration = () => {
    const newSettings = { ...localSettings };

    if (recordedYaw.length >= 2) {
      newSettings.yawRange = {
        min: Math.min(...recordedYaw),
        max: Math.max(...recordedYaw),
      };
    }

    if (recordedPitch.length >= 2) {
      newSettings.pitchRange = {
        min: Math.min(...recordedPitch),
        max: Math.max(...recordedPitch),
      };
    }

    setLocalSettings(newSettings);
    setCalibrationMode(null);
  };

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4">Face Flick設定</h2>

        {/* 現在の値表示 */}
        {currentValues && (
          <div className="mb-6 p-4 bg-gray-700 rounded">
            <h3 className="font-bold mb-2">現在の値</h3>
            <div className="grid grid-cols-2 gap-2 text-sm font-mono">
              <div>Yaw: {currentValues.yaw.toFixed(1)}°</div>
              <div>Pitch: {currentValues.pitch.toFixed(1)}°</div>
              <div>MAR: {currentValues.mar.toFixed(2)}</div>
              <div>Pucker: {currentValues.mouthPucker.toFixed(2)}</div>
              <div>EAR L: {currentValues.ear.left.toFixed(3)}</div>
              <div>EAR R: {currentValues.ear.right.toFixed(3)}</div>
              {settings.baseEAR && (
                <>
                  <div className="text-xs text-gray-400">基準EAR L: {settings.baseEAR.left.toFixed(3)}</div>
                  <div className="text-xs text-gray-400">基準EAR R: {settings.baseEAR.right.toFixed(3)}</div>
                  <div className="text-xs text-green-400">
                    倍率 L: {(currentValues.ear.left / settings.baseEAR.left).toFixed(2)}x
                  </div>
                  <div className="text-xs text-green-400">
                    倍率 R: {(currentValues.ear.right / settings.baseEAR.right).toFixed(2)}x
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 顔の向き範囲キャリブレーション */}
        <div className="mb-6">
          <h3 className="font-bold mb-2">顔の向き範囲</h3>

          {/* Yawキャリブレーション */}
          <div className="mb-4 p-3 bg-gray-700 rounded">
            <div className="flex justify-between items-center mb-2">
              <span>左右 (Yaw)</span>
              <button
                onClick={() => startCalibration('yaw')}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                キャリブレーション開始
              </button>
            </div>
            {calibrationMode === 'yaw' && (
              <div className="mt-2">
                <p className="text-sm mb-2">
                  顔を左右に振って、両端で「記録」を押してください
                </p>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={recordValue}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                  >
                    記録 ({recordedYaw.length}/2)
                  </button>
                  <button
                    onClick={applyCalibration}
                    disabled={recordedYaw.length < 2}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm disabled:opacity-50"
                  >
                    適用
                  </button>
                </div>
                <div className="text-xs">
                  記録済み: {recordedYaw.map((v) => v.toFixed(1)).join('°, ')}
                  {recordedYaw.length > 0 && '°'}
                </div>
              </div>
            )}
            <div className="text-sm mt-2">
              範囲: {localSettings.yawRange.min.toFixed(1)}° 〜{' '}
              {localSettings.yawRange.max.toFixed(1)}°
            </div>
          </div>

          {/* Pitchキャリブレーション */}
          <div className="mb-4 p-3 bg-gray-700 rounded">
            <div className="flex justify-between items-center mb-2">
              <span>上下 (Pitch)</span>
              <button
                onClick={() => startCalibration('pitch')}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
              >
                キャリブレーション開始
              </button>
            </div>
            {calibrationMode === 'pitch' && (
              <div className="mt-2">
                <p className="text-sm mb-2">
                  顔を上下に動かして、両端で「記録」を押してください
                </p>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={recordValue}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                  >
                    記録 ({recordedPitch.length}/2)
                  </button>
                  <button
                    onClick={applyCalibration}
                    disabled={recordedPitch.length < 2}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm disabled:opacity-50"
                  >
                    適用
                  </button>
                </div>
                <div className="text-xs">
                  記録済み: {recordedPitch.map((v) => v.toFixed(1)).join('°, ')}
                  {recordedPitch.length > 0 && '°'}
                </div>
              </div>
            )}
            <div className="text-sm mt-2">
              範囲: {localSettings.pitchRange.min.toFixed(1)}° 〜{' '}
              {localSettings.pitchRange.max.toFixed(1)}°
            </div>
          </div>
        </div>

        {/* トリガー閾値設定 */}
        <div className="mb-6">
          <h3 className="font-bold mb-2">トリガー閾値</h3>

          <div className="space-y-3">
            {/* 口開け */}
            <div>
              <label className="block text-sm mb-1">
                口開け (MAR): {localSettings.mouthOpenThreshold.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={localSettings.mouthOpenThreshold}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    mouthOpenThreshold: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            {/* キス顔 */}
            <div>
              <label className="block text-sm mb-1">
                キス顔 (Pucker): {localSettings.mouthPuckerThreshold.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={localSettings.mouthPuckerThreshold}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    mouthPuckerThreshold: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>

            {/* 目を見開く */}
            <div>
              <label className="block text-sm mb-1">
                目を見開く倍率: {localSettings.eyesWideMultiplier.toFixed(2)}x
                {settings.baseEAR && (
                  <span className="text-xs text-gray-400 ml-2">
                    (基準EAR: L={settings.baseEAR.left.toFixed(2)}, R={settings.baseEAR.right.toFixed(2)})
                  </span>
                )}
              </label>
              <input
                type="range"
                min="1.1"
                max="1.8"
                step="0.05"
                value={localSettings.eyesWideMultiplier}
                onChange={(e) =>
                  setLocalSettings({
                    ...localSettings,
                    eyesWideMultiplier: parseFloat(e.target.value),
                  })
                }
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* ボタン */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 rounded font-bold"
          >
            保存
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded font-bold"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
