import { useState } from 'react';
import { Camera as CameraIcon, Plus, Trash2, Settings2, Power, Moon } from 'lucide-react';
import type { Camera } from '../../types';
import { useDetectionStore } from '../../store/detectionStore';
import { useConnectionStore } from '../../store/connectionStore';
import { useToastStore } from '../../store/toastStore';
import { backend } from '../../services/backend';
import { formatGps } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import LiveFeed from '../Common/LiveFeed';
import CameraModal from './CameraModal';

const sourceLabel = (c: Camera) =>
  c.sourceType === 'webcam'
    ? `Webcam ${c.source}`
    : c.sourceType === 'stream'
    ? (c.source ?? '').replace(/\/\/[^@/]+@/, '//***@') // hide credentials in RTSP URLs
    : (c.source ?? '').split(/[\\/]/).pop();

export default function CameraManagement() {
  const cameras = useDetectionStore((s) => s.cameras);
  const live = useConnectionStore((s) => s.mode === 'live');
  const pushToast = useToastStore((s) => s.push);
  const [modal, setModal] = useState<{ open: boolean; camera: Camera | null }>({ open: false, camera: null });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fail = (title: string) => (err: unknown) =>
    pushToast({ title, message: (err as Error).message, level: 'warning' });

  const togglePause = async (c: Camera) => {
    setBusy(c.id);
    await backend.updateCamera(c.id, { enabled: c.enabled === false }).catch(fail('Could not update camera'));
    setBusy(null);
  };

  const remove = async (c: Camera) => {
    if (confirmDelete !== c.id) {
      setConfirmDelete(c.id);
      window.setTimeout(() => setConfirmDelete((id) => (id === c.id ? null : id)), 3000);
      return;
    }
    setBusy(c.id);
    await backend.deleteCamera(c.id).catch(fail('Could not remove camera'));
    setBusy(null);
    setConfirmDelete(null);
  };

  return (
    <div data-testid="camera-management" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Hardware
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">
            Camera fleet
          </div>
        </div>
        <button
          className="text-xs px-3 py-2 rounded-lg bg-moss-500/15 hover:bg-moss-500/25 border border-moss-500/30 text-moss-300 inline-flex items-center gap-1.5 transition"
          data-testid="add-camera-btn"
          onClick={() =>
            live
              ? setModal({ open: true, camera: null })
              : alert('Camera pairing wizard — connect your device to the local mesh to register a new camera.')
          }
        >
          <Plus size={12} /> Add camera
        </button>
      </div>

      <div className="space-y-2">
        {live && cameras.length === 0 && (
          <div className="py-8 text-center text-sm text-white/40">No cameras yet — add a webcam, IP camera or video feed.</div>
        )}
        {cameras.map((c) => {
          const label = c.live ? c.state ?? c.status : c.status;
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-white/5 hover:border-white/15 transition"
            >
              <div className="h-10 w-14 rounded-lg overflow-hidden border border-white/8 relative shrink-0">
                {c.live ? (
                  <LiveFeed camera={c} mode="poll" intervalMs={5000} />
                ) : (
                  <img src={c.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium tracking-tight inline-flex items-center gap-2">
                  {c.live ? c.name : c.location.name}
                  <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider whitespace-nowrap">
                    {c.id}
                  </span>
                  {c.lighting?.is_night && <Moon size={11} className="text-moss-300" />}
                </div>
                <div className="text-[11px] text-white/45 font-mono truncate">
                  {c.live ? (
                    <>
                      {sourceLabel(c)} · {formatGps(c.location.lat, c.location.lng)}
                    </>
                  ) : (
                    <>
                      {c.location.lat.toFixed(4)}°N · {c.location.lng.toFixed(4)}°E
                    </>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  'pill border text-[10px] uppercase tracking-wider shrink-0',
                  c.live && 'hidden sm:inline-flex',
                  label === 'online'
                    ? 'bg-moss-500/10 border-moss-500/30 text-moss-300'
                    : label === 'maintenance' || label === 'paused' || label === 'connecting'
                    ? 'bg-amber2-500/10 border-amber2-500/30 text-amber2-300'
                    : 'bg-threat-500/10 border-threat-500/30 text-threat-300'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    label === 'online'
                      ? 'bg-moss-400'
                      : label === 'maintenance' || label === 'paused' || label === 'connecting'
                      ? 'bg-amber2-500'
                      : 'bg-threat-500'
                  )}
                />
                {label}
              </div>
              <div className="flex gap-1">
                {c.live && (
                  <button
                    className={cn(
                      'h-8 w-8 grid place-items-center rounded-lg border transition disabled:opacity-40',
                      c.enabled === false
                        ? 'bg-amber2-500/10 border-amber2-500/30 text-amber2-300 hover:bg-amber2-500/20'
                        : 'bg-white/5 hover:bg-white/10 border-white/10'
                    )}
                    title={c.enabled === false ? `Resume ${c.name}` : `Pause ${c.name}`}
                    disabled={busy === c.id}
                    onClick={() => togglePause(c)}
                  >
                    <Power size={13} />
                  </button>
                )}
                <button
                  className="h-8 w-8 grid place-items-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
                  title={`Configure ${c.location.name}`}
                  onClick={() =>
                    c.live
                      ? setModal({ open: true, camera: c })
                      : alert(`Camera settings for ${c.location.name} (${c.id}) — firmware, resolution, night vision, and motion zones.`)
                  }
                >
                  <Settings2 size={13} />
                </button>
                <button
                  className={cn(
                    'h-8 grid place-items-center rounded-lg border transition disabled:opacity-40',
                    confirmDelete === c.id
                      ? 'px-2 text-[10px] font-mono uppercase bg-threat-500/20 border-threat-500/40 text-threat-300'
                      : 'w-8 bg-white/5 hover:bg-threat-500/15 hover:text-threat-300 border-white/10'
                  )}
                  title={`Remove ${c.location.name}`}
                  disabled={busy === c.id}
                  onClick={() => {
                    if (c.live) return remove(c);
                    if (window.confirm(`Remove ${c.location.name} (${c.id}) from the fleet?`)) alert('Camera removal queued — changes take effect on next sync.');
                  }}
                >
                  {confirmDelete === c.id ? 'Confirm' : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {live && (
        <div className="mt-4 flex items-center gap-2 text-[11px] text-white/35">
          <CameraIcon size={11} /> Webcams, RTSP/HTTP IP cameras and video files are supported. Changes apply immediately.
        </div>
      )}

      <CameraModal open={modal.open} camera={modal.camera} onClose={() => setModal({ open: false, camera: null })} />
    </div>
  );
}
