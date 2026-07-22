/**
 * Scrap Rumble music: heroic, addictive battle anthems.
 * Punchy kits, driving bass, catchy brass hooks, chord stabs.
 * Every ship gets its own tempo, key, and earworm motif.
 * Composed for arcade adrenaline, not slow film pads.
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
  /** 0 dark / gritty, 1 bright / heroic */
  color: number;
  /** 0 lean groove, 1 full-throttle drive */
  drive: number;
};

function themeTempo(bpm: number): number {
  // Battle anthems stay energetic
  return Math.min(140, Math.max(108, bpm));
}

/**
 * Title - bright heroic earworm, I-V-vi-IV in C major.
 * Hook cell 0 7 12 7 so it lodges in your head.
 */
const MENU_THEME: Theme = {
  bpm: 124,
  // C - G - Am - F - C - G - F - G
  roots: [60, 55, 57, 53, 60, 55, 53, 55],
  leadA: [0, 7, 12, 7, 9, 7, 4, 0, 5, 9, 12, 9, 7, 5, 4, 0],
  leadB: [12, 7, 12, 16, 14, 12, 9, 7, 9, 12, 16, 12, 11, 9, 7, 5],
  bassPat: [0, 0, 7, 0, 5, 0, 7, 5],
  color: 0.85,
  drive: 0.7,
};

const SHIP_THEMES: Record<ShipId, Theme> = {
  solhammer: {
    // Heavy heroic stomp in D minor
    bpm: 116,
    roots: [50, 50, 46, 53, 50, 45, 46, 48],
    leadA: [0, 7, 3, 7, 0, 7, 10, 7, 0, 3, 5, 7, 10, 7, 3, 0],
    leadB: [12, 7, 10, 7, 12, 15, 12, 10, 7, 10, 12, 15, 12, 10, 7, 3],
    bassPat: [0, 0, 0, 7, 0, 0, 5, 7],
    color: 0.25,
    drive: 0.9,
  },
  zephyr: {
    // Fast bright fanfare in E major
    bpm: 134,
    roots: [52, 47, 49, 45, 52, 47, 45, 47],
    leadA: [0, 4, 7, 12, 7, 4, 7, 11, 9, 7, 4, 0, 4, 9, 12, 16],
    leadB: [16, 12, 16, 19, 16, 12, 11, 9, 7, 11, 12, 16, 19, 16, 12, 9],
    bassPat: [0, 7, 0, 7, 4, 0, 7, 12],
    color: 0.95,
    drive: 0.8,
  },
  bulwark: {
    // Slow grinding G minor stomp
    bpm: 110,
    roots: [55, 51, 46, 50, 55, 51, 53, 50],
    leadA: [0, 0, 7, 0, 3, 3, 0, 0, 5, 5, 3, 0, 7, 5, 3, 0],
    leadB: [7, 3, 7, 10, 7, 3, 0, 0, 10, 7, 5, 3, 7, 5, 3, 0],
    bassPat: [0, 0, 0, 0, 5, 0, 3, 5],
    color: 0.2,
    drive: 0.6,
  },
  shade: {
    // Sneaky chromatic F# minor
    bpm: 122,
    roots: [54, 50, 45, 49, 54, 50, 52, 49],
    leadA: [0, 3, 0, -1, 0, 3, 7, 6, 3, 0, -1, 0, 3, 7, 10, 7],
    leadB: [10, 7, 6, 3, 0, -1, 3, 7, 10, 12, 10, 7, 6, 3, 0, -1],
    bassPat: [0, 0, 7, 0, 3, 0, 6, 0],
    color: 0.4,
    drive: 0.6,
  },
  prism: {
    // Sparkly disco C major
    bpm: 128,
    roots: [60, 57, 53, 55, 60, 52, 53, 55],
    leadA: [0, 4, 7, 12, 11, 7, 4, 0, 5, 9, 12, 16, 14, 11, 7, 4],
    leadB: [12, 16, 19, 16, 14, 12, 11, 7, 12, 16, 19, 23, 19, 16, 12, 11],
    bassPat: [0, 0, 4, 7, 0, 7, 4, 0],
    color: 1.0,
    drive: 0.7,
  },
  brood: {
    // Skittering F minor bug groove
    bpm: 118,
    roots: [53, 49, 44, 51, 53, 49, 48, 51],
    leadA: [0, 3, 0, 3, 5, 3, 0, -2, 0, 3, 7, 3, 5, 3, 0, 0],
    leadB: [7, 5, 3, 7, 10, 7, 5, 3, 7, 10, 12, 10, 7, 5, 3, 0],
    bassPat: [0, 0, 3, 0, 5, 0, 7, 3],
    color: 0.3,
    drive: 0.65,
  },
  cinder: {
    // Fiery driving A minor
    bpm: 130,
    roots: [57, 53, 48, 55, 57, 53, 52, 55],
    leadA: [0, 7, 10, 7, 12, 10, 7, 5, 3, 7, 10, 12, 15, 12, 10, 7],
    leadB: [15, 12, 15, 19, 15, 12, 10, 7, 10, 12, 15, 19, 22, 19, 15, 12],
    bassPat: [0, 7, 0, 10, 0, 7, 5, 0],
    color: 0.65,
    drive: 0.9,
  },
  grappler: {
    // Bouncy D minor swing
    bpm: 120,
    roots: [50, 53, 46, 45, 50, 53, 57, 45],
    leadA: [0, 5, 8, 5, 10, 8, 5, 0, 3, 5, 8, 10, 8, 5, 3, 0],
    leadB: [12, 8, 12, 15, 12, 10, 8, 5, 8, 10, 12, 15, 17, 15, 12, 8],
    bassPat: [0, 0, 5, 0, 8, 0, 3, 5],
    color: 0.45,
    drive: 0.7,
  },
  scuttle: {
    // Goofy chirpy D major
    bpm: 132,
    roots: [62, 57, 59, 55, 62, 57, 55, 57],
    leadA: [0, 2, 4, 7, 4, 2, 0, 4, 7, 9, 7, 4, 0, 4, 7, 12],
    leadB: [12, 11, 7, 4, 7, 11, 12, 14, 12, 11, 7, 4, 7, 12, 14, 16],
    bassPat: [0, 0, 4, 7, 0, 2, 7, 12],
    color: 0.9,
    drive: 0.75,
  },
  nullpoint: {
    // Uneasy whole-tone Eb
    bpm: 112,
    roots: [51, 49, 55, 47, 51, 50, 45, 49],
    leadA: [0, 2, 4, 6, 4, 2, 0, 6, 8, 6, 4, 2, 0, 4, 8, 6],
    leadB: [8, 6, 4, 2, 0, -2, 0, 4, 8, 10, 8, 6, 4, 2, 0, -2],
    bassPat: [0, 0, 6, 0, 2, 0, 8, 0],
    color: 0.5,
    drive: 0.6,
  },
  stormlance: {
    // Electric B minor charge
    bpm: 126,
    roots: [59, 55, 50, 57, 59, 55, 57, 57],
    leadA: [0, 7, 12, 7, 10, 7, 3, 0, 7, 10, 12, 15, 12, 10, 7, 3],
    leadB: [12, 7, 12, 19, 15, 12, 10, 7, 12, 15, 19, 15, 12, 10, 7, 3],
    bassPat: [0, 7, 0, 12, 4, 0, 7, 11],
    color: 0.85,
    drive: 0.85,
  },
  mirage: {
    // Shimmering A minor
    bpm: 124,
    roots: [57, 60, 53, 55, 57, 60, 52, 55],
    leadA: [0, 5, 8, 12, 8, 5, 0, 5, 8, 12, 15, 12, 8, 5, 3, 0],
    leadB: [12, 15, 17, 15, 12, 8, 5, 3, 8, 12, 15, 19, 15, 12, 8, 5],
    bassPat: [0, 0, 5, 0, 8, 0, 3, 0],
    color: 0.7,
    drive: 0.6,
  },
  harrier: {
    // Divebomb G major swagger
    bpm: 129,
    roots: [55, 50, 52, 48, 55, 50, 48, 50],
    leadA: [0, 7, 12, 7, 10, 7, 4, 0, 7, 12, 16, 12, 10, 7, 4, 0],
    leadB: [16, 12, 7, 4, 7, 12, 16, 19, 16, 12, 7, 4, 9, 12, 16, 19],
    bassPat: [0, 0, 7, 0, 10, 0, 5, 0],
    color: 0.6,
    drive: 0.85,
  },
  minewright: {
    // Clunky lopsided Bb
    bpm: 114,
    roots: [46, 50, 51, 53, 46, 50, 53, 53],
    leadA: [0, 0, 5, 0, 3, 0, 5, 7, 0, 0, 7, 5, 3, 0, 5, 0],
    leadB: [7, 5, 7, 10, 7, 5, 3, 0, 5, 7, 10, 12, 10, 7, 5, 3],
    bassPat: [0, 0, 0, 5, 0, 0, 3, 7],
    color: 0.35,
    drive: 0.55,
  },
  razorwing: {
    // Shredding C# minor
    bpm: 138,
    roots: [49, 45, 52, 47, 49, 45, 47, 47],
    leadA: [0, 12, 7, 12, 10, 7, 3, 7, 12, 15, 12, 7, 10, 12, 15, 19],
    leadB: [19, 15, 12, 10, 7, 12, 15, 19, 22, 19, 15, 12, 7, 12, 15, 19],
    bassPat: [0, 12, 0, 7, 3, 0, 12, 7],
    color: 0.9,
    drive: 0.95,
  },
  glacier: {
    // Stately icy F major
    bpm: 108,
    roots: [53, 48, 50, 46, 53, 48, 46, 48],
    leadA: [0, 4, 7, 4, 9, 7, 4, 0, 5, 9, 12, 9, 7, 4, 2, 0],
    leadB: [12, 9, 12, 16, 12, 9, 7, 5, 9, 12, 16, 12, 9, 7, 4, 0],
    bassPat: [0, 0, 0, 7, 0, 0, 5, 7],
    color: 0.75,
    drive: 0.4,
  },
  swarmlord: {
    // Buzzy Ab groove
    bpm: 125,
    roots: [56, 53, 49, 51, 56, 53, 51, 51],
    leadA: [0, 3, 5, 3, 7, 5, 3, 0, 5, 7, 10, 7, 5, 3, 0, 0],
    leadB: [12, 10, 7, 5, 3, 5, 7, 10, 12, 10, 7, 5, 7, 10, 12, 7],
    bassPat: [0, 0, 3, 5, 0, 0, 7, 3],
    color: 0.55,
    drive: 0.7,
  },
  pulsejet: {
    // Pumping Bb four-on-the-floor
    bpm: 127,
    roots: [58, 53, 55, 51, 58, 53, 51, 53],
    leadA: [0, 7, 0, 7, 10, 7, 0, 0, 5, 7, 10, 12, 10, 7, 3, 0],
    leadB: [12, 7, 12, 15, 12, 10, 7, 3, 7, 10, 12, 15, 19, 15, 12, 7],
    bassPat: [0, 7, 0, 7, 12, 0, 5, 0],
    color: 0.6,
    drive: 0.85,
  },
  railfox: {
    // Sleek charging F# major
    bpm: 121,
    roots: [54, 49, 51, 47, 54, 49, 47, 49],
    leadA: [0, 5, 9, 14, 9, 5, 0, 7, 12, 14, 12, 9, 5, 2, 0, 0],
    leadB: [14, 12, 9, 5, 9, 12, 14, 18, 14, 12, 9, 7, 12, 14, 18, 21],
    bassPat: [0, 0, 5, 0, 9, 0, 2, 0],
    color: 0.8,
    drive: 0.7,
  },
  sanguine: {
    // Whiny Eb minor mosquito
    bpm: 119,
    roots: [51, 47, 54, 56, 51, 49, 44, 47],
    leadA: [0, 1, 3, 6, 3, 1, 0, 6, 8, 6, 3, 1, 0, 3, 6, 8],
    leadB: [11, 8, 6, 3, 1, 0, 3, 6, 8, 11, 15, 11, 8, 6, 3, 0],
    bassPat: [0, 0, 6, 0, 3, 0, 8, 6],
    color: 0.4,
    drive: 0.65,
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

    // Music chain: gain -> soft compress -> hall + short delay
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

    // Room, but tighter than a scoring stage - keep the groove punchy
    this.verb = this.makeReverb(1.7);
    this.verbGain = this.ctx.createGain();
    this.verbGain.gain.value = 0.16;
    this.musicBus.connect(this.verb);
    this.verb.connect(this.verbGain);
    this.verbGain.connect(this.master);

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.3;
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.value = 0.24;
    this.delaySend = this.ctx.createGain();
    this.delaySend.gain.value = 0.1;
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
      this.verbGain.gain.setTargetAtTime(0.12 + this.intensity * 0.1, this.ctx.currentTime, 0.25);
    }
    if (this.delaySend && this.ctx) {
      this.delaySend.gain.setTargetAtTime(0.08 + this.intensity * 0.08, this.ctx.currentTime, 0.25);
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

  /** Heroic brass lead - bright saw stack, punchy attack, light vibrato. */
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
    // Bright, forward brass: quick blat then settle
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.linearRampToValueAtTime(3600, t + Math.min(0.05, dur * 0.25));
    filter.frequency.exponentialRampToValueAtTime(1600, t + dur);
    filter.Q.value = 1.1;
    this.env(amp, t, Math.min(vol, 0.15), 0.014, dur, dur * 0.4);

    // Two slightly detuned saws + octave sine give a fat horn stack
    const sawA = this.ctx.createOscillator();
    sawA.type = 'sawtooth';
    sawA.frequency.setValueAtTime(f0, t);
    sawA.detune.setValueAtTime(-7, t);
    const sawB = this.ctx.createOscillator();
    sawB.type = 'sawtooth';
    sawB.frequency.setValueAtTime(f0, t);
    sawB.detune.setValueAtTime(8, t);
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(f0, t);
    const fifth = this.ctx.createOscillator();
    fifth.type = 'triangle';
    fifth.frequency.setValueAtTime(f0 * 1.5, t);
    const sawAG = this.ctx.createGain();
    sawAG.gain.value = 0.32;
    const sawBG = this.ctx.createGain();
    sawBG.gain.value = 0.32;
    const bodyG = this.ctx.createGain();
    bodyG.gain.value = 0.4;
    const fifthG = this.ctx.createGain();
    fifthG.gain.value = 0.12;

    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 5.2;
    lfoG.gain.value = f0 * 0.004;
    lfo.connect(lfoG);
    lfoG.connect(sawA.frequency);
    lfoG.connect(sawB.frequency);
    lfoG.connect(body.frequency);

    sawA.connect(sawAG);
    sawB.connect(sawBG);
    body.connect(bodyG);
    fifth.connect(fifthG);
    sawAG.connect(filter);
    sawBG.connect(filter);
    bodyG.connect(filter);
    fifthG.connect(filter);
    filter.connect(amp);
    amp.connect(dest);
    sawA.start(t);
    sawB.start(t);
    body.start(t);
    fifth.start(t);
    lfo.start(t);
    const stop = t + dur + 0.08;
    sawA.stop(stop);
    sawB.stop(stop);
    body.stop(stop);
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

  /** Harp / bell sparkle for arpeggio answers. */
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

  /** Punchy timpani / low orchestral hit. */
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
    g.gain.setValueAtTime(Math.min(vol, 0.6), t);
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

  /** Cartoon pitch glide - the workhorse for funny swoops, boings, and zaps. */
  private sweep(
    dest: AudioNode,
    when: number,
    f1: number,
    f2: number,
    dur: number,
    vol: number,
    opts: { type?: OscillatorType; cutoff?: number; curve?: 'lin' | 'exp'; attack?: number } = {},
  ): void {
    if (!this.ctx || this.muted || vol <= 0) return;
    const t = Math.max(when, this.now() + 0.001);
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, f1), t);
    if (opts.curve === 'lin') {
      osc.frequency.linearRampToValueAtTime(Math.max(20, f2), t + dur);
    } else {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    }
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.cutoff ?? 4000;
    const g = this.ctx.createGain();
    this.env(g, t, Math.min(vol, 0.3), opts.attack ?? 0.004, dur, dur * 0.4);
    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  /** Vibrato tone - buzzers, squawks, mosquitoes, blenders. */
  private wobble(
    dest: AudioNode,
    when: number,
    freq: number,
    dur: number,
    vol: number,
    rate: number,
    depth: number,
    opts: { type?: OscillatorType; cutoff?: number } = {},
  ): void {
    if (!this.ctx || this.muted || vol <= 0) return;
    const t = Math.max(when, this.now() + 0.001);
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(30, freq), t);
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(rate, t);
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = depth;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.cutoff ?? 3200;
    const g = this.ctx.createGain();
    this.env(g, t, Math.min(vol, 0.3), 0.006, dur, dur * 0.4);
    osc.connect(filter);
    filter.connect(g);
    g.connect(dest);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.03);
    lfo.stop(t + dur + 0.03);
  }

  // ---- Public SFX -------------------------------------------------------

  fire(kind: 'laser' | 'heavy' | 'missile' | 'special' = 'laser'): void {
    if (!this.sfxGain) return;
    const t = this.now();
    if (kind === 'heavy') {
      // Chunky boomf
      this.sweep(this.sfxGain, t, 240, 60, 0.16, 0.3, { type: 'sawtooth', cutoff: 900 });
      this.noiseBurst(this.sfxGain, t, 0.1, 0.2, { freq: 600, type: 'lowpass' });
      this.kickAt(this.sfxGain, t, 0.22);
    } else if (kind === 'missile') {
      this.noiseBurst(this.sfxGain, t, 0.32, 0.22, { freq: 900, type: 'bandpass', q: 2 });
      this.sweep(this.sfxGain, t, 320, 760, 0.28, 0.16, { type: 'sawtooth', cutoff: 1400 });
    } else if (kind === 'special') {
      this.sweep(this.sfxGain, t, 520, 1040, 0.14, 0.18, { type: 'triangle', cutoff: 3200 });
      this.noiseBurst(this.sfxGain, t, 0.08, 0.12, { freq: 2400, type: 'highpass' });
    } else {
      // Snappy pew
      this.sweep(this.sfxGain, t, 1500, 620, 0.09, 0.16, { type: 'sawtooth', cutoff: 4200 });
      this.noiseBurst(this.sfxGain, t, 0.04, 0.1, { freq: 3500, type: 'bandpass', q: 2.5 });
    }
  }

  shipFire(shipId: ShipId): void {
    if (!this.sfxGain) return;
    const d = this.sfxGain;
    const t = this.now();
    switch (shipId) {
      case 'solhammer': {
        // Chunky BOOMF cannon
        this.kickAt(d, t, 0.4);
        this.sweep(d, t, 200, 46, 0.22, 0.32, { type: 'sawtooth', cutoff: 800 });
        this.noiseBurst(d, t, 0.16, 0.24, { freq: 500, type: 'lowpass' });
        break;
      }
      case 'zephyr': {
        // Cartoon zip pew-pew
        this.sweep(d, t, 900, 1700, 0.05, 0.13, { type: 'square', cutoff: 5000 });
        this.sweep(d, t + 0.07, 1100, 2000, 0.05, 0.12, { type: 'square', cutoff: 5200 });
        this.noiseBurst(d, t, 0.03, 0.05, { freq: 6000, type: 'highpass' });
        break;
      }
      case 'bulwark': {
        // Heavy metal thunk
        this.sweep(d, t, 180, 70, 0.12, 0.26, { type: 'square', cutoff: 700 });
        this.noiseBurst(d, t, 0.07, 0.18, { freq: 300, type: 'lowpass', q: 1.2 });
        break;
      }
      case 'shade': {
        // Whispery sneak zap
        this.noiseBurst(d, t, 0.14, 0.12, { freq: 5200, type: 'highpass', q: 0.7 });
        this.sweep(d, t, 2200, 900, 0.1, 0.07, { type: 'sine', cutoff: 4000 });
        break;
      }
      case 'prism': {
        // Sparkly disco boing
        this.sweep(d, t, 500, 1300, 0.09, 0.12, { type: 'triangle', cutoff: 4500 });
        this.harpAt(d, t + 0.02, 1568, 0.08);
        this.harpAt(d, t + 0.06, 2093, 0.06);
        break;
      }
      case 'brood': {
        // Wet bug spit
        this.noiseBurst(d, t, 0.06, 0.16, { freq: 1200, type: 'bandpass', q: 3 });
        this.sweep(d, t, 700, 260, 0.08, 0.12, { type: 'sawtooth', cutoff: 1600 });
        break;
      }
      case 'cinder': {
        // Flame fart whoosh
        this.noiseBurst(d, t, 0.24, 0.22, { freq: 700, type: 'lowpass' });
        this.wobble(d, t, 130, 0.16, 0.14, 22, 26, { type: 'sawtooth', cutoff: 800 });
        break;
      }
      case 'grappler': {
        // Spring YOINK - up then down
        this.sweep(d, t, 300, 1100, 0.07, 0.14, { type: 'triangle', cutoff: 3000, curve: 'lin' });
        this.sweep(d, t + 0.07, 1100, 380, 0.12, 0.12, { type: 'triangle', cutoff: 3000, curve: 'lin' });
        break;
      }
      case 'scuttle': {
        // Chicken squawk laser
        this.wobble(d, t, 620, 0.12, 0.14, 30, 140, { type: 'sawtooth', cutoff: 2600 });
        this.sweep(d, t + 0.1, 1400, 700, 0.06, 0.1, { type: 'square', cutoff: 4000 });
        break;
      }
      case 'nullpoint': {
        // Weird void suck - rising reversed swell
        this.noiseBurst(d, t, 0.2, 0.12, { freq: 1400, type: 'bandpass', q: 4 });
        this.sweep(d, t, 180, 520, 0.2, 0.12, { type: 'sine', cutoff: 2600, attack: 0.12, curve: 'lin' });
        this.sweep(d, t, 900, 300, 0.18, 0.07, { type: 'triangle', cutoff: 3000 });
        break;
      }
      case 'stormlance': {
        // Electric zap chain
        for (let i = 0; i < 4; i++) {
          this.noiseBurst(d, t + i * 0.03, 0.02, 0.1, { freq: 5000 + i * 400, type: 'highpass' });
          this.sweep(d, t + i * 0.03, 2200 - i * 300, 3000, 0.03, 0.08, { type: 'square', cutoff: 6000 });
        }
        break;
      }
      case 'mirage': {
        // Mirror ping with echo shimmer
        this.voiceAt(d, t, 1760, 0.1, 0.12, { type: 'sine', cutoff: 5000 });
        this.voiceAt(d, t + 0.08, 2637, 0.1, 0.08, { type: 'sine', cutoff: 5200 });
        this.harpAt(d, t + 0.14, 3520, 0.05);
        break;
      }
      case 'harrier': {
        // Divebomb whoosh-bang
        this.sweep(d, t, 1600, 200, 0.22, 0.16, { type: 'sawtooth', cutoff: 2400, curve: 'lin' });
        this.noiseBurst(d, t + 0.2, 0.12, 0.2, { freq: 600, type: 'lowpass' });
        this.kickAt(d, t + 0.2, 0.24);
        break;
      }
      case 'minewright': {
        // Clunky popper
        this.sweep(d, t, 520, 900, 0.03, 0.13, { type: 'square', cutoff: 3000 });
        this.noiseBurst(d, t + 0.03, 0.05, 0.12, { freq: 400, type: 'lowpass', q: 1.5 });
        break;
      }
      case 'razorwing': {
        // Blender buzz slice
        this.wobble(d, t, 420, 0.12, 0.14, 55, 90, { type: 'sawtooth', cutoff: 3400 });
        this.noiseBurst(d, t + 0.08, 0.05, 0.12, { freq: 4200, type: 'bandpass', q: 2 });
        break;
      }
      case 'glacier': {
        // Icy crack
        this.noiseBurst(d, t, 0.05, 0.16, { freq: 6000, type: 'highpass', q: 0.8 });
        this.sweep(d, t, 3000, 5200, 0.05, 0.1, { type: 'triangle', cutoff: 6000 });
        this.harpAt(d, t + 0.03, 2794, 0.05);
        break;
      }
      case 'swarmlord': {
        // Bee buzz spit
        this.wobble(d, t, 320, 0.14, 0.13, 40, 60, { type: 'sawtooth', cutoff: 2400 });
        this.noiseBurst(d, t + 0.1, 0.04, 0.1, { freq: 1500, type: 'bandpass', q: 3 });
        break;
      }
      case 'pulsejet': {
        // Thump slap
        this.kickAt(d, t, 0.3);
        this.noiseBurst(d, t + 0.01, 0.05, 0.16, { freq: 1800, type: 'bandpass', q: 1.2 });
        break;
      }
      case 'railfox': {
        // Laser pointer charge-pew
        this.sweep(d, t, 400, 1600, 0.16, 0.1, { type: 'sawtooth', cutoff: 4000, attack: 0.06, curve: 'lin' });
        this.sweep(d, t + 0.16, 1900, 700, 0.06, 0.16, { type: 'square', cutoff: 5000 });
        break;
      }
      case 'sanguine': {
        // Mosquito sip / whine
        this.wobble(d, t, 1400, 0.18, 0.09, 18, 120, { type: 'sawtooth', cutoff: 4200 });
        this.sweep(d, t + 0.16, 900, 380, 0.06, 0.08, { type: 'sine', cutoff: 2600 });
        break;
      }
      default:
        this.fire('laser');
    }
  }

  taunt(shipId: ShipId, big = false): void {
    if (!this.sfxGain) return;
    const d = this.sfxGain;
    const theme = SHIP_THEMES[shipId];
    const root = theme?.roots[0] ?? 60;
    const t = this.now();
    // Cartoon "nyah nyah" two-note razz that follows the ship's key
    this.wobble(d, t, n2f(root + 12), big ? 0.2 : 0.12, big ? 0.16 : 0.11, 14, big ? 40 : 24, {
      type: 'sawtooth',
      cutoff: 2600 + (theme?.color ?? 0.5) * 1800,
    });
    this.sweep(d, t + (big ? 0.16 : 0.1), n2f(root + 19), n2f(root + 14), big ? 0.18 : 0.12, big ? 0.14 : 0.09, {
      type: 'square',
      cutoff: 3200,
      curve: 'lin',
    });
    if (big) {
      this.noiseBurst(d, t, 0.14, 0.1, { freq: 1500 });
      this.kickAt(d, t, 0.2);
    }
  }

  ability(kind: string): void {
    if (!this.sfxGain) return;
    const d = this.sfxGain;
    const t = this.now();
    switch (kind) {
      case 'nuke_flash': {
        // Cartoon giant kaboom - whistle in, then floor drops out
        this.sweep(d, t, 1800, 300, 0.3, 0.14, { type: 'triangle', cutoff: 3000 });
        this.noiseBurst(d, t + 0.28, 0.6, 0.42, { freq: 500, type: 'lowpass' });
        this.sweep(d, t + 0.28, 120, 40, 0.5, 0.36, { type: 'sine', cutoff: 400 });
        this.kickAt(d, t + 0.28, 0.5);
        break;
      }
      case 'teleport': {
        // Bloop-out zap
        this.noiseBurst(d, t, 0.16, 0.16, { freq: 2800, type: 'bandpass', q: 3 });
        this.sweep(d, t, 400, 2400, 0.16, 0.12, { type: 'sine', cutoff: 4000 });
        break;
      }
      case 'phase': {
        // Woozy phase in/out
        this.wobble(d, t, 200, 0.22, 0.12, 9, 60, { type: 'sawtooth', cutoff: 1400 });
        this.sweep(d, t, 400, 1800, 0.22, 0.09, { type: 'triangle', cutoff: 3500 });
        this.noiseBurst(d, t, 0.14, 0.1, { freq: 3000, type: 'highpass' });
        break;
      }
      case 'shield_flash': {
        // Springy bubble pop-up
        this.voiceAt(d, t, 280, 0.22, 0.14, { type: 'triangle', voices: 3, detune: 14 });
        this.sweep(d, t, 600, 1200, 0.14, 0.1, { type: 'sine', cutoff: 3600, curve: 'lin' });
        this.noiseBurst(d, t, 0.1, 0.08, { freq: 2200, type: 'bandpass' });
        break;
      }
      case 'nova': {
        // Big radial whoosh + rising sparkle burst
        this.noiseBurst(d, t, 0.3, 0.3, { freq: 1400 });
        for (let i = 0; i < 6; i++) {
          this.harpAt(d, t + i * 0.03, n2f(64 + i * 3), 0.08);
        }
        this.kickAt(d, t, 0.3);
        break;
      }
      case 'hive': {
        // Angry swarm release
        this.wobble(d, t, 200, 0.28, 0.13, 34, 70, { type: 'sawtooth', cutoff: 1600 });
        this.wobble(d, t + 0.04, 300, 0.24, 0.1, 46, 80, { type: 'sawtooth', cutoff: 2000 });
        break;
      }
      case 'wake': {
        // Quick water plop
        this.sweep(d, t, 900, 300, 0.09, 0.1, { type: 'sine', cutoff: 1800 });
        this.noiseBurst(d, t, 0.06, 0.08, { freq: 1200, type: 'bandpass' });
        break;
      }
      case 'panic': {
        // Comedy alarm wail
        this.sweep(d, t, 500, 900, 0.12, 0.13, { type: 'sawtooth', cutoff: 4000, curve: 'lin' });
        this.sweep(d, t + 0.12, 900, 500, 0.12, 0.13, { type: 'sawtooth', cutoff: 4000, curve: 'lin' });
        break;
      }
      case 'ring': {
        // Shiny bell ding
        this.voiceAt(d, t, 880, 0.2, 0.1, { type: 'sine', voices: 2, detune: 6 });
        this.harpAt(d, t, 1760, 0.07);
        break;
      }
      case 'spark': {
        // Snappy static crackle
        this.noiseBurst(d, t, 0.04, 0.14, { freq: 5500, type: 'highpass' });
        this.sweep(d, t, 3000, 4600, 0.03, 0.08, { type: 'square', cutoff: 6000 });
        break;
      }
      case 'cloak_pop': {
        // Bubble un-pop
        this.sweep(d, t, 1600, 500, 0.14, 0.11, { type: 'triangle', cutoff: 3600 });
        this.noiseBurst(d, t + 0.04, 0.03, 0.06, { freq: 3000, type: 'bandpass', q: 3 });
        break;
      }
      case 'pickup': {
        // Happy three-note grab
        this.sweep(d, t, 520, 560, 0.1, 0.1, { type: 'triangle', cutoff: 3000 });
        this.sweep(d, t + 0.05, 780, 820, 0.1, 0.09, { type: 'triangle', cutoff: 3600 });
        this.harpAt(d, t + 0.1, 1046, 0.08);
        break;
      }
      default:
        this.voiceAt(d, t, 480, 0.12, 0.1, { type: 'triangle', cutoff: 2400 });
    }
  }

  hit(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    // Cartoon bonk: woody thock + short low thwack
    this.noiseBurst(this.sfxGain, t, 0.05, 0.2, { freq: 2000, type: 'bandpass', q: 2 });
    this.sweep(this.sfxGain, t, 320, 120, 0.09, 0.16, { type: 'square', cutoff: 900 });
  }

  explosion(big = false): void {
    if (!this.sfxGain) return;
    const t = this.now();
    // Cartoon KABLOOEY: bright pop, rumble, and a sub drop
    this.noiseBurst(this.sfxGain, t, big ? 0.5 : 0.24, big ? 0.42 : 0.26, {
      freq: big ? 450 : 900,
      type: 'lowpass',
    });
    this.sweep(this.sfxGain, t, big ? 160 : 240, big ? 40 : 70, big ? 0.42 : 0.22, big ? 0.34 : 0.2, {
      type: 'sine',
      cutoff: 500,
    });
    this.noiseBurst(this.sfxGain, t, 0.03, big ? 0.2 : 0.12, { freq: 3500, type: 'highpass' });
    this.kickAt(this.sfxGain, t, big ? 0.4 : 0.24);
  }

  teleport(): void {
    this.ability('teleport');
  }

  ui(): void {
    if (!this.sfxGain) return;
    // Soft blip
    this.sweep(this.sfxGain, this.now(), 620, 760, 0.05, 0.07, { type: 'sine', cutoff: 3000, curve: 'lin' });
  }

  pick(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    // Confident up-boing
    this.sweep(this.sfxGain, t, 440, 660, 0.08, 0.1, { type: 'triangle', cutoff: 3000, curve: 'lin' });
    this.harpAt(this.sfxGain, t + 0.05, 880, 0.08);
  }

  /** Sealed scrap crate rattling before an unlock reveal. */
  crateRattle(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    for (let i = 0; i < 5; i++) {
      const when = t + i * 0.07;
      this.noiseBurst(this.sfxGain, when, 0.035, 0.08 + i * 0.01, {
        freq: 400 + i * 180,
        type: 'bandpass',
      });
      this.kickAt(this.sfxGain, when, 0.12);
    }
  }

  /** Big dopamine drop when a locked ship finally unpacks. */
  unlockFanfare(shipId: ShipId | null): void {
    if (!this.sfxGain) return;
    const t = this.now();
    this.noiseBurst(this.sfxGain, t, 0.08, 0.22, { freq: 900, type: 'bandpass' });
    this.kickAt(this.sfxGain, t, 0.45);
    this.sweep(this.sfxGain, t, 180, 720, 0.22, 0.16, {
      type: 'sawtooth',
      cutoff: 2800,
      curve: 'exp',
    });
    this.victorySong(shipId);
  }

  combo(n: number): void {
    if (!this.sfxGain) return;
    const midi = 60 + Math.min(24, n * 2);
    // Each hit climbs a step and gets brighter - dopamine ladder
    this.sweep(this.sfxGain, this.now(), n2f(midi) * 0.94, n2f(midi), 0.1, 0.09 + Math.min(0.06, n * 0.006), {
      type: 'triangle',
      cutoff: 3600,
      curve: 'lin',
    });
    if (n >= 5) {
      this.harpAt(this.sfxGain, this.now() + 0.04, n2f(midi + 7), 0.08);
    }
  }

  countdownBeep(final = false): void {
    if (!this.sfxGain) return;
    if (final) {
      // Stadium drop: low boom + rising brass bite
      this.kickAt(this.sfxGain, this.now(), 0.32);
      this.sweep(this.sfxGain, this.now(), n2f(48), n2f(84), 0.32, 0.2, {
        type: 'square',
        cutoff: 4200,
        curve: 'lin',
      });
      this.harpAt(this.sfxGain, this.now() + 0.04, n2f(84), 0.1);
      this.harpAt(this.sfxGain, this.now() + 0.09, n2f(88), 0.08);
      this.noiseBurst(this.sfxGain, this.now(), 0.18, 0.12, {
        freq: 1800,
        type: 'bandpass',
      });
    } else {
      // Heavy count hit - felt in the chest
      this.kickAt(this.sfxGain, this.now(), 0.2);
      this.voiceAt(this.sfxGain, this.now(), n2f(55), 0.14, 0.14, {
        type: 'triangle',
        cutoff: 2200,
      });
      this.voiceAt(this.sfxGain, this.now() + 0.03, n2f(67), 0.1, 0.1, {
        type: 'square',
        cutoff: 2600,
      });
    }
  }

  /** Opening sting when the broadcast card hits */
  introBroadcast(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    this.sweep(this.sfxGain, t, 80, 240, 0.45, 0.12, {
      type: 'sawtooth',
      cutoff: 1800,
      curve: 'lin',
    });
    this.kickAt(this.sfxGain, t + 0.05, 0.18);
    this.harpAt(this.sfxGain, t + 0.12, n2f(60), 0.1);
    this.harpAt(this.sfxGain, t + 0.18, n2f(67), 0.08);
    this.noiseBurst(this.sfxGain, t + 0.02, 0.22, 0.08, {
      freq: 900,
      type: 'lowpass',
    });
  }

  /** Matchup cards slam */
  introMatchup(): void {
    if (!this.sfxGain) return;
    const t = this.now();
    this.kickAt(this.sfxGain, t, 0.22);
    this.voiceAt(this.sfxGain, t, n2f(48), 0.16, 0.14, {
      type: 'sawtooth',
      cutoff: 1600,
    });
    this.sweep(this.sfxGain, t + 0.04, n2f(52), n2f(64), 0.2, 0.1, {
      type: 'square',
      cutoff: 2400,
      curve: 'lin',
    });
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
    // Tense riser into a stinger
    this.sweep(this.sfxGain, t, 200, 520, 0.24, 0.14, { type: 'sawtooth', cutoff: 2800, curve: 'lin' });
    this.voiceAt(this.sfxGain, t + 0.2, n2f(76), 0.16, 0.11, { type: 'triangle', cutoff: 3600 });
  }

  win(): void {
    this.victorySong(null);
  }

  /**
   * Happy victory jingle unique per ship.
   * Bright major arpeggios / silly fanfares that play on kill cam impact.
   */
  victorySong(shipId: ShipId | null): void {
    if (!this.sfxGain) return;
    const t = this.now();
    const theme = shipId ? SHIP_THEMES[shipId] : MENU_THEME;
    const root = (theme?.roots[0] ?? 60) + 12;
    // Per-ship happy motifs (degree offsets from root)
    const motifs: Record<ShipId, number[]> = {
      solhammer: [0, 4, 7, 12, 7, 12, 16],
      zephyr: [0, 7, 12, 16, 19, 16, 12],
      bulwark: [0, 0, 5, 7, 12, 7, 12],
      shade: [0, 3, 7, 12, 15, 12, 7],
      prism: [0, 4, 7, 11, 12, 16, 19, 24],
      brood: [0, 3, 7, 10, 12, 10, 15],
      cinder: [0, 4, 7, 12, 16, 12, 19],
      grappler: [0, 5, 7, 12, 17, 12, 7],
      scuttle: [0, 2, 4, 7, 9, 12, 16, 12],
      nullpoint: [0, 1, 4, 7, 12, 13, 16],
      stormlance: [0, 4, 7, 11, 12, 16, 19],
      mirage: [0, 3, 7, 8, 12, 15, 19],
      harrier: [0, 4, 7, 12, 16, 19, 24],
      minewright: [0, 3, 5, 7, 10, 12, 15],
      razorwing: [0, 4, 7, 11, 14, 16, 19, 23],
      glacier: [0, 2, 5, 7, 9, 12, 14],
      swarmlord: [0, 3, 7, 10, 12, 15, 19],
      pulsejet: [0, 5, 7, 12, 17, 19, 24],
      railfox: [0, 2, 7, 9, 12, 14, 19],
      sanguine: [0, 3, 7, 8, 12, 15, 20],
    };
    const motif = (shipId && motifs[shipId]) || [0, 4, 7, 12, 16, 19, 24];
    // Duck battle music briefly under the jingle
    if (this.musicGain) {
      const g = this.musicGain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.12, t + 0.05);
      g.linearRampToValueAtTime(0.36, t + 1.6);
    }
    motif.forEach((deg, i) => {
      const when = t + i * 0.085;
      this.leadAt(this.sfxGain!, when, n2f(root + deg), 0.22, 0.11);
      if (i % 2 === 0) this.harpAt(this.sfxGain!, when + 0.02, n2f(root + deg + 12), 0.06);
    });
    // Final happy chord stab
    const end = t + motif.length * 0.085;
    for (const deg of [0, 4, 7, 12]) {
      this.voiceAt(this.sfxGain, end, n2f(root + deg), 0.35, 0.07, {
        type: 'triangle',
        cutoff: 3200,
        voices: 1,
        attack: 0.01,
      });
    }
    this.kickAt(this.sfxGain, end, 0.18);
  }

  boutWin(streak = 1): void {
    if (!this.sfxGain) return;
    const boost = Math.min(4, streak);
    const t = this.now();
    this.leadAt(this.sfxGain, t, n2f(67 + boost), 0.16, 0.13);
    this.leadAt(this.sfxGain, t + 0.1, n2f(74 + boost), 0.2, 0.13);
    if (streak >= 3) {
      this.leadAt(this.sfxGain, t + 0.2, n2f(79), 0.24, 0.11);
      this.harpAt(this.sfxGain, t + 0.24, n2f(91), 0.08);
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

  // ---- Music (heroic addictive battle themes) ---------------------------

  private scheduleStep(when: number): void {
    if (!this.musicGain) return;
    const dest = this.musicGain;
    const th = this.theme;
    const s = this.step % 32;
    const beat = s % 8;
    const bar = Math.floor(this.step / 8) % 8;
    const phrase = Math.floor(this.step / 32) % 4;
    const root = th.roots[bar % th.roots.length]!;
    const heat = this.intensity;
    const lead = bar % 2 === 1 ? th.leadB : th.leadA;
    const STEP = this.stepDur;
    // Phrase arc: verse -> build -> chorus -> cool-off
    const arc = phrase === 0 ? 0.25 : phrase === 1 ? 0.55 : phrase === 2 ? 1 : 0.4;
    const drama = clamp01(heat * 0.45 + arc * 0.55 + th.drive * 0.15);
    const bright = th.color;
    const third = bright > 0.5 ? 4 : 3;
    const boom = 0.9 + th.drive * 0.25;

    // --- Kit: punchy kick, backbeat snare, ramping hats ---
    if (beat === 0) this.kickAt(dest, when, (0.4 + drama * 0.18) * boom);
    if (beat === 4 && drama > 0.3) this.kickAt(dest, when, (0.24 + drama * 0.16) * boom);
    // Syncopated kick push in the chorus
    if (phrase >= 2 && beat === 3) this.kickAt(dest, when, 0.16 + drama * 0.1);
    // Snare on 2 and 4
    if (beat === 2 || beat === 6) this.snareAt(dest, when, 0.22 + drama * 0.16);
    // Ghost snare fill at the end of build/chorus bars
    if (drama > 0.6 && bar % 4 === 3 && (beat === 5 || beat === 7)) {
      this.snareAt(dest, when, 0.1 + drama * 0.08);
    }
    // Hats get busier as it heats up
    const hatEvery = drama > 0.78 ? 1 : drama > 0.45 ? 2 : 4;
    if (s % hatEvery === 0) {
      const open = beat === 6 && drama > 0.5;
      this.hatAt(dest, when, 0.05 + drama * 0.06, open);
    }
    if (drama > 0.55 && beat % 2 === 1) this.hatAt(dest, when, 0.03 + drama * 0.03, false);
    // Timpani accents on the downbeat and the pre-chorus fill
    if (s === 0) this.timpAt(dest, when, 0.2 + drama * 0.14);
    if (phrase === 1 && s === 30) this.timpAt(dest, when, 0.34);

    // --- Driving bass on the even steps ---
    if (beat % 2 === 0 || (drama > 0.6 && beat === 7)) {
      const bOff = th.bassPat[s % th.bassPat.length]!;
      this.voiceAt(dest, when, n2f(root + bOff - 12), STEP * 1.25, 0.11 + drama * 0.06, {
        type: 'sawtooth',
        cutoff: 420 + drama * 520,
        q: 1.1,
        attack: 0.008,
        voices: 2,
        detune: 10,
      });
    }

    // --- Sustained pad bed on each bar + half-bar in the fuller sections ---
    if (beat === 0 || (phrase >= 1 && beat === 4)) {
      const padVol = 0.03 + drama * 0.03 + bright * 0.012;
      const padDur = STEP * (beat === 0 ? 4.2 : 3.2);
      this.padAt(dest, when, n2f(root + 12), padDur, padVol);
      this.padAt(dest, when + 0.015, n2f(root + 12 + third), padDur, padVol * 0.8);
      this.padAt(dest, when + 0.03, n2f(root + 19), padDur, padVol * 0.6);
    }

    // --- Off-beat chord stabs drive the chorus ---
    if (phrase >= 2 && (beat === 2 || beat === 6)) {
      const stabVol = 0.05 + drama * 0.04;
      const cut = 1800 + drama * 1400;
      for (const deg of [12, 12 + third, 19]) {
        this.voiceAt(dest, when, n2f(root + deg), STEP * 0.7, stabVol * (deg === 12 ? 1 : 0.78), {
          type: 'sawtooth',
          cutoff: cut,
          voices: 2,
          detune: 12,
          attack: 0.004,
        });
      }
    }

    // --- Catchy brass hook, articulated on the hook rhythm ---
    const leadDeg = lead[s % lead.length]!;
    const hookHit =
      beat === 0 ||
      beat === 2 ||
      beat === 4 ||
      beat === 6 ||
      (drama > 0.5 && (beat === 3 || beat === 7)) ||
      (phrase >= 2 && (beat === 1 || beat === 5));
    const leadOn = phrase === 3 ? beat === 0 || beat === 4 : hookHit;
    if (leadOn) {
      const len = 0.9 + (beat % 2 === 0 ? 0.3 : 0);
      this.leadAt(dest, when, n2f(root + leadDeg + 12), STEP * len, 0.09 + drama * 0.07);
      // Octave stack punches up the chorus
      if (phrase === 2 && beat % 4 === 0) {
        this.leadAt(dest, when, n2f(root + leadDeg + 24), STEP * len * 0.8, 0.04);
      }
    }

    // --- Harp / bell answers on the off-beats ---
    if (drama > 0.4 && (beat === 3 || beat === 7)) {
      const ans = lead[(s + 2) % lead.length]! + 12;
      this.harpAt(dest, when, n2f(root + ans), 0.04 + drama * 0.03);
    }
    // Rising fanfare run into the chorus
    if (phrase === 1 && s === 28) {
      const run = [0, third, 7, 12, 7 + third, 19];
      for (let i = 0; i < run.length; i++) {
        this.harpAt(dest, when + i * STEP * 0.4, n2f(root + 12 + run[i]!), 0.055);
      }
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
