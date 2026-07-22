import type { ShipId } from './types';

/** ISO week key like 2026-W30 */
export function seasonKey(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export type SeasonRank =
  | 'Bronze Scrap'
  | 'Silver Scrap'
  | 'Gold Scrap'
  | 'Platinum Orbit'
  | 'Diamond Yard'
  | 'Legend';

export type SeasonState = {
  version: 1;
  season: string;
  mmr: number;
  peakMmr: number;
  wins: number;
  losses: number;
  lastPlayAt: number;
};

const STORAGE = 'scrap-rumble-season-v1';

const TIERS: { name: SeasonRank; min: number }[] = [
  { name: 'Bronze Scrap', min: 0 },
  { name: 'Silver Scrap', min: 900 },
  { name: 'Gold Scrap', min: 1100 },
  { name: 'Platinum Orbit', min: 1300 },
  { name: 'Diamond Yard', min: 1500 },
  { name: 'Legend', min: 1700 },
];

function empty(season: string): SeasonState {
  return {
    version: 1,
    season,
    mmr: 1000,
    peakMmr: 1000,
    wins: 0,
    losses: 0,
    lastPlayAt: Date.now(),
  };
}

export function loadSeason(): SeasonState {
  const now = seasonKey();
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return empty(now);
    const parsed = JSON.parse(raw) as SeasonState;
    if (!parsed || parsed.version !== 1) return empty(now);
    // Soft decay when a new week starts
    if (parsed.season !== now) {
      const decayed = {
        ...parsed,
        season: now,
        mmr: Math.max(800, Math.round(parsed.mmr * 0.92)),
        wins: 0,
        losses: 0,
      };
      saveSeason(decayed);
      return decayed;
    }
    return parsed;
  } catch {
    return empty(now);
  }
}

export function saveSeason(s: SeasonState): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

export function rankForMmr(mmr: number): SeasonRank {
  let cur: SeasonRank = 'Bronze Scrap';
  for (const t of TIERS) if (mmr >= t.min) cur = t.name;
  return cur;
}

export function recordRankedResult(state: SeasonState, won: boolean): SeasonState {
  const delta = won ? 28 + Math.min(12, (1200 - state.mmr) * 0.02) : -(22 + Math.max(0, (state.mmr - 1000) * 0.015));
  const next: SeasonState = {
    ...state,
    mmr: Math.max(600, Math.min(2200, Math.round(state.mmr + delta))),
    wins: state.wins + (won ? 1 : 0),
    losses: state.losses + (won ? 0 : 1),
    lastPlayAt: Date.now(),
  };
  next.peakMmr = Math.max(next.peakMmr, next.mmr);
  saveSeason(next);
  return next;
}

export type WeeklyModeId =
  | 'sudden_death'
  | 'mirror'
  | 'random_fleets'
  | 'low_grav'
  | 'asteroid_storm'
  | 'cloak_fog'
  | 'boss_gauntlet';

export type WeeklyMode = {
  id: WeeklyModeId;
  name: string;
  blurb: string;
};

const WEEKLY_ROTATION: WeeklyMode[] = [
  {
    id: 'sudden_death',
    name: 'Sudden Death',
    blurb: 'Everyone starts at 40% hull. One mistake ends the bout.',
  },
  {
    id: 'mirror',
    name: 'Mirror Mayhem',
    blurb: 'Both fleets are identical. Pure pilot skill.',
  },
  {
    id: 'random_fleets',
    name: 'Junk Lottery',
    blurb: 'Random unlocked ships. No drafting. Survive the surprise.',
  },
  {
    id: 'low_grav',
    name: 'Whisper Orbit',
    blurb: 'Forced low gravity. Whip lanes for days.',
  },
  {
    id: 'asteroid_storm',
    name: 'Rock Opera',
    blurb: 'Asteroids spawn constantly. Pickups or pain.',
  },
  {
    id: 'cloak_fog',
    name: 'Neon Fog',
    blurb: 'Fog of war vibe - ships dim unless close or firing.',
  },
  {
    id: 'boss_gauntlet',
    name: 'Boss Brick Gauntlet',
    blurb: 'House fleet is all Boss Bricks. Bring dignity (or not).',
  },
];

export function weeklyModeFor(d = new Date()): WeeklyMode {
  const key = seasonKey(d);
  const n = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return WEEKLY_ROTATION[n % WEEKLY_ROTATION.length];
}

export function rankedShipBonus(_id: ShipId): number {
  return 0;
}
