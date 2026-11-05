import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Moon, ScanEye, Server, ShieldCheck } from 'lucide-react';
import UploadPanel from '../components/Analysis/UploadPanel';
import AnalysisViewer from '../components/Analysis/AnalysisViewer';
import AnalysisHistory from '../components/Analysis/AnalysisHistory';
import { backend } from '../services/backend';
import { useAnalysisStore } from '../store/analysisStore';
import { useConnectionStore } from '../store/connectionStore';

export default function AnalyzePage() {
  const mode = useConnectionStore((s) => s.mode);
  const health = useConnectionStore((s) => s.health);
  const setItems = useAnalysisStore((s) => s.setItems);
  const select = useAnalysisStore((s) => s.select);
  const selectedId = useAnalysisStore((s) => s.selectedId);

  useEffect(() => {
    if (mode !== 'live') return;
    backend
      .analyses()
      .then((items) => {
        setItems(items);
        if (!useAnalysisStore.getState().selectedId && items[0]) select(items[0].id);
      })
      .catch(() => {});
  }, [mode, setItems, select]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="analyze-page"
    >
      <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
              Offline footage · images & video
            </div>
            <div className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-1">
              Detect wildlife in recorded media — day or night
            </div>
            <div className="mt-2 text-sm text-white/55 max-w-2xl">
              Upload camera-trap photos or clips. Dark and infrared footage is enhanced automatically, every
              animal is located by the detector and its species verified by a second AI model, and video
              sightings are tracked across frames.
            </div>
          </div>
          {mode === 'live' && health && (
            <div className="flex flex-wrap gap-2">
              <span className="pill bg-moss-500/10 border border-moss-500/30 text-moss-300">
                <ScanEye size={11} /> {health.engine.model_type.split(' (')[0]}
              </span>
              {health.engine.classifier_enabled && (
                <span className="pill bg-moss-500/10 border border-moss-500/30 text-moss-300">
                  <ShieldCheck size={11} /> CLIP species check
                </span>
              )}
              <span className="pill bg-moss-500/10 border border-moss-500/30 text-moss-300">
                <Moon size={11} /> Night vision · {health.settings.night_mode}
              </span>
            </div>
          )}
        </div>
      </div>

      {mode !== 'live' ? (
        <div className="glass rounded-3xl p-8 sm:p-10 border border-white/8 text-center">
          <Server size={28} className="mx-auto text-amber2-400" />
          <div className="mt-3 font-display text-lg font-semibold tracking-tight">
            {mode === 'connecting' ? 'Connecting to the detection server…' : 'Media analysis needs the WildGuard backend'}
          </div>
          <div className="mt-2 text-sm text-white/50 max-w-lg mx-auto">
            The dashboard is in demo mode because the detection server is not reachable. Start it from the project
            folder and this page connects automatically:
          </div>
          <code className="mt-4 inline-block px-4 py-2 rounded-xl bg-black/40 border border-white/10 font-mono text-sm text-moss-300">
            py backend/server.py
          </code>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
          <div className="xl:col-span-2 space-y-5">
            <UploadPanel />
            <AnalysisViewer key={selectedId ?? 'none'} />
          </div>
          <div>
            <AnalysisHistory />
          </div>
        </div>
      )}
    </motion.div>
  );
}
