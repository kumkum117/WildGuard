import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, FileVideo, Webcam, Network, MapPin } from 'lucide-react';
import type { Camera, VideoSource } from '../../types';
import { backend } from '../../services/backend';
import { cn } from '../../utils/cn';

type SourceKind = 'file' | 'webcam' | 'stream';

interface Props {
  open: boolean;
  camera?: Camera | null;   // edit when set, add otherwise
  onClose: () => void;
}

const KINDS: { id: SourceKind; label: string; Icon: typeof FileVideo; hint: string }[] = [
  { id: 'file', label: 'Video file', Icon: FileVideo, hint: 'Plays on loop as a camera feed — good for demos and recorded footage.' },
  { id: 'webcam', label: 'Webcam', Icon: Webcam, hint: 'USB / built-in camera on the server machine. 0 is the first camera.' },
  { id: 'stream', label: 'IP camera', Icon: Network, hint: 'RTSP or HTTP stream, e.g. rtsp://user:pass@192.168.1.20:554/stream1' },
];

export default function CameraModal({ open, camera, onClose }: Props) {
  const editing = !!camera;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SourceKind>('file');
  const [source, setSource] = useState('');
  const [place, setPlace] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(camera?.name ?? '');
    setKind(camera?.sourceType ?? 'file');
    setSource(camera?.source ?? '');
    setPlace(camera?.location.name ?? '');
    setLat(camera && Number.isFinite(camera.location.lat) ? String(camera.location.lat) : '');
    setLng(camera && Number.isFinite(camera.location.lng) ? String(camera.location.lng) : '');
    backend.sources().then(setSources).catch(() => setSources([]));
  }, [open, camera]);

  useEffect(() => {
    if (!open || editing) return;
    if (kind === 'webcam') setSource('0');
    else if (kind === 'file') setSource(sources[0]?.path ?? '');
    else setSource('');
  }, [kind, sources, open, editing]);

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Give the camera a name');
    if (!source.trim()) return setError('Choose a video source');
    const location = {
      name: place.trim() || name.trim(),
      ...(lat.trim() ? { lat: Number(lat) } : {}),
      ...(lng.trim() ? { lng: Number(lng) } : {}),
    };
    setSaving(true);
    try {
      if (editing && camera) {
        await backend.updateCamera(camera.id, { name: name.trim(), source: source.trim(), location });
      } else {
        await backend.addCamera({ name: name.trim(), source: source.trim(), location });
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const groups = Array.from(new Set(sources.map((s) => s.group)));
  const hint = KINDS.find((k) => k.id === kind)?.hint;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm grid place-items-center p-4"
          onClick={onClose}
          data-testid="camera-modal"
        >
          <motion.div
            initial={{ y: 14, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong rounded-3xl w-full max-w-lg border border-white/10 p-6"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
                  {editing ? camera!.id : 'Camera fleet'}
                </div>
                <div className="font-display text-lg font-semibold tracking-tight mt-1">
                  {editing ? 'Configure camera' : 'Add a camera'}
                </div>
              </div>
              <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10">
                <X size={14} />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. River Bend"
                  className="w-full bg-transparent outline-none text-sm"
                  autoFocus
                  data-testid="camera-name"
                />
              </Field>

              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 mb-1.5">Source</div>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
                  {KINDS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setKind(id)}
                      className={cn(
                        'inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition',
                        kind === id ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
                      )}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2">
                  {kind === 'file' ? (
                    <Field>
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        className="w-full bg-transparent outline-none text-sm [&>optgroup]:bg-forest-800 [&_option]:bg-forest-800"
                        data-testid="camera-source"
                      >
                        {source && !sources.some((s) => s.path === source) && <option value={source}>{source}</option>}
                        {sources.length === 0 && !source && <option value="">No video files found</option>}
                        {groups.map((g) => (
                          <optgroup key={g} label={g}>
                            {sources
                              .filter((s) => s.group === g)
                              .map((s) => (
                                <option key={s.path} value={s.path}>
                                  {s.name} ({s.size_mb} MB)
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <Field>
                      <input
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                        placeholder={kind === 'webcam' ? '0' : 'rtsp://192.168.1.20:554/stream1'}
                        className="w-full bg-transparent outline-none text-sm font-mono"
                        data-testid="camera-source"
                      />
                    </Field>
                  )}
                  <div className="mt-1.5 text-[11px] text-white/40">{hint}</div>
                </div>
              </div>

              <div className="grid grid-cols-[1fr,90px,90px] gap-2">
                <Field label="Location" icon={<MapPin size={11} />}>
                  <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Village Gate" className="w-full bg-transparent outline-none text-sm" />
                </Field>
                <Field label="Lat">
                  <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="12.967" inputMode="decimal" className="w-full bg-transparent outline-none text-sm font-mono" />
                </Field>
                <Field label="Lng">
                  <input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="77.587" inputMode="decimal" className="w-full bg-transparent outline-none text-sm font-mono" />
                </Field>
              </div>
              <div className="text-[11px] text-white/35 -mt-2">GPS places the camera on the dashboard map (optional).</div>

              {error && <div className="text-sm text-threat-400">{error}</div>}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition">
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  data-testid="camera-save"
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-b from-moss-400 to-moss-600 text-forest-900 font-semibold text-sm shadow-glow-safe disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Add camera'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, icon, children }: { label?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      {label && (
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 inline-flex items-center gap-1 mb-1.5">
          {icon} {label}
        </span>
      )}
      <div className="glass rounded-xl px-3 py-2.5 focus-within:ring-1 focus-within:ring-moss-400/40 transition">{children}</div>
    </label>
  );
}
