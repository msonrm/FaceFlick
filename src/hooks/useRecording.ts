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

  // Canvas映像 + タブ音声を録画開始
  const startRecording = useCallback(async (canvas: HTMLCanvasElement) => {
    if (status !== 'idle') return;

    setStatus('requesting');

    try {
      // Canvas映像ストリームを取得
      const canvasStream = canvas.captureStream(30); // 30 fps

      // タブ音声をキャプチャするために getDisplayMedia を使用
      // preferCurrentTab: true でダイアログをスキップ（サポートされている場合）
      let displayStream: MediaStream | null = null;
      let audioTrack: MediaStreamTrack | null = null;

      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
          },
          audio: true,
          preferCurrentTab: true,
          selfBrowserSurface: 'include',
          systemAudio: 'include',
        } as DisplayMediaStreamOptions);

        displayStreamRef.current = displayStream;

        // 音声トラックを取得
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTrack = audioTracks[0];
          console.log('Audio track captured:', audioTrack.label);
        }

        // ビデオトラックは不要なので停止（Canvas映像を使用するため）
        displayStream.getVideoTracks().forEach((track) => track.stop());
      } catch (err) {
        console.warn('Could not capture tab audio, recording without audio:', err);
        // 音声キャプチャに失敗しても、映像のみで続行
      }

      // 最終的なストリームを構築
      const combinedStream = new MediaStream();

      // Canvas映像トラックを追加
      canvasStream.getVideoTracks().forEach((track) => {
        combinedStream.addTrack(track);
      });

      // 音声トラックがあれば追加
      if (audioTrack) {
        combinedStream.addTrack(audioTrack);
      }

      const format = getSupportedMimeType();
      recordingFormatRef.current = format;

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType: format.mimeType,
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // 音声ストリームのクリーンアップ
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
