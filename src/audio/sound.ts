/**
 * Scrap Rumble music: cinematic film-score action.
 * Sustained strings, horn melodies, timpani pulses, wide reverb.
 * Melodies carry the drama - not arcade stabs.
 */

import type { ShipId } from '../game/types';

type ThrustVoice = {
  noise: AudioBufferSourceNode;
  gain: GainNode;
  filter: BiquadFilterNode;
};

type Theme = {
  bpm: number;
  roots: number[];
  leadA: number[];
  leadB: number[];
  bassPat: number[];
  /** 0 dark / tragic, 1 bright / heroic */
  color: number;
  /** 0 intimate, 1 full-orchestra drive */
  drive: number;
};

function themeTempo(bpm: number): number {
  // Film cues breathe - allow slower tempos
  return Math.min(128, Math.max(78, bpm * 0.92));
}

/**
 * Title - heroic rising motif over warm adventure harmony.
 * Motif: 0 2 4 7 | 9 7 4 2 | 0 5 9 12 | 11 7 4 0
 */
const MENU_THEME: Theme = {
  bpm: 108,
  // C - Am - F - G - Em - Am - F - G
  roots: [60, 57, 53, 55, 52, 57, 53, 55],
  leadA: [0, 0, 2, 4, 7, 7, 9, 7, 4, 4, 2, 0, 5, 9, 12, 11],
  leadB: [12, 12, 11, 9, 7, 7, 9, 12, 16, 14, 12, 9, 7, 5, 4, 0],
  bassPat: [0, 0, 0, 7, 0, 0, 5, 7],
  color: 0.7,
  drive: 0.55,
};

const SHIP_THEMES: Record<ShipId, Theme> = {
  solhammer: {
    bpm: 92,
    // Low epic: Dm - Bb - F - C
    roots: [50, 50, 46, 53, 50, 45, 48, 50],
    leadA: [0, 0, 0, 3, 7, 7, 5, 3, 0, 0, 5, 7, 10, 10, 7, 5],
    leadB: [12, 12, 10, 7, 5, 3, 0, 0, 3, 7, 10, 12, 15, 12, 10, 7],
    bassPat: [0, 0, 0, 0, 5, 0, 0, 7],
    color: 0.2,
    drive: 0.75,
  },
  zephyr: {
    bpm: 118,
    roots: [64, 67, 69, 67, 64, 62, 60, 62],
    leadA: [0, 4, 7, 7, 12, 12, 11, 9, 7, 4, 2, 0, 4, 9, 12, 16],
    leadB: [16, 16, 14, 12, 9, 7, 4, 4, 7, 12, 16, 19, 16, 12, 9, 7],
    bassPat: [0, 0, 7, 0, 4, 0, 7, 12],
    color: 0.9,
    drive: 0.7,
  },
  bulwark: {
    bpm: 84,
    roots: [48, 48, 51, 46, 48, 43, 46, 48],
    leadA: [0, 0, 0, 2, 5, 5, 7, 5, 2, 2, 0, 0, 5, 7, 9, 7],
    leadB: [7, 7, 5, 2, 0, 0, 2, 5, 9, 9, 7, 5, 2, 0, 0, 5],
    bassPat: [0, 0, 0, 0, 0, 0, 5, 7],
    color: 0.25,
    drive: 0.35,
  },
  shade: {
    bpm: 100,
    // Suspense: chromatic descents
    roots: [56, 54, 51, 49, 56, 54, 59, 51],
    leadA: [0, 0, -1, 3, 7, 7, 6, 3, 0, 0, 3, 7, 10, 8, 7, 3],
    leadB: [10, 10, 8, 7, 3, 0, -1, -1, 3, 7, 10, 12, 15, 12, 10, 7],
    bassPat: [0, 0, 7, 0, 3, 0, 10, 0],
    color: 0.35,
    drive: 0.65,
  },
  prism: {
    bpm: 104,
    roots: [60, 64, 67, 65, 60, 57, 55, 57],
    leadA: [0, 4, 7, 11, 12, 12, 11, 7, 4, 0, 4, 7, 12, 16, 14, 11],
    leadB: [12, 16, 19, 19, 16, 12, 11, 7, 4, 7, 12, 16, 19, 23, 19, 16],
    bassPat: [0, 0, 4, 7, 0, 7, 4, 0],
    color: 0.95,
    drive: 0.5,
  },
  brood: {
    bpm: 96,
    roots: [53, 56, 51, 48, 53, 56, 58, 51],
    leadA: [0, 0, 3, 5, 7, 7, 5, 3, 0, -2, 0, 5, 7, 10, 7, 5],
    leadB: [10, 10, 7, 5, 3, 0, 0, 3, 7, 10, 12, 14, 12, 10, 7, 5],
    bassPat: [0, 0, 0, 5, 0, 0, 7, 0],
    color: 0.3,
    drive: 0.5,
  },
  cinder: {
    bpm: 112,
    roots: [58, 61, 58, 63, 58, 61, 65, 55],
    leadA: [0, 3, 7, 7, 10, 12, 12, 10, 7, 3, 0, 5, 8, 12, 15, 12],
    leadB: [15, 15, 12, 10, 7, 3, 0, 0, 7, 10, 12, 15, 19, 19, 15, 12],
    bassPat: [0, 0, 7, 0, 12, 0, 10, 0],
    color: 0.7,
    drive: 0.85,
  },
  grappler: {
    bpm: 98,
    roots: [51, 54, 56, 54, 51, 49, 47, 49],
    leadA: [0, 0, 3, 5, 8, 8, 7, 5, 3, 0, 5, 8, 10, 12, 10, 8],
    leadB: [12, 12, 10, 8, 5, 3, 0, 0, 5, 8, 12, 15, 17, 15, 12, 8],
    bassPat: [0, 0, 5, 0, 8, 0, 3, 0],
    color: 0.4,
    drive: 0.55,
  },
  scuttle: {
    bpm: 116,
    roots: [62, 65, 67, 65, 62, 60, 58, 60],
    leadA: [0, 2, 4, 4, 7, 7, 9, 7, 4, 2, 0, 4, 7, 11, 12, 11],
    leadB: [12, 12, 11, 7, 4, 2, 0, 0, 4, 7, 11, 14, 16, 14, 12, 7],
    bassPat: [0, 0, 4, 7, 0, 2, 7, 12],
    color: 0.8,
    drive: 0.75,
  },
  nullpoint: {
    bpm: 90,
    roots: [52, 49, 55, 47, 52, 50, 45, 49],
    leadA: [0, 1, 4, 4, 6, 7, 7, 6, 4, 1, 0, 1, 4, 7, 8, 7],
    leadB: [8, 8, 7, 4, 1, 0, -2, 1, 4, 7, 11, 13, 12, 11, 8, 6],
    bassPat: [0, 0, 0, 6, 0, 1, 0, 7],
    color: 0.5,
    drive: 0.55,
  },
  stormlance: {
    bpm: 110,
    roots: [59, 62, 64, 62, 59, 57, 55, 57],
    leadA: [0, 4, 7, 7, 11, 12, 12, 11, 7, 4, 0, 4, 9, 12, 16, 12],
    leadB: [16, 16, 12, 11, 7, 4, 0, 0, 7, 11, 12, 16, 19, 23, 19, 16],
    bassPat: [0, 0, 7, 12, 0, 4, 7, 11],
    color: 0.85,
    drive: 0.7,
  },
  mirage: {
    bpm: 102,
    roots: [57, 54, 60, 52, 57, 54, 61, 54],
    leadA: [0, 0, 3, 5, 8, 8, 7, 5, 3, 0, 5, 8, 12, 15, 12, 8],
    leadB: [15, 15, 12, 8, 5, 3, 0, 0, 5, 8, 12, 15, 17, 19, 15, 12],
    bassPat: [0, 0, 5, 0, 8, 0, 3, 0],
    color: 0.65,
    drive: 0.5,
  },
  harrier: {
    bpm: 108,
    roots: [55, 58, 62, 58, 55, 53, 50, 53],
    leadA: [0, 3, 7, 7, 10, 12, 12, 10, 7, 3, 0, 5, 9, 12, 15, 12],
    leadB: [15, 15, 12, 10, 7, 3, 0, 0, 7, 10, 12, 15, 19, 22, 19, 15],
    bassPat: [0, 0, 7, 0, 10, 0, 5, 0],
    color: 0.45,
    drive: 0.8,
  },
  minewright: {
    bpm: 86,
    roots: [50, 53, 48, 45, 50, 53, 55, 48],
    leadA: [0, 0, 0, 3, 5, 5, 7, 5, 3, 0, 5, 7, 10, 10, 7, 5],
    leadB: [10, 10, 7, 5, 3, 0, 0, 3, 5, 7, 10, 12, 10, 7, 5, 3],
    bassPat: [0, 0, 0, 0, 5, 0, 0, 7],
    color: 0.3,
    drive: 0.4,
  },
  razorwing: {
    bpm: 114,
    roots: [61, 64, 68, 64, 61, 59, 56, 59],
    leadA: [0, 4, 7, 7, 11, 14, 14, 11, 7, 4, 0, 4, 8, 12, 16, 12],
    leadB: [16, 16, 14, 11, 7, 4, 0, 0, 7, 11, 14, 18, 19, 18, 14, 11],
    bassPat: [0, 0, 4, 7, 0, 7, 4, 11],
    color: 0.9,
    drive: 0.85,
  },
  glacier: {
    bpm: 80,
    roots: [53, 53, 56, 51, 53, 48, 51, 53],
    leadA: [0, 0, 0, 2, 5, 5, 7, 5, 2, 0, 5, 7, 9, 12, 9, 7],
    leadB: [9, 9, 7, 5, 2, 0, 0, 2, 5, 7, 9, 12, 14, 12, 9, 7],
    bassPat: [0, 0, 0, 0, 0, 0, 5, 7],
    color: 0.7,
    drive: 0.25,
  },
  swarmlord: {
    bpm: 106,
    roots: [56, 59, 61, 59, 56, 54, 51, 54],
    leadA: [0, 3, 5, 5, 7, 7, 5, 3, 0, -2, 0, 5, 7, 10, 12, 10],
    leadB: [12, 12, 10, 7, 5, 3, 0, 0, 5, 7, 10, 14, 12, 10, 7, 5],
    bassPat: [0, 0, 0, 5, 0, 0, 7, 3],
    color: 0.5,
    drive: 0.6,
  },
  pulsejet: {
    bpm: 110,
    roots: [58, 61, 63, 61, 58, 56, 54, 56],
    leadA: [0, 3, 7, 7, 10, 12, 12, 10, 7, 3, 5, 8, 12, 15, 12, 8],
    leadB: [15, 15, 12, 10, 7, 5, 3, 0, 7, 10, 12, 15, 19, 22, 19, 15],
    bassPat: [0, 0, 7, 0, 12, 0, 5, 0],
    color: 0.6,
    drive: 0.7,
  },
  railfox: {
    bpm: 100,
    roots: [54, 57, 59, 57, 54, 52, 50, 52],
    leadA: [0, 2, 5, 5, 7, 9, 9, 7, 5, 2, 0, 5, 7, 12, 14, 12],
    leadB: [14, 14, 12, 7, 5, 2, 0, 0, 5, 7, 12, 16, 19, 16, 14, 12],
    bassPat: [0, 0, 5, 0, 7, 0, 2, 0],
    color: 0.75,
    drive: 0.45,
  },
  sanguine: {
    bpm: 94,
    roots: [51, 48, 54, 46, 51, 49, 44, 48],
    leadA: [0, 0, 1, 3, 6, 6, 8, 6, 3, 1, 0, 3, 6, 8, 11, 8],
    leadB: [11, 11, 8, 6, 3, 1, 0, 0, 3, 6, 8, 11, 15, 18, 15, 11],
    bassPat: [0, 0, 0, 6, 0, 3, 0, 8],
    color: 0.35,
    drive: 0.55,
  },
};

function n2f(n: number): number {
  return 440 * Math.pow(2, (n - 69) / 12);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private verb: ConvolverNode | null = null;
  private verbGain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private delayFb: GainNode | null = null;
  private delaySend: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private thrustNodes = new Map<number, ThrustVoice>();
  private started = false;
  private musicOn = true;
  private musicRunning = false;
  private step = 0;
  private nextNoteTime = 0;
  private timerId: number | null = null;
  private intensity = 0.35;
  private theme: Theme = MENU_THEME;
  private themeId: ShipId | 'menu' = 'menu';
  private stepDur = 60 / themeTempo(MENU_THEME.bpm) / 2;
  muted = false;

  async unlock(): Promise<void> {
    if (this.started) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.78;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 3.5;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.18;
    this.master.connect(limiter);
    limiter.connect(this.ctx.destination);

    // Music chain: gain -> soft compress -> hall + long delay
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.36;
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 1;
    const musicComp = this.ctx.createDynamicsCompressor();
    musicComp.threshold.value = -18;
    musicComp.knee.value = 12;
    musicComp.ratio.value = 2.0;
    musicComp.attack.value = 0.02;
    musicComp.release.value = 0.28;
    this.musicGain.connect(musicComp);
    musicComp.connect(this.musicBus);
    this.musicBus.connect(this.master);

    // Wide scoring stage
    this.verb = this.makeReverb(2.4);
    this.verbGain = this.ctx.createGain();
    this.verbGain.gain.value = 0.22;
    this.musicBus.connect(this.verb);
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.38;
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.value = 0.28;
    this.delaySend = this.ctx.createGain();
    this.delaySend.gain.value = 0.14;
    const delayFilter = this.ctx.createBiquadFilter();
    delayFilter.type = 'lowpass';
    delayFilter.frequency.value = 2400;
    this.musicBus.connect(this.delaySend);
    this.delaySend.connect(this.delay);
    this.delay.connect(delayFilter);
    delayFilter.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    delayFilter.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.7;
    const sfxHp = this.ctx.createBiquadFilter();
    sfxHp.type = 'highpass';
    sfxHp.frequency.value = 40;
    this.sfxGain.connect(sfxHp);
    sfxHp.connect(this.master);
    // Light sfx into verb for space
    const sfxVerbSend = this.ctx.createGain();
    sfxVerbSend.gain.value = 0.12;
    this.sfxGain.connect(sfxVerbSend);
    sfxVerbSend.connect(this.verb);

    this.noiseBuf = this.makeNoiseBuffer(2.0);

    await this.ctx.resume();
    this.started = true;
    this.startMusic();
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // Soft brown-ish noise - less harsh than white
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  private makeReverb(seconds: number): ConvolverNode {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * 0.55;
      }
    }
    const node = ctx.createConvolver();
    node.buffer = buf;
    return node;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.78;
  }

  setIntensity(v: number): void {
    this.intensity = clamp01(v);
    if (this.verbGain && this.ctx) {
      this.verbGain.gain.setTargetAtTime(0.18 + this.intensity * 0.12, this.ctx.currentTime, 0.25);
    }
    if (this.delaySend && this.ctx) {
      this.delaySend.gain.setTargetAtTime(0.12 + this.intensity * 0.1, this.ctx.currentTime, 0.25);
    }
  }

  setTheme(shipId: ShipId | null): void {
    const next = shipId ?? null;
    const id: ShipId | 'menu' = next ?? 'menu';
    if (id === this.themeId) return;
    this.themeId = id;
    this.theme = next ? SHIP_THEMES[next] : MENU_THEME;
    this.stepDur = 60 / themeTempo(this.theme.bpm) / 2;
    this.step = 0;
    if (!next) this.intensity = 0.32;
    if (this.ctx) this.nextNoteTime = this.ctx.currentTime + 0.08;
  }

  private now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  private env(
    g: GainNode,
    t: number,
    peak: number,
    attack: number,
    dur: number,
    release = 0.08,
  ): void {
    const p = Math.max(0.0001, peak);
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + Math.max(0.004, attack));
    const hold = Math.max(attack + 0.01, dur - release);
    g.gain.exponentialRampToValueAtTime(p * 0.65, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  /** Warm analog-ish voice: detuned saws into a resonant lowpass. */
  private voiceAt(
    dest: AudioNode,
    when: number,
    freq: number,
    dur: number,
    vol: number,
    opts: {
      type?: OscillatorType;
      detune?: number;
      voices?: number;
      cutoff?: number;
      q?: number;
      attack?: number;
      slide?: number;
    } = {},
  ): void {
    if (!this.ctx || this.muted || vol <= 0) return;
    const t = Math.max(when, this.now() + 0.001);
    const f0 = Math.max(40, freq);
    const voices = opts.voices ?? 1;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cut = opts.cutoff ?? 2200;
    filter.frequency.setValueAtTime(cut * 0.45, t);
    filter.frequency.exponentialRampToValueAtTime(cut, t + Math.min(0.12, dur * 0.35));
    filter.frequency.exponentialRampToValueAtTime(cut * 0.5, t + dur);
    filter.Q.value = opts.q ?? 0.8;
    const amp = this.ctx.createGain();
    this.env(amp, t, Math.min(vol, 0.22), opts.attack ?? 0.02, dur, dur * 0.35);
    filter.connect(amp);
    amp.connect(dest);

    for (let i = 0; i < voices; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = opts.type ?? 'sawtooth';
      const det =
        (opts.detune ?? 8) * (i - (voices - 1) / 2) + (i === 0 ? 0 : (i % 2 ? 3 : -2));
      const startF = opts.slide ? f0 * opts.slide : f0;
      osc.frequency.setValueAtTime(startF, t);
      if (opts.slide) osc.frequency.exponentialRampToValueAtTime(f0, t + 0.06);
      osc.detune.setValueAtTime(det, t);
      const g = this.ctx.createGain();
      g.gain.value = 1 / Math.sqrt(voices);
      osc.connect(g);
      g.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** French-horn / brass lead - soft attack, gentle vibrato. */
  private leadAt(
    dest: AudioNode,
    when: number,
    freq: number,
    dur: number,
    vol: number,
  ): void {
    if (!this.ctx || this.muted || vol <= 0) return;
    const t = Math.max(when, this.now() + 0.001);
    const f0 = Math.max(90, freq);
    const amp = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.linearRampToValueAtTime(2200, t + Math.min(0.14, dur * 0.35));
    filter.frequency.exponentialRampToValueAtTime(1200, t + dur);
    filter.Q.value = 0.6;
    this.env(amp, t, Math.min(vol, 0.13), 0.06, dur, dur * 0.45);

    const fund = this.ctx.createOscillator();
    fund.type = 'sawtooth';
    fund.frequency.setValueAtTime(f0, t);
    const soft = this.ctx.createOscillator();
    soft.type = 'sine';
    soft.frequency.setValueAtTime(f0, t);
    const fifth = this.ctx.createOscillator();
    fifth.type = 'triangle';
    fifth.frequency.setValueAtTime(f0 * 1.5, t);
    const fundG = this.ctx.createGain();
    fundG.gain.value = 0.45;
    const softG = this.ctx.createGain();
    softG.gain.value = 0.55;
    const fifthG = this.ctx.createGain();
    fifthG.gain.value = 0.12;

    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 4.2;
    lfoG.gain.value = f0 * 0.0045;
    lfo.connect(lfoG);
    lfoG.connect(fund.frequency);
    lfoG.connect(soft.frequency);

    fund.connect(fundG);
    soft.connect(softG);
    fifth.connect(fifthG);
    fundG.connect(filter);
    softG.connect(filter);
    fifthG.connect(filter);
    filter.connect(amp);
    amp.connect(dest);
    fund.start(t);
    soft.start(t);
    fifth.start(t);
    lfo.start(t);
    const stop = t + dur + 0.08;
    fund.stop(stop);
    soft.stop(stop);
    fifth.stop(stop);
    lfo.stop(stop);
  }

  /** String-section pad chord tone. */
  private padAt(
    dest: AudioNode,
    when: number,
    freq: number,
    dur: number,
    vol: number,
  ): void {
    if (!this.ctx || this.muted || vol <= 0) return;
    const t = Math.max(when, this.now() + 0.001);
    const f0 = Math.max(80, freq);
    const amp = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(1600, t + dur * 0.4);
    filter.frequency.exponentialRampToValueAtTime(900, t + dur);
    filter.Q.value = 0.4;
    this.env(amp, t, Math.min(vol, 0.08), 0.12, dur, dur * 0.5);

    for (const [det, type, gAmt] of [
      [0, 'sawtooth', 0.4],
      [7, 'sawtooth', 0.28],
      [-6, 'triangle', 0.35],
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      osc.detune.setValueAtTime(det, t);
      const g = this.ctx.createGain();
      g.gain.value = gAmt;
      osc.connect(g);
      g.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
    filter.connect(amp);
    amp.connect(dest);
  }

  /** Harp / piano sparkle for film arpeggios. */
  private harpAt(
    dest: AudioNode,
    when: number,
    freq: number,
    vol: number,
  ): void {
    if (!this.ctx || this.muted || vol <= 0) return;
    const t = Math.max(when, this.now() + 0.001);
    const f0 = Math.max(140, freq);
    const dur = 0.55;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(Math.min(vol, 0.1), t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    amp.connect(dest);

    for (const [mult, v] of [
      [1, 1],
      [2, 0.4],
      [3, 0.15],
    ] as const) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f0 * mult, t);
      const g = this.ctx.createGain();
      g.gain.value = v;
      osc.connect(g);
      g.connect(amp);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  /** Soft timpani / low orchestral pulse. */
  private timpAt(dest: AudioNode, when: number, vol: number): void {
    if (!this.ctx || this.muted) return;
    const t = Math.max(when, this.now() + 0.001);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.22);
    g.gain.setValueAtTime(Math.min(vol, 0.45), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.48);
    this.noiseBurst(dest, t, 0.04, vol * 0.18, { freq: 400, type: 'lowpass', q: 0.8 });
  }

  private noiseBurst(
    dest: AudioNode,
    when: number,
    dur: number,
    vol: number,
    opts: { freq?: number; type?: BiquadFilterType; q?: number } = {},
  ): void {
    if (!this.ctx || !this.noiseBuf || this.muted || vol <= 0) return;
    const t = Math.max(when, this.now() + 0.001);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = opts.type ?? 'bandpass';
    filter.frequency.setValueAtTime(opts.freq ?? 1800, t);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(120, (opts.freq ?? 1800) * 0.35),
      t + dur,
    );
    filter.Q.value = opts.q ?? 1.2;
    const g = this.ctx.createGain();
    this.env(g, t, Math.min(vol, 0.35), 0.004, dur, dur * 0.5);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  private kickAt(dest: AudioNode, when: number, vol: number): void {
    if (!this.ctx || this.muted) return;
    const t = Math.max(when, this.now() + 0.001);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(Math.min(vol, 0.55), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.3);
    // Click transient
    this.noiseBurst(dest, t, 0.03, vol * 0.25, { freq: 2200, type: 'highpass', q: 0.7 });
  }

  private snareAt(dest: AudioNode, when: number, vol: number): void {
    if (!this.ctx || this.muted) return;
    const t = Math.max(when, this.now() + 0.001);
    this.noiseBurst(dest, t, 0.14, vol * 0.9, { freq: 1800, type: 'bandpass', q: 0.9 });
    this.voiceAt(dest, t, 180, 0.08, vol * 0.25, {
      type: 'triangle',
      cutoff: 800,
      attack: 0.002,
      voices: 1,
    });
  }

  private hatAt(dest: AudioNode, when: number, vol: number, open = false): void {
    this.noiseBurst(dest, when, open ? 0.12 : 0.035, vol, {
      freq: open ? 7000 : 9000,
      type: 'highpass',
      q: 0.6,
    });
  }

  // ---- Public SFX -------------------------------------------------------

  fire(kind: 'laser' | 'heavy' | 'missile' | 'special' = 'laser'): void {
    if (!this.sfxGain) return;
    const t = this.now();
    if (kind === 'heavy') {
      this.voiceAt(this.sfxGain, t, 90, 0.18, 0.28, {
        type: 'sawtooth',
        cutoff: 900,
        attack: 0.005,
        slide: 1.8,
        voices: 2,
      });
      this.noiseBurst(this.sfxGain, t, 0.1, 0.2, { freq: 600, type: 'lowpass' });
    } else if (kind === 'missile') {
      this.noiseBurst(this.sfxGain, t, 0.32, 0.22, { freq: 900, type: 'bandpass', q: 2 });
      this.voiceAt(this.sfxGain, t, 320, 0.28, 0.16, {
        type: 'sawtooth',
        cutoff: 1400,
        slide: 2.2,
        attack: 0.01,
      });
    } else if (kind === 'special') {
      this.voiceAt(this.sfxGain, t, 520, 0.16, 0.18, {
        type: 'triangle',
        cutoff: 3200,
        voices: 2,
        detune: 12,
      });
      this.noiseBurst(this.sfxGain, t, 0.08, 0.12, { freq: 2400, type: 'highpass' });
    } else {
      this.voiceAt(this.sfxGain, t, 880, 0.07, 0.14, {
        type: 'sawtooth',
        cutoff: 4200,
        attack: 0.002,
        slide: 0.55,
      });
      this.noiseBurst(this.sfxGain, t, 0.04, 0.1, { freq: 3500, type: 'bandpass', q: 2.5 });
    }
  }

  shipFire(shipId: ShipId): void {
    if (!this.sfxGain) return;
    const t = this.now();
    switch (shipId) {
      case 'solhammer':
      case 'bulwark':
      case 'harrier':
        this.fire('heavy');
        break;
      case 'brood':
      case 'grappler':
      case 'sanguine':
      case 'minewright':
        this.fire('missile');
        break;
      case 'cinder':
        this.noiseBurst(this.sfxGain, t, 0.12, 0.2, { freq: 700, type: 'lowpass' });
        this.voiceAt(this.sfxGain, t, 140, 0.1, 0.14, { type: 'sawtooth', cutoff: 700 });
        break;
      case 'prism':
      case 'glacier':
      case 'railfox':
      case 'stormlance':
        this.voiceAt(this.sfxGain, t, 1200, 0.09, 0.12, {
          type: 'triangle',
          cutoff: 5000,
          voices: 2,
          detune: 18,
        });
        this.noiseBurst(this.sfxGain, t, 0.05, 0.08, { freq: 4000, type: 'highpass' });
        break;
      case 'nullpoint':
        this.voiceAt(this.sfxGain, t, 220, 0.14, 0.12, {
          type: 'sine',
          cutoff: 1800,
          slide: 0.4,
        });
        this.voiceAt(this.sfxGain, t, 660, 0.12, 0.08, { type: 'triangle', cutoff: 3000 });
        break;
      case 'razorwing':
        this.voiceAt(this.sfxGain, t, 980, 0.045, 0.1, { type: 'sawtooth', cutoff: 5000 });
        this.voiceAt(this.sfxGain, t + 0.03, 1240, 0.04, 0.08, {
          type: 'sawtooth',
          cutoff: 5500,
        });
        break;
      case 'swarmlord':
        this.voiceAt(this.sfxGain, t, 480, 0.05, 0.09, { type: 'triangle', cutoff: 2200 });
        this.voiceAt(this.sfxGain, t + 0.025, 640, 0.05, 0.08, {
          type: 'triangle',
          cutoff: 2600,
        });
        break;
      default:
        this.fire('laser');
    }
  }

  taunt(shipId: ShipId, big = false): void {
    if (!this.sfxGain) return;
    const theme = SHIP_THEMES[shipId];
    const root = theme?.roots[0] ?? 60;
    const t = this.now();
    this.voiceAt(this.sfxGain, t, n2f(root + 12), big ? 0.22 : 0.12, big ? 0.16 : 0.1, {
      type: 'triangle',
      voices: 2,
      detune: 10,
      cutoff: 2800 + (theme?.color ?? 0.5) * 1800,
    });
    this.voiceAt(this.sfxGain, t + 0.06, n2f(root + 19), big ? 0.28 : 0.14, big ? 0.14 : 0.08, {
      type: 'sawtooth',
      cutoff: 3200,
      voices: 2,
    });
    if (big) this.noiseBurst(this.sfxGain, t, 0.12, 0.1, { freq: 1500 });
  }

  ability(kind: string): void {
    if (!this.sfxGain) return;
    const t = this.now();
    switch (kind) {
      case 'nuke_flash':
        this.noiseBurst(this.sfxGain, t, 0.55, 0.4, { freq: 500, type: 'lowpass' });
        this.voiceAt(this.sfxGain, t, 70, 0.5, 0.35, {
          type: 'sine',
          cutoff: 400,
          slide: 2.5,
          attack: 0.01,
        });
        this.kickAt(this.sfxGain, t, 0.4);
        break;
      case 'teleport':
        this.noiseBurst(this.sfxGain, t, 0.16, 0.18, { freq: 2800, type: 'bandpass', q: 3 });
        this.voiceAt(this.sfxGain, t, 1400, 0.16, 0.12, {
          type: 'sine',
          slide: 0.35,
          cutoff: 4000,
        });
        break;
      case 'phase':
        this.voiceAt(this.sfxGain, t, 180, 0.2, 0.12, { type: 'sawtooth', cutoff: 1200, slide: 0.5 });
        this.voiceAt(this.sfxGain, t, 900, 0.2, 0.1, { type: 'triangle', cutoff: 3500, slide: 2.2 });
        this.noiseBurst(this.sfxGain, t, 0.14, 0.12, { freq: 3000, type: 'highpass' });
        break;
      case 'shield_flash':
        this.voiceAt(this.sfxGain, t, 280, 0.22, 0.14, { type: 'triangle', voices: 3, detune: 14 });
        this.noiseBurst(this.sfxGain, t, 0.1, 0.1, { freq: 2200, type: 'bandpass' });
        break;
      case 'nova':
        this.noiseBurst(this.sfxGain, t, 0.28, 0.28, { freq: 1400 });
        for (let i = 0; i < 5; i++) {
          this.voiceAt(this.sfxGain, t + i * 0.03, 400 + i * 160, 0.14, 0.08, {
            type: 'triangle',
            cutoff: 3600,
          });
        }
        break;
      case 'hive':
        this.noiseBurst(this.sfxGain, t, 0.2, 0.14, { freq: 800, type: 'bandpass', q: 2 });
        this.voiceAt(this.sfxGain, t, 200, 0.22, 0.12, { type: 'sawtooth', cutoff: 900, voices: 2 });
        break;
      case 'wake':
        this.noiseBurst(this.sfxGain, t, 0.07, 0.08, { freq: 1200, type: 'bandpass' });
        break;
      case 'panic':
        this.voiceAt(this.sfxGain, t, 500, 0.16, 0.14, {
          type: 'sawtooth',
          cutoff: 4000,
          slide: 0.45,
          voices: 2,
        });
        break;
      case 'ring':
        this.voiceAt(this.sfxGain, t, 640, 0.14, 0.1, { type: 'sine', voices: 2, detune: 6 });
        break;
      case 'spark':
        this.noiseBurst(this.sfxGain, t, 0.05, 0.12, { freq: 5000, type: 'highpass' });
        break;
      case 'cloak_pop':
        this.voiceAt(this.sfxGain, t, 700, 0.14, 0.1, { type: 'triangle', slide: 2.4 });
        break;
      case 'pickup':
        this.voiceAt(this.sfxGain, t, 520, 0.1, 0.1, { type: 'triangle', cutoff: 3000 });
        this.voiceAt(this.sfxGain, t + 0.05, 780, 0.12, 0.09, { type: 'triangle', cutoff: 3600 });
        this.voiceAt(this.sfxGain, t + 0.1, 1040, 0.14, 0.07, { type: 'sine', cutoff: 4000 });
        break;
      default:
        this.voiceAt(this.sfxGain, t, 480, 0.12, 0.1, { type: 'triangle', cutoff: 2400 });
    }
  }

  hit(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    this.noiseBurst(this.sfxGain, t, 0.08, 0.22, { freq: 1600, type: 'bandpass', q: 1.5 });
    this.voiceAt(this.sfxGain, t, 160, 0.1, 0.16, { type: 'sawtooth', cutoff: 700, slide: 1.6 });
  }

  explosion(big = false): void {
    if (!this.sfxGain) return;
    const t = this.now();
    this.noiseBurst(this.sfxGain, t, big ? 0.45 : 0.22, big ? 0.4 : 0.25, {
      freq: big ? 450 : 900,
      type: 'lowpass',
    });
    this.voiceAt(this.sfxGain, t, big ? 55 : 90, big ? 0.4 : 0.2, big ? 0.32 : 0.18, {
      type: 'sine',
      cutoff: 500,
      slide: 2.8,
    });
    if (big) this.kickAt(this.sfxGain, t, 0.35);
  }

  teleport(): void {
    this.ability('teleport');
  }

  ui(): void {
    if (!this.sfxGain) return;
    this.voiceAt(this.sfxGain, this.now(), 720, 0.05, 0.07, {
      type: 'sine',
      cutoff: 3000,
      attack: 0.002,
    });
  }

  pick(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    this.voiceAt(this.sfxGain, t, 523, 0.08, 0.09, { type: 'triangle', cutoff: 2800 });
    this.voiceAt(this.sfxGain, t + 0.05, 784, 0.1, 0.07, { type: 'triangle', cutoff: 3400 });
  }

  combo(n: number): void {
    if (!this.sfxGain) return;
    const midi = 60 + Math.min(24, n * 2);
    this.voiceAt(this.sfxGain, this.now(), n2f(midi), 0.1, 0.09 + Math.min(0.06, n * 0.006), {
      type: 'triangle',
      voices: 2,
      detune: 8,
      cutoff: 3600,
    });
    if (n >= 5) {
      this.voiceAt(this.sfxGain, this.now() + 0.04, n2f(midi + 7), 0.12, 0.07, {
        type: 'sine',
        cutoff: 4000,
      });
    }
  }

  countdownBeep(final = false): void {
    if (!this.sfxGain) return;
    if (final) {
      this.voiceAt(this.sfxGain, this.now(), n2f(72), 0.24, 0.16, {
        type: 'triangle',
        voices: 2,
        cutoff: 3200,
      });
      this.voiceAt(this.sfxGain, this.now() + 0.05, n2f(84), 0.2, 0.1, {
        type: 'sine',
        cutoff: 4000,
      });
    } else {
      this.voiceAt(this.sfxGain, this.now(), n2f(67), 0.1, 0.11, {
        type: 'triangle',
        cutoff: 2800,
      });
    }
  }

  heartbeat(): void {
    if (!this.sfxGain) return;
    this.kickAt(this.sfxGain, this.now(), 0.22);
    setTimeout(() => {
      if (this.sfxGain) this.kickAt(this.sfxGain, this.now(), 0.14);
    }, 110);
  }

  clutch(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    this.voiceAt(this.sfxGain, t, 280, 0.2, 0.14, {
      type: 'sawtooth',
      cutoff: 2800,
      slide: 0.4,
      voices: 2,
    });
    this.voiceAt(this.sfxGain, t + 0.05, n2f(76), 0.16, 0.1, { type: 'triangle', cutoff: 3600 });
  }

  win(): void {
    [60, 64, 67, 72, 79].forEach((midi, i) => {
      setTimeout(() => {
        if (!this.sfxGain) return;
        this.voiceAt(this.sfxGain, this.now(), n2f(midi), 0.22, 0.1, {
          type: 'triangle',
          voices: 2,
          detune: 6,
          cutoff: 3000,
        });
      }, i * 95);
    });
  }

  boutWin(streak = 1): void {
    if (!this.sfxGain) return;
    const boost = Math.min(4, streak);
    const t = this.now();
    this.voiceAt(this.sfxGain, t, n2f(67 + boost), 0.14, 0.12, {
      type: 'triangle',
      voices: 2,
      cutoff: 3000,
    });
    this.voiceAt(this.sfxGain, t + 0.1, n2f(74 + boost), 0.18, 0.12, {
      type: 'triangle',
      voices: 2,
      cutoff: 3400,
    });
    if (streak >= 3) {
      this.voiceAt(this.sfxGain, t + 0.2, n2f(79), 0.22, 0.1, {
        type: 'sine',
        voices: 2,
        cutoff: 3800,
      });
    }
  }

  setThrust(player: number, on: boolean, afterburn = false): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuf) return;
    const existing = this.thrustNodes.get(player);
    if (on) {
      const target = afterburn ? 0.045 : 0.018;
      const cut = afterburn ? 1400 : 700;
      if (existing) {
        existing.gain.gain.setTargetAtTime(target, this.now(), 0.05);
        existing.filter.frequency.setTargetAtTime(cut, this.now(), 0.05);
        return;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuf;
      noise.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = cut;
      filter.Q.value = 1.4;
      const g = this.ctx.createGain();
      g.gain.value = 0.0001;
      noise.connect(filter);
      filter.connect(g);
      g.connect(this.sfxGain);
      noise.start();
      g.gain.setTargetAtTime(target, this.now(), 0.08);
      this.thrustNodes.set(player, { noise, gain: g, filter });
    } else if (existing) {
      const node = existing;
      this.thrustNodes.delete(player);
      node.gain.gain.setTargetAtTime(0.0001, this.now(), 0.05);
      const stopAt = this.now() + 0.15;
      try {
        node.noise.stop(stopAt);
      } catch {
        /* */
      }
    }
  }

  // ---- Music (cinematic film score) -------------------------------------

  private scheduleStep(when: number): void {
    if (!this.musicGain) return;
    const dest = this.musicGain;
    const th = this.theme;
    const s = this.step % 32;
    const bar = Math.floor(this.step / 8) % 8;
    const phrase = Math.floor(this.step / 32) % 4;
    const root = th.roots[bar % th.roots.length]!;
    const heat = this.intensity;
    const lead = bar >= 4 ? th.leadB : th.leadA;
    const STEP = this.stepDur;
    // Exposition -> rise -> climax -> aftermath
    const section =
      phrase === 0 ? 0.2 : phrase === 1 ? 0.45 : phrase === 2 ? 0.85 : 0.3;
    const drama = clamp01(heat * 0.4 + section + th.drive * 0.18);
    const bright = th.color;
    const third = bright > 0.55 ? 4 : 3;

    // --- Timpani / sparse kit (orchestral pulse, not dance) ---
    if (s % 8 === 0) this.timpAt(dest, when, 0.16 + drama * 0.12);
    if (s % 8 === 4 && drama > 0.35) this.kickAt(dest, when, 0.1 + drama * 0.06);
    if (s % 8 === 4 && drama > 0.5) this.snareAt(dest, when, 0.06 + drama * 0.05);
    if (phrase >= 2 && s % 8 === 6) this.hatAt(dest, when, 0.02, true);
    // Soft brush on offbeats in climax only
    if (phrase === 2 && (s % 8 === 2 || s % 8 === 6)) {
      this.hatAt(dest, when, 0.015 + drama * 0.01, false);
    }

    // --- Cello / bass pedal ---
    if (s % 4 === 0 || (s % 8 === 6 && drama > 0.4)) {
      const bOff = th.bassPat[s % th.bassPat.length]!;
      this.voiceAt(
        dest,
        when,
        n2f(root + bOff - 12),
        STEP * (s % 8 === 0 ? 2.4 : 1.4),
        0.09 + drama * 0.04,
        {
          type: 'triangle',
          cutoff: 280 + drama * 160,
          q: 0.9,
          attack: 0.04,
          voices: 1,
        },
      );
    }

    // --- String pads (sustained harmony) ---
    if (s % 8 === 0) {
      const padVol = 0.028 + drama * 0.035 + bright * 0.01;
      const padDur = STEP * 7.5;
      this.padAt(dest, when, n2f(root + 12), padDur, padVol);
      this.padAt(dest, when + 0.02, n2f(root + 12 + third), padDur, padVol * 0.75);
      this.padAt(dest, when + 0.04, n2f(root + 19), padDur, padVol * 0.55);
      if (drama > 0.55) {
        this.padAt(dest, when + 0.06, n2f(root + 24), padDur * 0.9, padVol * 0.35);
      }
    }

    // --- Horn melody (long held tones; re-trigger only on pitch change) ---
    const leadDeg = lead[s % lead.length]!;
    const prevDeg = s === 0 ? leadDeg - 1 : lead[(s - 1) % lead.length]!;
    const pitchChange = leadDeg !== prevDeg;
    const playLead =
      pitchChange ||
      s % 8 === 0 ||
      (phrase >= 2 && s % 8 === 4);
    if (playLead) {
      // Hold through same-pitch steps ahead
      let hold = 1;
      for (let i = 1; i < 8; i++) {
        if (lead[(s + i) % lead.length] === leadDeg) hold++;
        else break;
      }
      const len = Math.min(4.5, hold * 0.95 + (s % 8 === 0 ? 0.4 : 0));
      this.leadAt(
        dest,
        when,
        n2f(root + leadDeg + 12),
        STEP * len,
        0.08 + drama * 0.06,
      );
      // Octave double in climax
      if (phrase === 2 && pitchChange && s % 4 === 0) {
        this.leadAt(dest, when, n2f(root + leadDeg + 24), STEP * len * 0.85, 0.035);
      }
      // Soft harmony a sixth below on rises
      if (phrase >= 1 && s % 8 === 0) {
        this.leadAt(dest, when, n2f(root + leadDeg + 5), STEP * 2.2, 0.03);
      }
    }

    // --- Harp answer / counter-melody ---
    if (phrase >= 1 && (s % 8 === 3 || s % 8 === 7)) {
      const answer = lead[(s + 3) % lead.length]! + (phrase === 2 ? 12 : 7);
      this.harpAt(dest, when, n2f(root + answer), 0.045 + drama * 0.03);
    }

    // --- Rising fanfare into climax ---
    if (s === 28 && phrase === 1) {
      const run = [0, 4, 7, 12, 16, 19];
      for (let i = 0; i < run.length; i++) {
        this.harpAt(dest, when + i * STEP * 0.35, n2f(root + 12 + run[i]!), 0.05);
      }
    }
    if (s === 30 && phrase === 2) {
      for (const deg of [0, third, 7, 12]) {
        this.padAt(dest, when, n2f(root + 12 + deg), STEP * 3, 0.04);
      }
      this.timpAt(dest, when, 0.28);
    }

    this.step += 1;
  }

  private scheduler = (): void => {
    if (!this.ctx || !this.musicOn || this.muted) {
      this.timerId = window.setTimeout(this.scheduler, 50);
      return;
    }
    const horizon = 0.16;
    while (this.nextNoteTime < this.ctx.currentTime + horizon) {
      this.scheduleStep(this.nextNoteTime);
      this.nextNoteTime += this.stepDur;
    }
    this.timerId = window.setTimeout(this.scheduler, 35);
  };

  private startMusic(): void {
    if (!this.ctx || !this.musicGain || this.musicRunning) return;
    this.musicRunning = true;
    this.musicOn = true;
    this.step = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.scheduler();
  }

  stopMusic(): void {
    this.musicOn = false;
    this.musicRunning = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    for (const [, node] of this.thrustNodes) {
      try {
        node.noise.stop();
      } catch {
        /* */
      }
    }
    this.thrustNodes.clear();
  }
}

export const sound = new SoundEngine();
