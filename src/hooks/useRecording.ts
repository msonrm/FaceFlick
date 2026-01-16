import { useCallback, useRef, useState } from 'react';
import html2canvas from 'html2canvas';

// サポートされている最適なMIMEタイプを取得
function getSupportedMimeType(): { mimeType: string; extension: string } {
  // WebMフォーマット（モバイル互換性重視）
  const webmOptions = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  // MP4フォーマット
  const mp4Options = [
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];

  // WebMをチェック
  for (const mimeType of webmOptions) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log('Recording format: WebM -', mimeType);
      return { mimeType, extension: 'webm' };
    }
  }

  // MP4をチェック
  for (const mimeType of mp4Options) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log('Recording format: MP4 -', mimeType);
      return { mimeType, extension: 'mp4' };
    }
  }

  // デフォルト
  console.warn('No optimal format found, using default WebM');
  return { mimeType: 'video/webm', extension: 'webm' };
}

export type RecordingStatus = 'idle' | 'recording' | 'stopping';

export function useRecording() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingFormatRef = useRef<{ mimeType: string; extension: string } | null>(null);
  const captureIntervalRef = useRef<number | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // DOM全体をキャプチャして録画開始
  const startRecording = useCallback(async (targetElement: HTMLElement) => {
    if (status !== 'idle') {
      console.log('Recording already in progress, status:', status);
      return;
    }

    console.log('Starting recording...');

    try {
      // 録画用のCanvas作成
      const recordingCanvas = document.createElement('canvas');
      const rect = targetElement.getBoundingClientRect();
      recordingCanvas.width = rect.width * window.devicePixelRatio;
      recordingCanvas.height = rect.height * window.devicePixelRatio;
      recordingCanvasRef.current = recordingCanvas;

      const ctx = recordingCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get canvas context');
      }

      // CanvasからMediaStreamを取得
      const stream = recordingCanvas.captureStream(15); // 15fps

      const format = getSupportedMimeType();
      recordingFormatRef.current = format;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: format.mimeType,
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped, saving file...');

        // キャプチャ間隔をクリア
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }

        const format = recordingFormatRef.current || { mimeType: 'video/webm', extension: 'webm' };
        const blob = new Blob(chunksRef.current, { type: format.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `faceflick-${Date.now()}.${format.extension}`;
        a.click();
        URL.revokeObjectURL(url);

        setStatus('idle');
      };

      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }
        setStatus('idle');
      };

      // 定期的にDOMをキャプチャしてCanvasに描画
      const captureFrame = async () => {
        if (!recordingCanvasRef.current) return;

        try {
          const canvas = await html2canvas(targetElement, {
            scale: window.devicePixelRatio,
            useCORS: true,
            allowTaint: true,
            logging: false,
            // WebGLキャンバスを含める
            onclone: (clonedDoc) => {
              // WebGLの内容はhtml2canvasでは直接キャプチャできないため、
              // 元のcanvasの内容をコピー
              const originalCanvases = targetElement.querySelectorAll('canvas');
              const clonedCanvases = clonedDoc.querySelectorAll('canvas');

              originalCanvases.forEach((original, index) => {
                const cloned = clonedCanvases[index];
                if (cloned && original) {
                  const clonedCtx = cloned.getContext('2d');
                  if (clonedCtx) {
                    try {
                      clonedCtx.drawImage(original, 0, 0);
                    } catch {
                      // WebGLコンテキストの場合は失敗する可能性がある
                    }
                  }
                }
              });
            },
          });

          ctx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
          ctx.drawImage(canvas, 0, 0);
        } catch (err) {
          console.error('Frame capture error:', err);
        }
      };

      // 最初のフレームをキャプチャ
      await captureFrame();

      // 録画開始
      mediaRecorder.start(100); // 100msごとにデータを収集
      mediaRecorderRef.current = mediaRecorder;
      setStatus('recording');

      // 定期的にキャプチャ（約10fps）
      captureIntervalRef.current = window.setInterval(captureFrame, 100);

      console.log('Recording started');
    } catch (err) {
      console.error('Failed to start recording:', err);
      setStatus('idle');
    }
  }, [status]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === 'recording') {
      console.log('Stopping recording...');
      setStatus('stopping');

      // キャプチャを停止
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }

      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, [status]);

  const isRecording = status === 'recording';

  return { status, isRecording, startRecording, stopRecording };
}
