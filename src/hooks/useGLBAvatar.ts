import { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GLBAvatar {
  scene: THREE.Group;
  meshes: THREE.SkinnedMesh[];
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
}

interface UseGLBAvatarOptions {
  modelUrl: string;
}

/**
 * GLBモデルをロード・管理するフック
 * VRMより軽量でシンプル、blendshapesを直接操作可能
 */
export function useGLBAvatar({ modelUrl }: UseGLBAvatarOptions) {
  const [avatar, setAvatar] = useState<GLBAvatar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gltfRef = useRef<GLTF | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadGLB() {
      try {
        setIsLoading(true);
        setError(null);

        const loader = new GLTFLoader();

        loader.load(
          modelUrl,
          (gltf) => {
            if (!mounted) return;

            gltfRef.current = gltf;

            // SkinnedMeshを探してmorph targets情報を収集
            const meshes: THREE.SkinnedMesh[] = [];
            let morphTargetDictionary: Record<string, number> = {};
            let morphTargetInfluences: number[] = [];

            gltf.scene.traverse((object) => {
              if (object instanceof THREE.SkinnedMesh || object instanceof THREE.Mesh) {
                const mesh = object as THREE.SkinnedMesh;
                if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
                  meshes.push(mesh);
                  // 最初のメッシュのmorph targets情報を使用
                  if (Object.keys(morphTargetDictionary).length === 0) {
                    morphTargetDictionary = mesh.morphTargetDictionary;
                    morphTargetInfluences = mesh.morphTargetInfluences;
                  }
                }
              }
            });

            // デバッグ: 利用可能なblendshapes一覧を出力
            console.log('GLB loaded. Available blendshapes:', Object.keys(morphTargetDictionary));

            setAvatar({
              scene: gltf.scene,
              meshes,
              morphTargetDictionary,
              morphTargetInfluences,
            });
            setIsLoading(false);
          },
          (progress) => {
            if (progress.total > 0) {
              const percent = (progress.loaded / progress.total) * 100;
              console.log(`GLB Loading: ${percent.toFixed(1)}%`);
            }
          },
          (err) => {
            if (!mounted) return;

            console.error('Failed to load GLB:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            setIsLoading(false);
          }
        );
      } catch (err) {
        if (!mounted) return;

        console.error('GLB load error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsLoading(false);
      }
    }

    loadGLB();

    return () => {
      mounted = false;
      // リソース解放
      if (gltfRef.current) {
        gltfRef.current.scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach((m) => m.dispose());
            } else {
              object.material?.dispose();
            }
          }
        });
      }
    };
  }, [modelUrl]);

  return { avatar, isLoading, error };
}
