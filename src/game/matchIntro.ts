/** Broadcast-style pre-fight intro - biggest match in the yard. */

export const MATCH_INTRO_DURATION = 5.55;

export type MatchIntroMeta = {
  eventTitle: string;
  venue: string;
  leftName: string;
  rightName: string;
  leftColor: string;
  rightColor: string;
  leftTag?: string;
  rightTag?: string;
  stakeLine?: string;
};

export type MatchIntroPhase = 'broadcast' | 'matchup' | 'count' | 'drop';

export type MatchIntroFrame = {
  phase: MatchIntroPhase;
  /** 0..1 within current phase */
  phaseT: number;
  elapsed: number;
  /** 0..1 overall */
  progress: number;
  headline: string;
  subline: string;
  count: 3 | 2 | 1 | null;
  dropLabel: string | null;
  leftName: string;
  rightName: string;
  leftColor: string;
  rightColor: string;
  leftTag: string;
  rightTag: string;
  stakeLine: string;
  venue: string;
  eventTitle: string;
  /** Beat punch 0..1 for camera / scale */
  pulse: number;
  letterbox: number;
  flash: number;
  /** Slam-in for matchup cards 0..1 */
  cardSlam: number;
};

const PHASES: { id: MatchIntroPhase; start: number; end: number }[] = [
  { id: 'broadcast', start: 0, end: 0.95 },
  { id: 'matchup', start: 0.95, end: 2.25 },
  { id: 'count', start: 2.25, end: 5.05 },
  { id: 'drop', start: 5.05, end: MATCH_INTRO_DURATION },
];

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function matchIntroFrame(
  elapsed: number,
  meta: MatchIntroMeta,
): MatchIntroFrame {
  const t = Math.max(0, Math.min(MATCH_INTRO_DURATION, elapsed));
  const progress = t / MATCH_INTRO_DURATION;
  const phaseDef =
    PHASES.find((p) => t >= p.start && t < p.end) ?? PHASES[PHASES.length - 1]!;
  const phaseLen = Math.max(0.001, phaseDef.end - phaseDef.start);
  const phaseT = clamp01((t - phaseDef.start) / phaseLen);
  const phase = phaseDef.id;

  let count: 3 | 2 | 1 | null = null;
  let pulse = 0;
  let headline = '';
  let subline = '';
  let dropLabel: string | null = null;
  let letterbox = 0;
  let flash = 0;
  let cardSlam = 0;

  if (phase === 'broadcast') {
    letterbox = easeOutCubic(clamp01(phaseT * 1.6));
    flash = phaseT < 0.12 ? 1 - phaseT / 0.12 : 0;
    headline = 'SCRAP RUMBLE';
    subline = meta.venue;
    pulse = Math.sin(phaseT * Math.PI) * 0.35;
  } else if (phase === 'matchup') {
    letterbox = 1;
    cardSlam = easeOutBack(clamp01(phaseT * 1.35));
    flash = phaseT < 0.08 ? 0.7 * (1 - phaseT / 0.08) : 0;
    headline = meta.eventTitle;
    subline = meta.stakeLine || 'WINNER STAYS · DIGNITY LEAVES';
    pulse = 0.25 + Math.sin(phaseT * Math.PI) * 0.2;
  } else if (phase === 'count') {
    letterbox = 0.85 + 0.15 * (1 - phaseT);
    // 3 beats across count phase
    const beat = phaseT * 3;
    const beatIdx = Math.min(2, Math.floor(beat));
    const beatT = beat - beatIdx;
    count = (3 - beatIdx) as 3 | 2 | 1;
    headline = String(count);
    subline = count === 3 ? 'WORLD FEEDS ARE LIVE' : count === 2 ? 'HOLD YOUR THRUSTERS' : 'ONE MORE HEARTBEAT';
    pulse = easeOutCubic(1 - beatT);
    flash = beatT < 0.12 ? (1 - beatT / 0.12) * 0.55 : 0;
    cardSlam = Math.max(0, 1 - phaseT * 1.4);
  } else {
    letterbox = Math.max(0, 1 - phaseT * 1.8);
    dropLabel = 'FIGHT';
    headline = 'FIGHT';
    subline = 'MAKE IT UGLY';
    pulse = easeOutCubic(1 - phaseT);
    flash = phaseT < 0.25 ? 1 - phaseT / 0.25 : 0;
    cardSlam = 0;
  }

  return {
    phase,
    phaseT,
    elapsed: t,
    progress,
    headline,
    subline,
    count,
    dropLabel,
    leftName: meta.leftName,
    rightName: meta.rightName,
    leftColor: meta.leftColor,
    rightColor: meta.rightColor,
    leftTag: meta.leftTag ?? '',
    rightTag: meta.rightTag ?? '',
    stakeLine: meta.stakeLine ?? '',
    venue: meta.venue,
    eventTitle: meta.eventTitle,
    pulse,
    letterbox,
    flash,
    cardSlam,
  };
}

/** Which audio cue to fire when crossing into a new beat (null = none). */
export function matchIntroCue(
  prevElapsed: number,
  nextElapsed: number,
): 'broadcast' | 'matchup' | 'count3' | 'count2' | 'count1' | 'drop' | null {
  const prev = matchIntroFrame(prevElapsed, DUMMY_META);
  const next = matchIntroFrame(nextElapsed, DUMMY_META);
  if (prev.phase !== next.phase) {
    if (next.phase === 'broadcast') return 'broadcast';
    if (next.phase === 'matchup') return 'matchup';
    if (next.phase === 'drop') return 'drop';
    if (next.phase === 'count') return 'count3';
  }
  if (next.phase === 'count' && prev.count !== next.count) {
    if (next.count === 2) return 'count2';
    if (next.count === 1) return 'count1';
  }
  return null;
}

const DUMMY_META: MatchIntroMeta = {
  eventTitle: '',
  venue: '',
  leftName: '',
  rightName: '',
  leftColor: '#fff',
  rightColor: '#fff',
};
