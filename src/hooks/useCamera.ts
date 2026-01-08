import { useEffect, useRef, useState } from 'react';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;

        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            video.play();
            resolve();
          };
        });

        if (mounted) {
          videoRef.current = video;
          streamRef.current = stream;
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to start camera:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Camera access denied');
        }
      }
    }

    startCamera();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return { video: videoRef.current, isReady, error };
}
