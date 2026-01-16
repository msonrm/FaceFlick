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

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopping';

export function useRecording() {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingFormatRef = useRef<{ mimeType: string; extension: string } | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);

  // タブ全体（映像 + 音声）を録画開始
  const startRecording = useCallback(async () => {
    if (status !== 'idle') return;

    setStatus('requesting');

    try {
      // getDisplayMedia でタブ全体をキャプチャ（映像 + 音声）
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: 30,
        },
        audio: true,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        systemAudio: 'include',
      } as DisplayMediaStreamOptions);

      displayStreamRef.current = displayStream;

      // ストリームが途中で停止された場合（ユーザーが共有を停止）
      displayStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current = null;
        }
      });

      const format = getSupportedMimeType();
      recordingFormatRef.current = format;

      const mediaRecorder = new MediaRecorder(displayStream, {
        mimeType: format.mimeType,
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // ストリームのクリーンアップ
        if (displayStreamRef.current) {
          displayStreamRef.current.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
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
        setStatus('idle');
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setStatus('recording');
    } catch (err) {
      console.error('Failed to start recording:', err);
      setStatus('idle');
    }
  }, [status]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && status === 'recording') {
      setStatus('stopping');
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
  }, [status]);

  const isRecording = status === 'recording';

  return { status, isRecording, startRecording, stopRecording };
}
