import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Image as ImageIcon,
  FileVideo,
  Trash2,
  Download,
  Video,
  CheckCircle2,
  XCircle,
  Loader,
  ScanSearch,
  ShieldCheck,
  ArrowRight,
  Clock,
  Cpu,
  BellRing,
  Moon,
  Ban,
} from 'lucide-react';
import type { Analysis, AnalysisDetection, Sighting } from '../../types';
import { mediaUrl } from '../../services/api';
import { backend } from '../../services/backend';
import { useAnalysisStore } from '../../store/analysisStore';
import { useToastStore } from '../../store/toastStore';
import { formatRelative } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import GlowingBadge from '../Common/GlowingBadge';
import { attachStream } from '../../utils/mjpeg';
import { ConfidenceBar, LightingBadge, clock, threatColor, titleCase, toThreat } from './shared';

export default function AnalysisViewer() {
  const selectedId = useAnalysisStore((s) => s.selectedId);
  const summary = useAnalysisStore((s) => s.items.find((i) => i.id === s.selectedId));
  const [full, setFull] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);

  // Summaries omit detections/sightings — load the full result once finished.
  const status = summary?.status;
  useEffect(() => {
    setFull(null);
    if (!selectedId || (status && status !== 'completed')) return;
    let cancelled = false;
    setLoading(true);
    backend
      .analysis(selectedId)
      .then((a) => !cancelled && setFull(a))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId, status]);

  if (!summary) {
    return (
      <div className="glass rounded-3xl p-10 border border-white/8 text-center">
        <ScanSearch size={28} className="mx-auto text-white/25" />
        <div className="mt-3 font-display text-lg font-semibold tracking-tight">No analysis selected</div>
        <div className="mt-1 text-sm text-white/45 max-w-sm mx-auto">
          Upload footage above, or pick a previous analysis from the history to review its detections.
        </div>
      </div>
    );
  }

  const data = full ?? summary;
  return (
    <motion.div
      key={data.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass rounded-3xl border border-white/8 overflow-hidden"
      data-testid="analysis-viewer"
    >
      <ViewerHeader a={data} />
      <div className="p-5 sm:p-6 pt-0 sm:pt-0">
        {data.status === 'queued' || data.status === 'processing' ? (
          <VideoProgress a={data} />
        ) : data.status === 'failed' || data.status === 'cancelled' ? (
          <div className="py-10 text-center">
            {data.status === 'failed' ? (
              <XCircle size={26} className="mx-auto text-threat-400" />
            ) : (
              <Ban size={26} className="mx-auto text-white/40" />
            )}
            <div className="mt-3 text-sm text-white/70">
              {data.status === 'failed' ? data.error || 'Analysis failed' : 'Analysis cancelled'}
            </div>
          </div>
        ) : loading || !full ? (
          <div className="py-16 grid place-items-center text-moss-300">
            <Loader size={20} className="animate-spin" />
          </div>
        ) : full.kind === 'image' ? (
          <ImageResult a={full} />
        ) : (
          <VideoResult a={full} />
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------

function ViewerHeader({ a }: { a: Analysis }) {
  const remove = useAnalysisStore((s) => s.remove);
  const pushToast = useToastStore((s) => s.push);
  const [confirming, setConfirming] = useState(false);
  const [adding, setAdding] = useState(false);

  const del = async () => {
    if (!confirming) {
      setConfirming(true);
      window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    try {
      await backend.deleteAnalysis(a.id);
      remove(a.id);
    } catch (err) {
      pushToast({ title: 'Delete failed', message: (err as Error).message, level: 'warning' });
    }
  };

  const useAsCamera = async () => {
    if (!a.source_path || adding) return;
    setAdding(true);
    try {
      const name = a.filename.replace(/\.[^.]+$/, '').slice(0, 40) || 'Uploaded feed';
      const cam = await backend.addCamera({ name, source: a.source_path, location: { name } });
      pushToast({
        title: 'Camera added',
        message: `${cam.id} now plays "${a.filename}" as a live feed.`,
        level: 'success',
      });
    } catch (err) {
      pushToast({ title: 'Could not add camera', message: (err as Error).message, level: 'warning' });
    } finally {
      setAdding(false);
    }
  };

  const done = a.status === 'completed';
  return (
    <div className="p-5 sm:p-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex items-start gap-3">
        <div className="h-10 w-10 grid place-items-center rounded-xl bg-moss-500/10 border border-moss-500/25 text-moss-300 shrink-0">
          {a.kind === 'video' ? <FileVideo size={17} /> : <ImageIcon size={17} />}
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold tracking-tight truncate max-w-[42ch]">{a.filename}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">
              {a.kind} · {formatRelative(new Date(a.created_at * 1000).toISOString())}
            </span>
            {done && <LightingBadge lighting={a.lighting} enhanced={a.kind === 'image' ? a.enhanced : (a.lighting?.enhanced_ratio ?? 0) > 0} />}
            {done && (a.alerts_raised?.length ?? 0) > 0 && (
              <span className="pill border text-[10px] uppercase tracking-wider bg-threat-500/10 border-threat-500/30 text-threat-300">
                <BellRing size={10} /> alert: {a.alerts_raised!.map(titleCase).join(', ')}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {done && a.kind === 'video' && a.source_path && (
          <button
            onClick={useAsCamera}
            disabled={adding}
            title="Play this clip on loop as a live camera feed"
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 inline-flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Video size={12} /> {adding ? 'Adding…' : 'Use as camera'}
          </button>
        )}
        {done && a.urls.annotated && (
          <a
            href={mediaUrl(a.urls.annotated)}
            download
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 inline-flex items-center gap-1.5 transition"
          >
            <Download size={12} /> Download
          </a>
        )}
        <button
          onClick={del}
          data-testid="delete-analysis"
          className={cn(
            'text-xs px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 transition',
            confirming
              ? 'bg-threat-500/20 border-threat-500/40 text-threat-300'
              : 'bg-white/5 hover:bg-threat-500/15 hover:text-threat-300 border-white/10'
          )}
        >
          <Trash2 size={12} /> {confirming ? 'Confirm delete' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

function ImageResult({ a }: { a: Analysis }) {
  const views = [
    { id: 'annotated', label: 'Detections' },
    ...(a.urls.enhanced ? [{ id: 'enhanced', label: 'Night view' }] : []),
    { id: 'original', label: 'Original' },
  ];
  const [view, setView] = useState(a.urls.enhanced ? 'enhanced' : 'annotated');
  const detections = a.detections ?? [];

  return (
    <div className="space-y-5">
      <div className="relative rounded-2xl overflow-hidden border border-white/8 bg-forest-950">
        <AnimatePresence mode="wait">
          <motion.img
            key={view}
            src={mediaUrl(a.urls[view])}
            alt={a.filename}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-h-[560px] object-contain"
          />
        </AnimatePresence>
        <div className="absolute top-3 left-3 flex gap-1 p-1 rounded-xl bg-black/50 backdrop-blur-md border border-white/10">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-[11px] font-medium transition',
                view === v.id ? 'bg-moss-500/25 text-moss-200' : 'text-white/60 hover:text-white'
              )}
            >
              {v.id === 'enhanced' && <Moon size={10} className="inline mr-1 -mt-0.5" />}
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Animals" value={String(detections.length)} />
        <Stat label="Species" value={String(a.species?.length ?? 0)} />
        <Stat label="Resolution" value={a.width ? `${a.width}×${a.height}` : '—'} />
        <Stat label="Processing" value={a.processing_ms ? `${(a.processing_ms / 1000).toFixed(1)} s` : '—'} />
      </div>

      {detections.length === 0 ? (
        <div className="py-8 text-center text-sm text-white/45">
          No animals found. For very dark shots try night vision <span className="text-moss-300">Always</span>, or raise
          AI sensitivity in Settings.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {detections.map((d, i) => (
            <DetectionCard key={i} d={d} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetectionCard({ d, index }: { d: AnalysisDetection; index: number }) {
  const relabelled = d.verified && d.detector_label !== d.label;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="p-4 rounded-2xl border border-white/8 bg-white/[0.02]"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('h-2 w-2 rounded-full shrink-0', threatColor(d.threat_level))} />
          <span className="font-display text-base font-semibold tracking-tight truncate">{titleCase(d.label)}</span>
        </div>
        <GlowingBadge level={toThreat(d.threat_level)}>{d.threat_level.toLowerCase()}</GlowingBadge>
      </div>
      <div className="mt-3">
        <ConfidenceBar value={d.confidence} threat={d.threat_level} />
      </div>
      <div className="mt-3 space-y-1 text-[11px] text-white/45">
        {d.verified ? (
          <div className="inline-flex items-center gap-1.5 text-moss-300/90">
            <ShieldCheck size={11} /> Species verified by CLIP
            {relabelled && (
              <span className="text-white/45">
                {' '}
                · detector said <span className="text-white/70">{d.detector_label}</span>
              </span>
            )}
          </div>
        ) : (
          <div>Detector label · {Math.round(d.detector_confidence * 100)}%</div>
        )}
        {d.species_scores.length > 1 && (
          <div className="font-mono">
            also considered:{' '}
            {d.species_scores
              .slice(1)
              .map((s) => `${s.label} ${Math.round(s.score * 100)}%`)
              .join(' · ')}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

function VideoProgress({ a }: { a: Analysis }) {
  const pushToast = useToastStore((s) => s.push);
  const progress = a.progress ?? 0;
  const imgRef = useRef<HTMLImageElement | null>(null);

  const processing = a.status === 'processing';
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !processing) return;
    return attachStream(img, mediaUrl(`/api/analyses/${a.id}/preview`));
  }, [processing, a.id]);

  const cancel = async () => {
    try {
      await backend.cancelAnalysis(a.id);
    } catch (err) {
      pushToast({ title: 'Could not cancel', message: (err as Error).message, level: 'warning' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-video rounded-2xl overflow-hidden border border-white/8 bg-forest-950 noise">
        {a.status === 'processing' ? (
          <img ref={imgRef} alt="" className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <Clock size={24} className="mx-auto text-white/35" />
              <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">Waiting in queue</div>
            </div>
          </div>
        )}
        <div className="scanline" />
        <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-black/50 backdrop-blur-md border border-white/10">
          <Loader size={11} className="animate-spin text-moss-300" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
            {a.status === 'processing' ? 'Analysing' : 'Queued'}
          </span>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between font-mono text-[11px] text-white/50 mb-1.5">
          <span>{Math.round(progress * 100)}% analysed</span>
          <span>{a.eta_s != null ? `~${Math.ceil(a.eta_s)} s remaining` : 'estimating…'}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
          <motion.div className="h-full bg-gradient-to-r from-moss-600 to-moss-400" animate={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
          {(a.live_species?.length ?? 0) > 0 ? (
            <>
              <span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Found so far</span>
              {a.live_species!.map((s) => (
                <span key={s} className="pill bg-white/5 border border-white/10 text-white/80">
                  {titleCase(s)}
                </span>
              ))}
            </>
          ) : (
            <span>Scanning frames for wildlife…</span>
          )}
        </div>
        <button
          onClick={cancel}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-threat-500/15 hover:text-threat-300 border border-white/10 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function VideoResult({ a }: { a: Analysis }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sightings = a.sightings ?? [];
  const duration = a.video?.duration_s || Math.max(1, ...sightings.map((s) => s.end_s));
  const [active, setActive] = useState<number | null>(null);

  const seek = (s: Sighting) => {
    setActive(s.track_id);
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, (s.best_at_s ?? s.start_s) - 0.5);
    v.play().catch(() => {});
  };

  return (
    <div className="space-y-5">
      {a.urls.annotated ? (
        <video
          ref={videoRef}
          src={mediaUrl(a.urls.annotated)}
          poster={a.urls.thumbnail ? mediaUrl(a.urls.thumbnail) : undefined}
          controls
          playsInline
          className="w-full rounded-2xl border border-white/8 bg-black max-h-[560px]"
        />
      ) : (
        <div className="rounded-2xl border border-white/8 p-6 text-sm text-white/50 text-center">
          No browser-playable encoder was available on the server, so only keyframes were saved.
        </div>
      )}

      {/* Timeline */}
      <div>
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 mb-2">
          <span>Sightings timeline</span>
          <span>{clock(duration)}</span>
        </div>
        <div className="relative h-8 rounded-lg bg-white/[0.03] border border-white/8 overflow-hidden">
          {sightings.map((s) => (
            <button
              key={s.track_id}
              title={`${titleCase(s.label)} · ${clock(s.start_s)}–${clock(s.end_s)}`}
              onClick={() => seek(s)}
              className={cn(
                'absolute top-1.5 bottom-1.5 rounded-md opacity-80 hover:opacity-100 transition',
                threatColor(s.threat_level),
                active === s.track_id && 'ring-2 ring-white/70 opacity-100'
              )}
              style={{
                left: `${(s.start_s / duration) * 100}%`,
                width: `${Math.max(1.2, ((s.end_s - s.start_s) / duration) * 100)}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Sightings" value={String(sightings.length)} />
        <Stat label="Night frames" value={`${Math.round((a.lighting?.night_ratio ?? 0) * 100)}%`} />
        <Stat label="Frames analysed" value={String(a.analysis?.analysed_frames ?? '—')} />
        <Stat
          label="Processing"
          value={a.analysis ? `${a.analysis.processing_s.toFixed(0)} s` : '—'}
          hint={a.analysis?.avg_inference_ms ? `${Math.round(a.analysis.avg_inference_ms)} ms/frame` : undefined}
        />
      </div>

      {(a.species?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.species!.map((s) => (
            <div key={s.label} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/8 bg-white/[0.02]">
              <span className={cn('h-2 w-2 rounded-full', threatColor(s.threat_level))} />
              <span className="text-sm font-medium">{titleCase(s.label)}</span>
              <span className="font-mono text-[11px] text-white/45">
                ×{s.count} · max {Math.round(s.max_confidence * 100)}%
                {s.visible_s ? ` · ${s.visible_s.toFixed(1)} s on screen` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {sightings.length === 0 ? (
        <div className="py-6 text-center text-sm text-white/45">No confirmed animals in this video.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sightings.map((s) => (
            <button
              key={s.track_id}
              onClick={() => seek(s)}
              className={cn(
                'group text-left flex gap-3 p-3 rounded-2xl border transition',
                active === s.track_id ? 'border-moss-400/40 bg-moss-500/5' : 'border-white/8 bg-white/[0.02] hover:border-white/20'
              )}
            >
              <div className="relative h-20 w-32 rounded-lg overflow-hidden border border-white/8 shrink-0 bg-forest-950">
                {s.keyframe_url && <img src={mediaUrl(s.keyframe_url)} alt="" className="absolute inset-0 h-full w-full object-cover" />}
                <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 font-mono text-[9px] text-white/80">
                  {clock(s.start_s)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-base font-semibold tracking-tight">{titleCase(s.label)}</span>
                  <GlowingBadge level={toThreat(s.threat_level)}>{s.threat_level.toLowerCase()}</GlowingBadge>
                </div>
                <div className="mt-1 font-mono text-[10px] text-white/45 inline-flex items-center gap-1.5">
                  <Clock size={10} /> {clock(s.start_s)} – {clock(s.end_s)}
                  {s.night && (
                    <>
                      <Moon size={10} className="text-moss-300 ml-1" /> night
                    </>
                  )}
                </div>
                <div className="mt-2">
                  <ConfidenceBar value={s.max_confidence} threat={s.threat_level} />
                </div>
                {s.labels_seen.length > 1 && (
                  <div className="mt-1.5 text-[10px] font-mono text-white/40 inline-flex items-center gap-1 flex-wrap">
                    identified as {s.labels_seen.map((l, i) => (
                      <span key={l} className="inline-flex items-center gap-1">
                        {i > 0 && <ArrowRight size={9} />}
                        <span className={i === s.labels_seen.length - 1 ? 'text-moss-300' : ''}>{l}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {a.analysis && (
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-white/35">
          <span className="inline-flex items-center gap-1">
            <Cpu size={10} /> every {a.analysis.stride} frame{a.analysis.stride > 1 ? 's' : ''} analysed
          </span>
          {a.analysis.classifier && (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 size={10} /> CLIP species verification
            </span>
          )}
          {a.video && (
            <span>
              {a.video.width}×{a.video.height} · {a.video.fps} fps
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl p-3 border border-white/5 bg-white/[0.02]">
      <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 text-sm font-medium tabular-nums">{value}</div>
      {hint && <div className="font-mono text-[10px] text-white/35">{hint}</div>}
    </div>
  );
}
