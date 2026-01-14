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
    let width = rect.width || canvas.clientWidth || canvas.offsetWidth;
    let height = rect.height || canvas.clientHeight || canvas.offsetHeight;

    // それでも0の場合、親要素のサイズを使用
    if (width === 0 || height === 0) {
      const parent = canvas.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        width = parentRect.width || parent.clientWidth || parent.offsetWidth;
        height = parentRect.height || parent.clientHeight || parent.offsetHeight;
      }
    }

    // それでも0の場合、window.innerWidthを使用（フォールバック）
    if (width === 0 || height === 0) {
      width = window.innerWidth;
      height = window.innerHeight;
    }

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
    camera.lookAt(0, 1, 0); // アバターの中心（頭の位置）を見る

    // Renderer作成
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true, // 透明背景を有効化
      antialias: true,
    });
    // 第3引数falseでCSSスタイルを更新しない（TailwindのCSSを上書きしないため）
    renderer.setSize(width, height, false);
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

      const rect = canvas.getBoundingClientRect();
      let width = rect.width || canvas.clientWidth || canvas.offsetWidth;
      let height = rect.height || canvas.clientHeight || canvas.offsetHeight;

      // それでも0の場合、親要素のサイズを使用
      if (width === 0 || height === 0) {
        const parent = canvas.parentElement;
        if (parent) {
          const parentRect = parent.getBoundingClientRect();
          width = parentRect.width || parent.clientWidth || parent.offsetWidth;
          height = parentRect.height || parent.clientHeight || parent.offsetHeight;
        }
      }

      // それでも0の場合、window.innerWidthを使用
      if (width === 0 || height === 0) {
        width = window.innerWidth;
        height = window.innerHeight;
      }

      if (width === 0 || height === 0) {
        return;
      }

      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      renderer.setSize(width, height, false);
    };

    // ResizeObserverでCanvas要素のサイズ変更を監視
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvas) {
          handleResize();
        }
      }
    });
    resizeObserver.observe(canvas);

    // window リサイズイベントも監視（フォールバック）
    window.addEventListener('resize', handleResize);

    // 初期化直後にリサイズを実行（複数回試行）
    requestAnimationFrame(() => {
      handleResize();
    });

    // 少し遅延してもう一度試す（レイアウト確定待ち）
    setTimeout(() => {
      handleResize();
    }, 100);

    setTimeout(() => {
      handleResize();
    }, 500);

    // クリーンアップ
    return () => {
      resizeObserver.disconnect();
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
    const canvas = canvasRef.current;
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !canvas) {
      return;
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    // レンダラーのサイズが0の場合、動的に更新（初期化タイミング問題の対策）
    const rendererSize = renderer.getSize(new THREE.Vector2());
    if (rendererSize.x === 0 || rendererSize.y === 0) {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || canvas.clientWidth || window.innerWidth;
      const height = rect.height || canvas.clientHeight || window.innerHeight;
      if (width > 0 && height > 0) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }

    // VRMを更新（アニメーション等）
    const deltaTime = clockRef.current.getDelta();
    if (vrm) {
      vrm.update(deltaTime);
    }

    // シーンをレンダリング
    renderer.render(scene, camera);
  }, [vrm, canvasRef]);

  // 手動リサイズ関数を公開
  const forceResize = useCallback(() => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    if (!canvas || !camera || !renderer) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    let width = rect.width || canvas.clientWidth || canvas.offsetWidth;
    let height = rect.height || canvas.clientHeight || canvas.offsetHeight;

    // それでも0の場合、親要素のサイズを使用
    if (width === 0 || height === 0) {
      const parent = canvas.parentElement;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        width = parentRect.width || parent.clientWidth || parent.offsetWidth;
        height = parentRect.height || parent.clientHeight || parent.offsetHeight;
      }
    }

    // それでも0の場合、window.innerWidthを使用
    if (width === 0 || height === 0) {
      width = window.innerWidth;
      height = window.innerHeight;
    }

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
  }, [canvasRef]);

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    render,
    forceResize,
  };
}
