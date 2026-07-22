import type { ShipId } from './types';

export type ScrapRank =
  | 'junkrat'
  | 'scrapper'
  | 'yard dog'
  | 'scrap ace'
  | 'orbit bully'
  | 'yard legend';

export interface ClimbState {
  version: 1;
  wins: number;
  losses: number;
  xp: number;
  bestStreak: number;
  /** Campaign chapter cleared (0 = none, max = HOUSE_CHAPTERS.length) */
  chapter: number;
  tutorialDone: boolean;
}

const STORAGE_KEY = 'scrap-rumble-climb-v1';

export const RANK_LADDER: { id: ScrapRank; xp: number; title: string }[] = [
  { id: 'junkrat', xp: 0, title: 'Junkrat' },
  { id: 'scrapper', xp: 40, title: 'Scrapper' },
  { id: 'yard dog', xp: 100, title: 'Yard Dog' },
  { id: 'scrap ace', xp: 200, title: 'Scrap Ace' },
  { id: 'orbit bully', xp: 360, title: 'Orbit Bully' },
  { id: 'yard legend', xp: 560, title: 'Yard Legend' },
];

/** House fleets for Scrapyard Climb campaign. */
export const HOUSE_CHAPTERS: {
  name: string;
  blurb: string;
  fleet: ShipId[];
}[] = [
  {
    name: 'The Soft Open',
    blurb: 'Yard interns. They will still try to kill you.',
    fleet: ['zephyr', 'scuttle', 'cinder', 'mirage', 'razorwing', 'pulsejet'],
  },
  {
    name: 'Fridge Division',
    blurb: 'Heavy metal with feelings.',
    fleet: ['bulwark', 'glacier', 'solhammer', 'minewright', 'brood', 'harrier'],
  },
  {
    name: 'Petty Hours',
    blurb: 'Cloaks, drains, and bad manners.',
    fleet: ['shade', 'nullpoint', 'grappler', 'sanguine', 'mirage', 'stormlance'],
  },
  {
    name: 'Party Fouls',
    blurb: 'Sparkles, bees, and litter.',
    fleet: ['prism', 'swarmlord', 'minewright', 'cinder', 'brood', 'pulsejet'],
  },
  {
    name: 'Long Range Regret',
    blurb: 'One shot. Many feelings.',
    fleet: ['railfox', 'stormlance', 'harrier', 'prism', 'glacier', 'solhammer'],
  },
  {
    name: 'The House Fleet',
    blurb: 'Orbit\'s meanest scrap heap. Dignity optional.',
    fleet: ['solhammer', 'shade', 'brood', 'railfox', 'glacier', 'swarmlord'],
  },
];

function emptyClimb(): ClimbState {
  return {
    version: 1,
    wins: 0,
    losses: 0,
    xp: 0,
    bestStreak: 0,
    chapter: 0,
    tutorialDone: false,
  };
}

export function loadClimb(): ClimbState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyClimb();
    const parsed = JSON.parse(raw) as ClimbState;
    if (!parsed || parsed.version !== 1) return emptyClimb();
    return { ...emptyClimb(), ...parsed, version: 1 };
  } catch {
    return emptyClimb();
  }
}

export function saveClimb(state: ClimbState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function rankForXp(xp: number): (typeof RANK_LADDER)[number] {
  let cur = RANK_LADDER[0];
  for (const r of RANK_LADDER) {
    if (xp >= r.xp) cur = r;
  }
  return cur;
}

export function nextRank(xp: number): (typeof RANK_LADDER)[number] | null {
  const cur = rankForXp(xp);
  const idx = RANK_LADDER.findIndex((r) => r.id === cur.id);
  return RANK_LADDER[idx + 1] ?? null;
}

export function recordSeriesResult(
  state: ClimbState,
  won: boolean,
  streak: number,
): ClimbState {
  const next = { ...state };
  if (won) {
    next.wins += 1;
    next.xp += 28 + Math.min(40, streak * 6);
    if (streak > next.bestStreak) next.bestStreak = streak;
  } else {
    next.losses += 1;
    next.xp += 8;
  }
  saveClimb(next);
  return next;
}

export function clearChapter(state: ClimbState, chapterIndex: number): ClimbState {
  const next = {
    ...state,
    chapter: Math.max(state.chapter, chapterIndex + 1),
    xp: state.xp + 45,
  };
  saveClimb(next);
  return next;
}

export function markTutorialDone(state: ClimbState): ClimbState {
  const next = { ...state, tutorialDone: true, xp: state.xp + 15 };
  saveClimb(next);
  return next;
}

/** Prefer a slow fridge so the first bout teaches movement. */
export function tutorialYouFleet(): ShipId[] {
  return ['zephyr', 'scuttle', 'cinder', 'bulwark', 'razorwing', 'solhammer'];
}

export function tutorialCpuFleet(): ShipId[] {
  return ['bulwark', 'glacier', 'minewright', 'solhammer', 'brood', 'harrier'];
}
