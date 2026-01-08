import { useEffect, useRef, useState } from 'react';
import {
  FaceLandmarker,
  FilesetResolver,
  FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

export function useFaceLandmarker() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initializeFaceLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        });

        if (mounted) {
          faceLandmarkerRef.current = landmarker;
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize FaceLandmarker:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    }

    initializeFaceLandmarker();

    return () => {
      mounted = false;
      if (faceLandmarkerRef.current) {
        faceLandmarkerRef.current.close();
        faceLandmarkerRef.current = null;
      }
    };
  }, []);

  const detectFace = (
    video: HTMLVideoElement,
    timestamp: number
  ): FaceLandmarkerResult | null => {
    if (!faceLandmarkerRef.current || !isReady) {
      return null;
    }

    try {
      return faceLandmarkerRef.current.detectForVideo(video, timestamp);
    } catch (err) {
      console.error('Face detection error:', err);
      return null;
    }
  };

  return { isReady, error, detectFace };
}
