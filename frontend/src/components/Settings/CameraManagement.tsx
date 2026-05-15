// @ts-nocheck
import { Camera as CameraIcon, Plus, Trash2, Settings2 } from 'lucide-react';
import { useDetectionStore } from '../../store/detectionStore';
import { cn } from '../../utils/cn';

export default function CameraManagement() {
  const cameras = useDetectionStore((s) => s.cameras);

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
        >
          <Plus size={12} /> Add camera
        </button>
      </div>

      <div className="space-y-2">
        {cameras.map((c) => (
          <div
            key={c.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-white/5 hover:border-white/15 transition"
          >
            <div className="h-10 w-14 rounded-lg overflow-hidden border border-white/8 relative shrink-0">
              <img src={c.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium tracking-tight inline-flex items-center gap-2">
                {c.name.split('—')[1]?.trim() || c.name}
                <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">
                  {c.id}
                </span>
              </div>
              <div className="text-[11px] text-white/45 font-mono">
                {c.location.lat.toFixed(4)}°N · {c.location.lng.toFixed(4)}°E
              </div>
            </div>
            <div
              className={cn(
                'pill border text-[10px] uppercase tracking-wider',
                c.status === 'online'
                  ? 'bg-moss-500/10 border-moss-500/30 text-moss-300'
                  : c.status === 'maintenance'
                  ? 'bg-amber2-500/10 border-amber2-500/30 text-amber2-300'
                  : 'bg-threat-500/10 border-threat-500/30 text-threat-300'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  c.status === 'online'
                    ? 'bg-moss-400'
                    : c.status === 'maintenance'
                    ? 'bg-amber2-500'
                    : 'bg-threat-500'
                )}
              />
              {c.status}
            </div>
            <div className="flex gap-1">
              <button className="h-8 w-8 grid place-items-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition">
                <Settings2 size={13} />
              </button>
              <button className="h-8 w-8 grid place-items-center rounded-lg bg-white/5 hover:bg-threat-500/15 hover:text-threat-300 border border-white/10 transition">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
