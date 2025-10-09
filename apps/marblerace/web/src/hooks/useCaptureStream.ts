/* eslint-env browser */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useCaptureStream() {
  const [captureStream, setCaptureStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (v && captureStream) {
      try {
        v.srcObject = captureStream as any;
        v.muted = true;
        Promise.resolve(v.play()).catch(() => { void 0; });
      } catch { void 0; }
    }
    if (v && !captureStream) {
      try { (v as any).srcObject = null; } catch { void 0; }
    }
  }, [captureStream]);

  const startCapture = useCallback(async () => {
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia?.({ video: true, audio: false });
      if (stream) {
        setCaptureStream(stream);
        try {
          const [track] = stream.getVideoTracks();
          if (track) track.addEventListener('ended', () => {
            setCaptureStream(null);
            const v2 = videoRef.current; if (v2) (v2 as any).srcObject = null;
          });
        } catch { void 0; }
      }
    } catch (e) {
      console.warn('capture cancelled', e);
    }
  }, []);

  const stopCapture = useCallback(() => {
    try { captureStream?.getTracks().forEach((t) => t.stop()); } catch { void 0; }
    setCaptureStream(null);
    const v = videoRef.current; if (v) (v as any).srcObject = null;
  }, [captureStream]);

  return { captureStream, videoRef, startCapture, stopCapture } as const;
}
