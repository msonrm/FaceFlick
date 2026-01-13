import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

interface UseThreeSceneOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  vrm: VRM | null;
}

/**
 * Three.jsシーンを管理するフック
 */
export function useThreeScene({ canvasRef, vrm }: UseThreeSceneOptions) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const clockRef = useRef(new THREE.Clock());

  // シーン初期化
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;

    // Canvasの実際の表示サイズを取得
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Scene作成
    const scene = new THREE.Scene();
    scene.background = null; // 透明背景

    // Camera作成
    const camera = new THREE.PerspectiveCamera(
      30, // FOV
      width / height, // アスペクト比
      0.1, // near
      20 // far
    );
    camera.position.set(0, 1.3, 1.5); // アバターを見やすい位置

    // Renderer作成
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true, // 透明背景
      antialias: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ライティング
    const directionalLight = new THREE.DirectionalLight(0xffffff, Math.PI);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, Math.PI / 2);
    scene.add(ambientLight);

    // Refs に保存
    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // リサイズハンドラー
    const handleResize = () => {
      if (!canvas || !camera || !renderer) return;

      const width = canvas.width;
      const height = canvas.height;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // クリーンアップ
    return () => {
      window.removeEventListener('resize', handleResize);

      if (renderer) {
        renderer.dispose();
      }

      // Three.jsのメモリリーク防止
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => material.dispose());
            } else {
              object.material.dispose();
            }
          }
        }
      });
    };
  }, [canvasRef]);

  // VRMをシーンに追加/削除
  useEffect(() => {
    if (!vrm || !sceneRef.current) return;

    const scene = sceneRef.current;

    // VRMモデルをシーンに追加
    scene.add(vrm.scene);

    // クリーンアップ: VRMをシーンから削除
    return () => {
      if (scene && vrm) {
        scene.remove(vrm.scene);
      }
    };
  }, [vrm]);

  // レンダリング関数
  const render = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) {
      return;
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    // VRMを更新（アニメーション等）
    const deltaTime = clockRef.current.getDelta();
    if (vrm) {
      vrm.update(deltaTime);
    }

    // シーンをレンダリング
    renderer.render(scene, camera);
  }, [vrm]);

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    render,
  };
}
