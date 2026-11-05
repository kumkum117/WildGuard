import { useEffect, useRef, useState } from 'react';
import { CameraOff, PauseCircle, Loader } from 'lucide-react';
import type { Camera } from '../../types';
import { cn } from '../../utils/cn';
import { attachStream } from '../../utils/mjpeg';

interface Props {
  camera: Camera;
  /**
   * "stream": MJPEG (smooth, one HTTP connection per image).
   * "poll":   refreshes snapshots — use for grids/thumbnails, because browsers
   *           allow only ~6 open connections per host and MJPEG keeps one busy.
   */
  mode?: 'stream' | 'poll';
  intervalMs?: number;
  className?: string;
}

// Camera picture that works in both modes: live backend feed (annotated by
// the server) or the demo still image.
export default function LiveFeed({ camera, mode = 'stream', intervalMs = 1000, className }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [polled, setPolled] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const streaming = camera.live && mode === 'stream' && camera.enabled !== false;
  const polling = camera.live && mode === 'poll';

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !streaming || !camera.streamUrl) return;
    return attachStream(img, camera.streamUrl, () => setFailed(false));
  }, [streaming, camera.streamUrl]);

  useEffect(() => {
    const snapshot = camera.snapshotUrl;
    if (!polling || !snapshot) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = () => {
      if (document.hidden) {
        timer = window.setTimeout(tick, intervalMs);
        return;
      }
      const next = new Image();
      const url = `${snapshot}${snapshot.includes('?') ? '&' : '?'}t=${Date.now()}`;
      // Swap only once loaded, so the tile never flashes blank.
      next.onload = () => {
        if (cancelled) return;
        setPolled(url);
        setFailed(false);
        timer = window.setTimeout(tick, intervalMs);
      };
      next.onerror = () => {
        if (cancelled) return;
        setFailed(true);
        timer = window.setTimeout(tick, Math.max(intervalMs, 3000));
      };
      next.src = url;
    };
    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [polling, camera.snapshotUrl, intervalMs]);

  const still = polling ? polled ?? camera.snapshotUrl : camera.imageUrl;
  const state = camera.state;

  return (
    <div className={cn('absolute inset-0 bg-forest-950', className)}>
      {streaming ? (
        <img
          ref={imgRef}
          key={camera.streamUrl}
          alt=""
          onError={() => setFailed(true)}
          onLoad={() => setFailed(false)}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        still && (
          <img
            src={still}
            alt=""
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        )
      )}
      {camera.live && (failed || state === 'offline' || state === 'connecting' || state === 'paused') && (
        <div className="absolute inset-0 grid place-items-center bg-forest-950/70 backdrop-blur-[1px]">
          <div className="text-center">
            {state === 'paused' ? (
              <PauseCircle size={22} className="mx-auto text-amber2-400" />
            ) : state === 'connecting' ? (
              <Loader size={22} className="mx-auto text-moss-300 animate-spin" />
            ) : (
              <CameraOff size={22} className="mx-auto text-threat-400" />
            )}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">
              {state === 'paused' ? 'Camera paused' : state === 'connecting' ? 'Connecting…' : 'No signal'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
