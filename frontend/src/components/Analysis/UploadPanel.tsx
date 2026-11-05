import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Upload, Image as ImageIcon, FileVideo, X, Moon, Sun, SunMoon, BellRing, Loader } from 'lucide-react';
import { backend } from '../../services/backend';
import { useAnalysisStore } from '../../store/analysisStore';
import { useToastStore } from '../../store/toastStore';
import { cn } from '../../utils/cn';
import { SectionTitle } from './shared';

type NightMode = 'auto' | 'on' | 'off';

interface UploadItem {
  key: string;
  file: File;
  options: Record<string, string>;
  progress: number;
  phase: 'waiting' | 'uploading' | 'analysing' | 'done' | 'error';
  error?: string;
  abort?: () => void;
}

const NIGHT_OPTIONS: { id: NightMode; label: string; hint: string; Icon: typeof Moon }[] = [
  { id: 'auto', label: 'Auto', hint: 'Detect dark / IR footage and enhance it', Icon: SunMoon },
  { id: 'on', label: 'Always', hint: 'Force night-vision enhancement', Icon: Moon },
  { id: 'off', label: 'Off', hint: 'Analyse the raw pixels only', Icon: Sun },
];

const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|avi|mov|mkv|webm|m4v|mpe?g|3gp|wmv)$/i.test(f.name);
const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|bmp|webp|tiff?)$/i.test(f.name);
const sizeLabel = (bytes: number) =>
  bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`;

export default function UploadPanel() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [nightMode, setNightMode] = useState<NightMode>('auto');
  const [raiseAlerts, setRaiseAlerts] = useState(true);
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const pending = useRef<UploadItem[]>([]);
  const busy = useRef(false);
  const upsert = useAnalysisStore((s) => s.upsert);
  const select = useAnalysisStore((s) => s.select);
  const pushToast = useToastStore((s) => s.push);

  const update = (key: string, patch: Partial<UploadItem>) =>
    setQueue((q) => q.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  // Uploads run one at a time; files dropped meanwhile wait in `pending`.
  const drain = async () => {
    if (busy.current) return;
    busy.current = true;
    while (pending.current.length) {
      const item = pending.current.shift()!;
      const { promise, abort } = backend.analyze(item.file, item.options, (p) =>
        update(item.key, { progress: p, phase: p >= 1 ? 'analysing' : 'uploading' })
      );
      update(item.key, { phase: 'uploading', abort });
      try {
        const result = await promise;
        upsert(result);
        select(result.id);
        update(item.key, { phase: 'done', progress: 1 });
        if (result.kind === 'image') {
          const n = result.detections?.length ?? 0;
          pushToast({
            title: n ? `${n} animal${n > 1 ? 's' : ''} detected` : 'No animals found',
            message: n
              ? `${item.file.name}: ${(result.species ?? []).map((s) => s.label).join(', ')}`
              : `${item.file.name} — try "Always" night vision or a higher sensitivity.`,
            level: n ? 'success' : 'info',
          });
        }
        window.setTimeout(() => setQueue((q) => q.filter((i) => i.key !== item.key)), 2500);
      } catch (err) {
        update(item.key, { phase: 'error', error: (err as Error).message });
      }
    }
    busy.current = false;
  };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const accepted: UploadItem[] = [];
    Array.from(list).forEach((file) => {
      if (!isImage(file) && !isVideo(file)) {
        pushToast({ title: 'Unsupported file', message: `${file.name} is not an image or video.`, level: 'warning' });
        return;
      }
      accepted.push({
        key: `${file.name}-${file.size}-${Math.random()}`,
        file,
        options: { night_mode: nightMode, raise_alerts: String(raiseAlerts) },
        progress: 0,
        phase: 'waiting',
      });
    });
    if (!accepted.length) return;
    setQueue((q) => [...q, ...accepted]);
    pending.current.push(...accepted);
    drain();
  };

  return (
    <div data-testid="upload-panel" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <SectionTitle eyebrow="Upload footage" title="Analyse images & videos" />

      <button
        type="button"
        data-testid="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          'relative w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all overflow-hidden',
          dragging
            ? 'border-moss-400/70 bg-moss-500/10 shadow-glow-safe'
            : 'border-white/12 bg-white/[0.02] hover:border-moss-400/40 hover:bg-white/[0.04]'
        )}
      >
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <motion.div
          animate={dragging ? { y: -4, scale: 1.05 } : { y: 0, scale: 1 }}
          className="relative mx-auto h-12 w-12 grid place-items-center rounded-2xl bg-moss-500/15 border border-moss-500/30 text-moss-300"
        >
          <Upload size={20} />
        </motion.div>
        <div className="relative mt-4 font-display text-base font-semibold tracking-tight">
          {dragging ? 'Release to analyse' : 'Drop camera-trap photos or video clips'}
        </div>
        <div className="relative mt-1 text-sm text-white/45">
          or <span className="text-moss-300 underline underline-offset-2">browse files</span> · JPG, PNG, WebP · MP4, AVI, MOV, MKV
        </div>
        <div className="relative mt-3 inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-white/35">
          <span className="inline-flex items-center gap-1"><ImageIcon size={11} /> images: instant</span>
          <span className="inline-flex items-center gap-1"><FileVideo size={11} /> videos: background job</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          data-testid="file-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </button>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr,auto] gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5">Night vision</div>
          <div className="flex gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
            {NIGHT_OPTIONS.map(({ id, label, hint, Icon }) => (
              <button
                key={id}
                title={hint}
                data-testid={`night-${id}`}
                onClick={() => setNightMode(id)}
                className={cn(
                  'flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  nightMode === id ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
                )}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5">High-risk animals</div>
          <button
            data-testid="raise-alerts-toggle"
            onClick={() => setRaiseAlerts((v) => !v)}
            title="Log high-risk animals found in uploads as alerts (and e-mail them, if configured)"
            className={cn(
              'w-full inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition',
              raiseAlerts
                ? 'bg-threat-500/10 border-threat-500/30 text-threat-300'
                : 'bg-white/3 border-white/8 text-white/50'
            )}
          >
            <BellRing size={13} /> {raiseAlerts ? 'Raise alerts' : 'Analyse only'}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {queue.map((item) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 p-3 rounded-xl border border-white/8 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 grid place-items-center rounded-lg bg-white/5 border border-white/10 text-white/60 shrink-0">
                  {isVideo(item.file) ? <FileVideo size={14} /> : <ImageIcon size={14} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{item.file.name}</div>
                  <div
                    className={cn(
                      'font-mono text-[10px] uppercase tracking-wider',
                      item.phase === 'error' ? 'text-threat-400' : 'text-white/40'
                    )}
                  >
                    {item.phase === 'waiting' && `queued · ${sizeLabel(item.file.size)}`}
                    {item.phase === 'uploading' && `uploading ${Math.round(item.progress * 100)}% · ${sizeLabel(item.file.size)}`}
                    {item.phase === 'analysing' &&
                      (isVideo(item.file) ? 'upload complete · starting job…' : 'running detection…')}
                    {item.phase === 'done' && 'done'}
                    {item.phase === 'error' && item.error}
                  </div>
                </div>
                {item.phase === 'analysing' && <Loader size={14} className="animate-spin text-moss-300" />}
                {(item.phase === 'waiting' || item.phase === 'uploading' || item.phase === 'error') && (
                  <button
                    onClick={() => {
                      item.abort?.();
                      pending.current = pending.current.filter((i) => i.key !== item.key);
                      setQueue((q) => q.filter((i) => i.key !== item.key));
                    }}
                    className="h-7 w-7 grid place-items-center rounded-md hover:bg-white/10 text-white/40"
                    title="Remove"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {(item.phase === 'uploading' || item.phase === 'analysing') && (
                <div className="mt-2 h-1 rounded-full bg-white/6 overflow-hidden">
                  <motion.div
                    className={cn('h-full bg-moss-400', item.phase === 'analysing' && 'animate-pulse')}
                    animate={{ width: `${Math.max(4, item.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
