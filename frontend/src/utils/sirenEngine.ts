import type { SirenPattern } from '../types';

// Siren sounds synthesised with the Web Audio API — no audio files, seamless
// loops, and an AnalyserNode that drives the live waveform on the console.
//
//   wail   slow up/down sweep 600–1400 Hz (classic siren)
//   yelp   fast 3 Hz sweep around 1 kHz (urgent)
//   hilo   two-tone 600/800 Hz alternating every 0.5 s
//   pulse  950 Hz tone gated at 4 Hz
//   bee    band-passed noise + detuned 220 Hz drones with a flutter — a swarm
//          buzz, used for elephants (they avoid bees)
//
// Browsers block audio until the page has had a user gesture; the engine
// unlocks itself on the first click/keypress and reports 'locked' until then.

export type AudioState = 'locked' | 'ready' | 'playing';

type Listener = (state: AudioState) => void;

class SirenEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private voice: { stop: () => void; out: GainNode } | null = null;
  private current: SirenPattern | null = null;
  private listeners = new Set<Listener>();
  private unlockBound = false;
  state: AudioState = 'locked';

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    const soften = this.ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 4200;
    this.master.connect(soften).connect(this.analyser).connect(this.ctx.destination);
    this.ctx.onstatechange = () => this.refreshState();
    this.refreshState();
    return this.ctx;
  }

  /** Resume audio on the first user gesture anywhere on the page. */
  bindUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      this.unlock();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  unlock() {
    const ctx = this.ensure();
    ctx?.resume().then(() => this.refreshState()).catch(() => {});
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private refreshState() {
    const next: AudioState = !this.ctx || this.ctx.state !== 'running' ? 'locked' : this.voice ? 'playing' : 'ready';
    if (next !== this.state) {
      this.state = next;
      this.listeners.forEach((l) => l(next));
    }
  }

  setVolume(v: number) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.05);
  }

  get playing() {
    return this.current;
  }

  play(pattern: SirenPattern, volume = 0.35) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (this.current === pattern && this.voice) {
      this.setVolume(volume);
      return;
    }
    this.stop(0.08);
    this.setVolume(volume);
    this.voice = this.build(ctx, pattern);
    this.current = pattern;
    this.refreshState();
  }

  stop(fade = 0.15) {
    const voice = this.voice;
    if (!voice || !this.ctx) {
      this.voice = null;
      this.current = null;
      this.refreshState();
      return;
    }
    const t = this.ctx.currentTime;
    voice.out.gain.cancelScheduledValues(t);
    voice.out.gain.setValueAtTime(voice.out.gain.value, t);
    voice.out.gain.linearRampToValueAtTime(0, t + fade);
    window.setTimeout(() => voice.stop(), fade * 1000 + 50);
    this.voice = null;
    this.current = null;
    this.refreshState();
  }

  /** Play a short preview (used by the self-test). */
  preview(pattern: SirenPattern, seconds = 2, volume = 0.15) {
    const wasPlaying = this.current;
    this.play(pattern, volume);
    window.setTimeout(() => {
      if (this.current === pattern && !wasPlaying) this.stop();
    }, seconds * 1000);
  }

  /** Fill `buf` with the current waveform (0–255, 128 = silence). */
  waveform(buf: Uint8Array<ArrayBuffer>) {
    if (!this.analyser) {
      buf.fill(128);
      return;
    }
    this.analyser.getByteTimeDomainData(buf);
  }

  private build(ctx: AudioContext, pattern: SirenPattern) {
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master!);
    const t = ctx.currentTime;
    out.gain.linearRampToValueAtTime(1, t + 0.15);
    const sources: Array<AudioScheduledSourceNode> = [];

    const osc = (type: OscillatorType, freq: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      sources.push(o);
      return o;
    };
    const lfo = (type: OscillatorType, rate: number, depth: number, target: AudioParam) => {
      const l = osc(type, rate);
      const g = ctx.createGain();
      g.gain.value = depth;
      l.connect(g).connect(target);
      return l;
    };

    switch (pattern) {
      case 'wail': {
        const o = osc('sawtooth', 1000);
        lfo('triangle', 0.35, 400, o.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.55;
        o.connect(g).connect(out);
        break;
      }
      case 'yelp': {
        const o = osc('sawtooth', 1000);
        lfo('sine', 3, 350, o.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.5;
        o.connect(g).connect(out);
        break;
      }
      case 'hilo': {
        const o = osc('square', 700);
        lfo('square', 1, 100, o.frequency);
        const g = ctx.createGain();
        g.gain.value = 0.3;
        o.connect(g).connect(out);
        break;
      }
      case 'pulse': {
        const o = osc('square', 950);
        const gate = ctx.createGain();
        gate.gain.value = 0.5;
        lfo('square', 4, 0.5, gate.gain);
        const g = ctx.createGain();
        g.gain.value = 0.35;
        o.connect(gate).connect(g).connect(out);
        break;
      }
      case 'bee': {
        // Buzzing noise band…
        const len = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        sources.push(noise);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 260;
        band.Q.value = 3;
        const nGain = ctx.createGain();
        nGain.gain.value = 0.9;
        noise.connect(band).connect(nGain).connect(out);
        // …plus a cluster of slightly detuned wing-beat drones with flutter.
        [210, 220, 233, 247].forEach((f, i) => {
          const o = osc('sawtooth', f);
          o.detune.value = (Math.random() - 0.5) * 30;
          const g = ctx.createGain();
          g.gain.value = 0.07;
          lfo('sine', 6 + i * 1.7, 0.04, g.gain);
          o.connect(g).connect(out);
        });
        lfo('sine', 0.25, 60, band.frequency);
        break;
      }
    }
    sources.forEach((s) => s.start());
    return {
      out,
      stop: () => {
        sources.forEach((s) => {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
        });
        out.disconnect();
      },
    };
  }
}

export const sirenEngine = new SirenEngine();

export const PATTERN_INFO: Record<SirenPattern, { label: string; hint: string }> = {
  wail: { label: 'Wail', hint: 'Slow rising siren — general warning' },
  yelp: { label: 'Yelp', hint: 'Fast urgent sweep — big cats, bears' },
  hilo: { label: 'Hi-Lo', hint: 'Two-tone alternating — escalation' },
  pulse: { label: 'Pulse', hint: 'Pulsed tone — grazers like wild boar' },
  bee: { label: 'Bee swarm', hint: 'Buzzing swarm — elephants avoid bees' },
};
