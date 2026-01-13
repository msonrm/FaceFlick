import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface UseVRMAvatarOptions {
  modelUrl: string;
}

/**
 * VRMモデルをロード・管理するフック
 */
export function useVRMAvatar({ modelUrl }: UseVRMAvatarOptions) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadVRM() {
      try {
        setIsLoading(true);
        setError(null);

        // GLTFLoaderにVRMプラグインを登録
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        // VRMモデルを非同期ロード
        loader.load(
          modelUrl,
          (gltf) => {
            if (!mounted) return;

            const vrm = gltf.userData.vrm as VRM;

            // VRM0.x互換性のための回転調整
            VRMUtils.rotateVRM0(vrm);

            setVrm(vrm);
            setIsLoading(false);
          },
          // 進捗コールバック
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`VRM Loading: ${percent.toFixed(1)}%`);
          },
          // エラーコールバック
          (error) => {
            if (!mounted) return;

            console.error('Failed to load VRM:', error);
            setError(error instanceof Error ? error.message : 'Unknown error');
            setIsLoading(false);
          }
        );
      } catch (err) {
        if (!mounted) return;

        console.error('VRM load error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    }

    loadVRM();

    // クリーンアップ
    return () => {
      mounted = false;
      if (vrm) {
        // VRMのリソースを解放
        VRMUtils.deepDispose(vrm.scene);
      }
    };
  }, [modelUrl]);

  return { vrm, isLoading, error };
}
