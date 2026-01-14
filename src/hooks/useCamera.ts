import { useEffect, useRef, useState, RefObject } from 'react';

interface UseCameraResult {
  videoRef: RefObject<HTMLVideoElement>;
  isReady: boolean;
  error: string | null;
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      // videoRef.currentが設定されるまで待機
      const checkVideo = () => {
        if (videoRef.current) {
          initCamera();
        } else {
          requestAnimationFrame(checkVideo);
        }
      };

      async function initCamera() {
        if (!videoRef.current) return;

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            },
          });

          if (!mounted) {
            stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
            return;
          }

          const video = videoRef.current;
          if (!video) return;

          video.srcObject = stream;
          streamRef.current = stream;

          await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => {
              video.play();
              resolve();
            };
          });

          if (mounted) {
            setIsReady(true);
          }
        } catch (err) {
          console.error('Failed to start camera:', err);
          if (mounted) {
            setError(err instanceof Error ? err.message : 'Camera access denied');
          }
        }
      }

      checkVideo();
    }

    startCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, []);

  return { videoRef, isReady, error };
}
