import { useCallback, useRef, useState } from 'react';

// サポートされている最適なMIMEタイプを取得
function getSupportedMimeType(): { mimeType: string; extension: string } {
  // MP4フォーマット（優先順位高）
  const mp4Options = [
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];

  // WebMフォーマット（フォールバック）
  const webmOptions = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  // MP4をチェック
  for (const mimeType of mp4Options) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log('Recording format: MP4 -', mimeType);
      return { mimeType, extension: 'mp4' };
    }
  }

  // WebMをチェック
  for (const mimeType of webmOptions) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      console.log('Recording format: WebM -', mimeType);
      return { mimeType, extension: 'webm' };
    }
  }

  // デフォルト（最も広くサポートされている）
  console.warn('No optimal format found, using default WebM');
  return { mimeType: 'video/webm', extension: 'webm' };
}

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingFormatRef = useRef<{ mimeType: string; extension: string } | null>(null);

  const startRecording = useCallback((canvas: HTMLCanvasElement) => {
    try {
      const stream = canvas.captureStream(30); // 30 fps
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
        const format = recordingFormatRef.current || { mimeType: 'video/webm', extension: 'webm' };
        const blob = new Blob(chunksRef.current, { type: format.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `faceflick-${Date.now()}.${format.extension}`;
        a.click();
        URL.revokeObjectURL(url);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }, [isRecording]);

  return { isRecording, startRecording, stopRecording };
}
