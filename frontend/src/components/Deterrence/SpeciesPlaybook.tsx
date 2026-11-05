import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Zap, Sun, Megaphone, UserCheck, BellRing, MinusCircle, PawPrint } from 'lucide-react';
import type { DeterrenceProfile, DeterrenceStep } from '../../types';
import { backend, titleCase } from '../../services/backend';
import { useConnectionStore } from '../../store/connectionStore';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { PATTERN_INFO } from '../../utils/sirenEngine';
import { Glyph } from './SirenToggle';
import { cn } from '../../utils/cn';

const s = (stage: number, lights: DeterrenceStep['lights'], sound: DeterrenceStep['sound'], village: string | null = null, ranger = false): DeterrenceStep =>
  ({ stage, lights, sound, village, ranger });

// Same playbooks as backend/deterrence.py, for demo mode (no server).
const DEMO_PROFILES: DeterrenceProfile[] = [
  { species: 'elephant', note: 'Flood lights first, then a bee-swarm buzz before any siren — sudden loud noise can provoke a charge.', ignore: false, notify_only: false, steps: [s(0, 'flood', null), s(1, 'flood', 'bee'), s(1, 'strobe', 'hilo'), s(2, 'strobe', 'hilo', 'warning'), s(3, 'strobe', 'hilo', null, true)] },
  ...['tiger', 'leopard', 'lion', 'cheetah'].map((sp) => ({ species: sp, note: 'Strobe and a yelp siren straight away, then warn villagers to keep livestock in.', ignore: false, notify_only: false, steps: [s(1, 'strobe', 'yelp'), s(1, 'strobe', 'wail'), s(2, 'strobe', 'hilo', 'warning'), s(3, 'strobe', 'hilo', null, true)] })),
  { species: 'bear', note: 'Siren and strobe together; bears usually retreat from noise and light.', ignore: false, notify_only: false, steps: [s(1, 'strobe', 'wail'), s(1, 'strobe', 'yelp'), s(2, 'strobe', 'hilo', 'warning'), s(3, 'strobe', 'hilo', null, true)] },
  ...['wild boar', 'gaur'].map((sp) => ({ species: sp, note: 'Strobe first; add a siren only if it stays.', ignore: false, notify_only: false, steps: [s(0, 'strobe', null), s(1, 'strobe', 'pulse'), s(1, 'strobe', 'wail'), s(3, 'strobe', 'wail', null, true)] })),
  { species: 'snake', note: 'Lights and sirens do not deter snakes — rangers are notified instead.', ignore: false, notify_only: true, steps: [] },
  ...['cow', 'dog', 'goat'].map((sp) => ({ species: sp, note: 'Domestic or harmless animal — logged, no deterrence.', ignore: true, notify_only: false, steps: [] })),
];

interface Group {
  key: string;
  species: string[];
  profile: DeterrenceProfile;
}

export default function SpeciesPlaybook({ className }: { className?: string }) {
  const live = useConnectionStore((st) => st.mode === 'live');
  const engagedSpecies = useDeterrenceStore((st) => (st.server.engaged ? st.server.profile?.species ?? st.server.last_trigger?.species : null));
  const [profiles, setProfiles] = useState<DeterrenceProfile[]>(DEMO_PROFILES);

  useEffect(() => {
    if (!live) {
      setProfiles(DEMO_PROFILES);
      return;
    }
    backend.deterrenceProfiles().then(setProfiles).catch(() => {});
  }, [live]);

  // Species that share a playbook are shown on one row.
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const p of profiles) {
      const key = JSON.stringify([p.note, p.steps, p.ignore, p.notify_only]);
      const g = map.get(key);
      if (g) g.species.push(p.species);
      else map.set(key, { key, species: [p.species], profile: p });
    }
    const order = (g: Group) => (g.profile.ignore ? 2 : g.profile.notify_only ? 1 : 0);
    return [...map.values()].sort((a, b) => order(a) - order(b));
  }, [profiles]);

  return (
    <section data-testid="species-playbook" className={cn('glass rounded-3xl p-5 sm:p-6 border border-white/8', className)}>
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Auto protocol</div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">Species playbook</div>
        </div>
        <div className="text-[11px] text-white/40 text-right max-w-[220px]">
          Steps advance every 30 s while the animal stays · sounds rotate to slow habituation
        </div>
      </div>
      <div className="space-y-1.5">
        {groups.map((g) => {
          const engaged = !!engagedSpecies && g.species.includes(engagedSpecies);
          return (
            <div
              key={g.key}
              className={cn(
                'relative flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-3 py-2.5 rounded-xl border transition-colors',
                engaged ? 'border-threat-500/35 bg-threat-500/[0.06]' : 'border-white/5 hover:border-white/12'
              )}
            >
              {engaged && (
                <motion.span layoutId="playbook-active" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-threat-500" />
              )}
              <div className="sm:w-52 shrink-0 min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <PawPrint size={12} className={g.profile.ignore ? 'text-white/30' : 'text-moss-300'} />
                  <span className="truncate">{g.species.map(titleCase).join(' · ')}</span>
                  {engaged && (
                    <span className="ml-1 pill bg-threat-500/15 border border-threat-500/35 text-threat-300 text-[9px] uppercase tracking-wider">
                      Engaged
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-white/40 leading-snug mt-0.5 line-clamp-2">{g.profile.note}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {g.profile.ignore ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-white/40">
                    <MinusCircle size={12} /> Ignored — no deterrence
                  </span>
                ) : g.profile.notify_only ? (
                  <StepChip tone="amber">
                    <BellRing size={11} /> Notify rangers only
                  </StepChip>
                ) : (
                  g.profile.steps.map((step, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      {i > 0 && <span className="text-white/20 text-[10px]">→</span>}
                      <StepView step={step} />
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StepView({ step }: { step: DeterrenceStep }) {
  const tone = step.ranger ? 'threat' : step.sound ? 'threat' : 'amber';
  return (
    <StepChip tone={tone} title={`Step: ${['Warn', 'Repel', 'Alert village', 'Escalate'][step.stage]}`}>
      {step.lights === 'flood' ? <Sun size={11} /> : step.lights ? <Zap size={11} /> : <Lightbulb size={11} />}
      {step.sound && (
        <>
          <Glyph pattern={step.sound} className="h-2 w-4" />
          <span>{PATTERN_INFO[step.sound].label}</span>
        </>
      )}
      {!step.sound && step.lights && <span className="capitalize">{step.lights}</span>}
      {step.village && <Megaphone size={11} />}
      {step.ranger && <UserCheck size={11} />}
    </StepChip>
  );
}

function StepChip({ tone, title, children }: { tone: 'threat' | 'amber'; title?: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium',
        tone === 'threat' ? 'bg-threat-500/10 border-threat-500/25 text-threat-200' : 'bg-amber2-500/10 border-amber2-500/25 text-amber2-200'
      )}
    >
      {children}
    </span>
  );
}
