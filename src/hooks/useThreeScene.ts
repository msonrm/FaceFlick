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

    console.log('[WebGL] Canvas getBoundingClientRect:', { width, height });
    console.log('[WebGL] Canvas element:', canvas.width, 'x', canvas.height);

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
      alpha: true, // 透明背景
      antialias: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // デバッグ: 赤背景でWebGLが表示されているか確認
    renderer.setClearColor(0xff0000, 1); // 一時的に赤色の不透明背景

    console.log('[WebGL] Renderer initialized with size:', width, 'x', height);
    console.log('[WebGL] Canvas after setSize:', canvas.width, 'x', canvas.height);

    // ライティング
    const directionalLight = new THREE.DirectionalLight(0xffffff, Math.PI);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, Math.PI / 2);
    scene.add(ambientLight);

    // デバッグ用: グリッドヘルパーを追加（VRMが見えない場合の確認用）
    const gridHelper = new THREE.GridHelper(2, 10);
    scene.add(gridHelper);

    // デバッグ用: 原点に小さな立方体を配置
    const debugCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    debugCube.position.set(0, 1, 0);
    scene.add(debugCube);

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

    // デバッグ: VRMの位置とスケールをログ出力
    console.log('[VRM] Added to scene');
    console.log('[VRM] Position:', vrm.scene.position);
    console.log('[VRM] Scale:', vrm.scene.scale);
    console.log('[VRM] Scene children:', scene.children.length);

    // クリーンアップ: VRMをシーンから削除
    return () => {
      if (scene && vrm) {
        scene.remove(vrm.scene);
        console.log('[VRM] Removed from scene');
      }
    };
  }, [vrm]);

  // レンダリング関数
  const renderCountRef = useRef(0);
  const render = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) {
      return;
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    // 最初の5回だけログ出力
    renderCountRef.current++;
    if (renderCountRef.current <= 5) {
      console.log(`[WebGL] Rendering frame ${renderCountRef.current}`);
      console.log('[WebGL] Scene children:', scene.children.length);
    }

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
