import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';

interface UseThreeSceneOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  vrm: VRM | null;
}

/**
 * キャンバスのサイズを取得するヘルパー関数
 */
function getCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  // 複数の方法でサイズを取得を試みる
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

  return { width, height };
}

/**
 * Three.jsシーンを管理するフック
 */
export function useThreeScene({ canvasRef, vrm }: UseThreeSceneOptions) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const currentCanvasRef = useRef<HTMLCanvasElement | null>(null); // 現在のcanvas要素を追跡
  const clockRef = useRef(new THREE.Clock());
  const renderDebugRef = useRef<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    rendererSize: { x: number; y: number };
    sceneChildren: number;
    vrmBounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
    cameraPosition: { x: number; y: number; z: number };
    renderCount: number;
    objectStatus: { scene: boolean; camera: boolean; renderer: boolean; canvas: boolean };
  }>({
    rendererSize: { x: 0, y: 0 },
    sceneChildren: 0,
    vrmBounds: null,
    cameraPosition: { x: 0, y: 0, z: 0 },
    objectStatus: { scene: false, camera: false, renderer: false, canvas: false },
    renderCount: 0,
  });
  const renderCountRef = useRef(0);

  // シーン初期化関数
  const initScene = useCallback(() => {
    if (!canvasRef.current) {
      console.log('[useThreeScene] initScene: canvas not ready');
      return false;
    }

    const canvas = canvasRef.current;

    // Canvas要素が変更された場合、既存のrendererを破棄して再作成
    if (currentCanvasRef.current && currentCanvasRef.current !== canvas) {
      console.log('[useThreeScene] initScene: canvas element changed, reinitializing');
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
      // シーンとカメラは保持（VRMが追加されている可能性があるため）
    }

    if (rendererRef.current) {
      console.log('[useThreeScene] initScene: already initialized');
      return true;
    }

    currentCanvasRef.current = canvas;
    console.log('[useThreeScene] initScene: starting initialization');

    // Canvasの実際の表示サイズを取得
    const { width, height } = getCanvasSize(canvas);

    // Scene作成（既存のシーンがあれば再利用してVRMを保持）
    let scene = sceneRef.current;
    if (!scene) {
      scene = new THREE.Scene();
      // 背景は設定しない（透明にしてCanvas 2Dのキーボードを透過表示）

      // ライティング（シーン作成時のみ追加）
      const directionalLight = new THREE.DirectionalLight(0xffffff, Math.PI);
      directionalLight.position.set(1, 1, 1).normalize();
      scene.add(directionalLight);

      const ambientLight = new THREE.AmbientLight(0xffffff, Math.PI / 2);
      scene.add(ambientLight);

      sceneRef.current = scene;
    }

    // Camera作成（既存のカメラがあれば再利用）
    let camera = cameraRef.current;
    if (!camera) {
      camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
      camera.position.set(0, 1.0, 3.0);
      camera.lookAt(0, 1, 0);
      cameraRef.current = camera;
    } else {
      // 既存のカメラのアスペクト比を更新
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    // Renderer作成（新しいcanvasに対して作成）
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    rendererRef.current = renderer;

    setIsInitialized(true);
    console.log('[useThreeScene] Three.js scene initialized', { width, height });

    return true;
  }, [canvasRef]);

  // シーン初期化 - 継続的な監視で初期化（canvas要素の変更も検出）
  useEffect(() => {
    // 即座に試行
    initScene();

    // 継続的に監視（canvas要素の変更も検出するため、初期化成功後も監視を継続）
    console.log('[useThreeScene] Starting continuous canvas monitoring...');
    const interval = setInterval(() => {
      const canvas = canvasRef.current;
      // canvas要素が変更された場合、再初期化を試行
      if (canvas && canvas !== currentCanvasRef.current) {
        console.log('[useThreeScene] Canvas element changed, triggering reinit');
        initScene();
      } else if (!rendererRef.current && canvas) {
        // rendererがない場合も再初期化を試行
        initScene();
      }
    }, 100); // 100msごとに監視

    return () => clearInterval(interval);
  }, [initScene, canvasRef]);

  // リサイズ監視（初期化後）
  useEffect(() => {
    if (!isInitialized || !canvasRef.current || !rendererRef.current || !cameraRef.current) return;

    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;

    // リサイズハンドラー
    const handleResize = () => {
      if (!canvas || !camera || !renderer) return;

      const { width, height } = getCanvasSize(canvas);

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
    handleResize();
    requestAnimationFrame(() => handleResize());
    setTimeout(() => handleResize(), 100);
    setTimeout(() => handleResize(), 500);

    // クリーンアップ
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [isInitialized, canvasRef]);

  // VRMをシーンに追加/削除
  useEffect(() => {
    if (!vrm || !sceneRef.current) {
      console.log('[useThreeScene] Waiting for VRM or scene...', { hasVrm: !!vrm, hasScene: !!sceneRef.current });
      return;
    }

    const scene = sceneRef.current;

    // VRMモデルをシーンに追加
    scene.add(vrm.scene);

    // デバッグ: VRMのバウンディングボックスを計算して位置を確認
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    console.log('[useThreeScene] VRM added to scene', {
      boundingBox: { min: box.min, max: box.max },
      size: { x: size.x, y: size.y, z: size.z },
      center: { x: center.x, y: center.y, z: center.z },
      position: vrm.scene.position,
      scale: vrm.scene.scale,
      childrenCount: vrm.scene.children.length,
    });

    // デバッグ情報を更新
    setDebugInfo(prev => ({
      ...prev,
      vrmBounds: {
        min: { x: box.min.x, y: box.min.y, z: box.min.z },
        max: { x: box.max.x, y: box.max.y, z: box.max.z },
      },
      sceneChildren: scene.children.length,
    }));

    // クリーンアップ: VRMをシーンから削除
    return () => {
      if (scene && vrm) {
        scene.remove(vrm.scene);
        console.log('[useThreeScene] VRM removed from scene');
      }
    };
  }, [vrm, isInitialized]); // isInitializedを依存配列に追加してシーン初期化後に再評価

  // レンダリング関数
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const objectStatus = {
      scene: !!sceneRef.current,
      camera: !!cameraRef.current,
      renderer: !!rendererRef.current,
      canvas: !!canvas,
    };

    // オブジェクト状態を更新（毎フレームは多いので1秒に1回）
    if (!renderDebugRef.current || Date.now() - renderDebugRef.current > 1000) {
      setDebugInfo(prev => ({ ...prev, objectStatus }));
    }

    if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !canvas) {
      // デバッグ: どの条件が失敗しているかログ出力
      if (!renderDebugRef.current || Date.now() - renderDebugRef.current > 1000) {
        console.log('[useThreeScene] render: missing -', objectStatus);
        renderDebugRef.current = Date.now();
      }
      return;
    }

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    // レンダラーのサイズが0の場合、動的に更新（初期化タイミング問題の対策）
    const rendererSize = renderer.getSize(new THREE.Vector2());
    if (rendererSize.x === 0 || rendererSize.y === 0) {
      const { width, height } = getCanvasSize(canvas);
      if (width > 0 && height > 0) {
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        console.log('[useThreeScene] Renderer size fixed in render loop', { width, height });
      }
    }

    // VRMを更新（アニメーション等）
    const deltaTime = clockRef.current.getDelta();
    if (vrm) {
      vrm.update(deltaTime);
    }

    // シーンをレンダリング
    renderer.render(scene, camera);

    // レンダリングカウント更新
    renderCountRef.current += 1;

    // デバッグ: 1秒に1回デバッグ情報を更新
    if (!renderDebugRef.current || Date.now() - renderDebugRef.current > 1000) {
      renderDebugRef.current = Date.now();
      const size = renderer.getSize(new THREE.Vector2());
      setDebugInfo(prev => ({
        ...prev,
        rendererSize: { x: size.x, y: size.y },
        sceneChildren: scene.children.length,
        cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        renderCount: renderCountRef.current,
      }));
    }
  }, [vrm, canvasRef]);

  // 手動リサイズ関数を公開
  const forceResize = useCallback(() => {
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;

    if (!canvas || !camera || !renderer) {
      console.log('[useThreeScene] forceResize: not ready', { hasCanvas: !!canvas, hasCamera: !!camera, hasRenderer: !!renderer });
      return;
    }

    const { width, height } = getCanvasSize(canvas);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height, false);
    console.log('[useThreeScene] forceResize executed', { width, height });
  }, [canvasRef]);

  return {
    scene: sceneRef.current,
    camera: cameraRef.current,
    renderer: rendererRef.current,
    render,
    forceResize,
    forceInit: initScene, // 外部から初期化を強制実行
    isInitialized,
    threeDebugInfo: debugInfo,
  };
}
