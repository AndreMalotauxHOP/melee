import type { ShipId } from './types';
import { SHIPS } from './ships';
import type { PlayerCareer } from './playerStats';

/** Always available on day one. */
export const STARTER_SHIPS: ShipId[] = [
  'zephyr',
  'bulwark',
  'solhammer',
  'cinder',
  'scuttle',
  'razorwing',
];

export type AchievementId =
  | 'wins_3'
  | 'wins_10'
  | 'wins_25'
  | 'series_streak_3'
  | 'series_streak_5'
  | 'hat_trick'
  | 'unhinged'
  | 'kills_10'
  | 'kills_25'
  | 'kills_40'
  | 'kills_75'
  | 'played_5'
  | 'played_15'
  | 'hat_tricks_3';

export type AchievementDef = {
  id: AchievementId;
  title: string;
  desc: string;
  unlocks: ShipId;
  done: (p: UnlockProgress) => boolean;
  progress: (p: UnlockProgress) => { cur: number; need: number };
};

/** Lifetime counters used for unlock gates. */
export type UnlockProgress = {
  wins: number;
  played: number;
  bestStreak: number;
  bestSeriesStreak: number;
  shipsKilled: number;
  hatTricks: number;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'wins_3',
    title: 'First Blood Money',
    desc: 'Win 3 fleet series',
    unlocks: 'shade',
    done: (p) => p.wins >= 3,
    progress: (p) => ({ cur: p.wins, need: 3 }),
  },
  {
    id: 'wins_10',
    title: 'Yard Regular',
    desc: 'Win 10 fleet series',
    unlocks: 'prism',
    done: (p) => p.wins >= 10,
    progress: (p) => ({ cur: p.wins, need: 10 }),
  },
  {
    id: 'wins_25',
    title: 'Orbit Bully',
    desc: 'Win 25 fleet series',
    unlocks: 'railfox',
    done: (p) => p.wins >= 25,
    progress: (p) => ({ cur: p.wins, need: 25 }),
  },
  {
    id: 'series_streak_3',
    title: 'On a Tear',
    desc: 'Win 3 series in a row',
    unlocks: 'grappler',
    done: (p) => p.bestSeriesStreak >= 3,
    progress: (p) => ({ cur: p.bestSeriesStreak, need: 3 }),
  },
  {
    id: 'series_streak_5',
    title: 'Unstoppable Scrap',
    desc: 'Win 5 series in a row',
    unlocks: 'swarmlord',
    done: (p) => p.bestSeriesStreak >= 5,
    progress: (p) => ({ cur: p.bestSeriesStreak, need: 5 }),
  },
  {
    id: 'hat_trick',
    title: 'Hat Trick of Chaos',
    desc: 'Win 3 bouts in a row in one series',
    unlocks: 'mirage',
    done: (p) => p.bestStreak >= 3 || p.hatTricks >= 1,
    progress: (p) => ({ cur: Math.max(p.bestStreak, p.hatTricks > 0 ? 3 : 0), need: 3 }),
  },
  {
    id: 'unhinged',
    title: 'Unhinged',
    desc: 'Win 5 bouts in a row in one series',
    unlocks: 'nullpoint',
    done: (p) => p.bestStreak >= 5,
    progress: (p) => ({ cur: p.bestStreak, need: 5 }),
  },
  {
    id: 'kills_10',
    title: 'Scrap Apprentice',
    desc: 'Destroy 10 ships',
    unlocks: 'brood',
    done: (p) => p.shipsKilled >= 10,
    progress: (p) => ({ cur: p.shipsKilled, need: 10 }),
  },
  {
    id: 'kills_25',
    title: 'Wrecking Habit',
    desc: 'Destroy 25 ships',
    unlocks: 'harrier',
    done: (p) => p.shipsKilled >= 25,
    progress: (p) => ({ cur: p.shipsKilled, need: 25 }),
  },
  {
    id: 'kills_40',
    title: 'Forty Scrap Heaps',
    desc: 'Destroy 40 ships',
    unlocks: 'minewright',
    done: (p) => p.shipsKilled >= 40,
    progress: (p) => ({ cur: p.shipsKilled, need: 40 }),
  },
  {
    id: 'kills_75',
    title: 'Mass Extinction',
    desc: 'Destroy 75 ships',
    unlocks: 'sanguine',
    done: (p) => p.shipsKilled >= 75,
    progress: (p) => ({ cur: p.shipsKilled, need: 75 }),
  },
  {
    id: 'played_5',
    title: 'Hangar Rat',
    desc: 'Finish 5 fleet series',
    unlocks: 'stormlance',
    done: (p) => p.played >= 5,
    progress: (p) => ({ cur: p.played, need: 5 }),
  },
  {
    id: 'played_15',
    title: 'Season Ticket',
    desc: 'Finish 15 fleet series',
    unlocks: 'glacier',
    done: (p) => p.played >= 15,
    progress: (p) => ({ cur: p.played, need: 15 }),
  },
  {
    id: 'hat_tricks_3',
    title: 'Chaos Collector',
    desc: 'Land 3 hat tricks (3-bout streaks)',
    unlocks: 'pulsejet',
    done: (p) => p.hatTricks >= 3,
    progress: (p) => ({ cur: p.hatTricks, need: 3 }),
  },
];

export function progressFromCareer(career: PlayerCareer): UnlockProgress {
  return {
    wins: career.wins,
    played: career.played,
    bestStreak: career.bestStreak,
    bestSeriesStreak: career.bestSeriesStreak,
    shipsKilled: career.shipsKilled ?? 0,
    hatTricks: career.hatTricks ?? 0,
  };
}

export function isStarter(id: ShipId): boolean {
  return STARTER_SHIPS.includes(id);
}

export function achievementForShip(id: ShipId): AchievementDef | null {
  if (isStarter(id)) return null;
  return ACHIEVEMENTS.find((a) => a.unlocks === id) ?? null;
}

export function isShipUnlocked(id: ShipId, progress: UnlockProgress): boolean {
  if (isStarter(id)) return true;
  const ach = achievementForShip(id);
  if (!ach) return true; // safety: unknown ships free
  return ach.done(progress);
}

export function unlockedShips(progress: UnlockProgress): ShipId[] {
  return (Object.keys(SHIPS) as ShipId[]).filter((id) =>
    isShipUnlocked(id, progress),
  );
}

export function lockedAchievements(progress: UnlockProgress): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !a.done(progress));
}

/** Ships that just crossed the unlock line. */
export function freshUnlocks(
  before: UnlockProgress,
  after: UnlockProgress,
): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !a.done(before) && a.done(after));
}

export function unlockHint(id: ShipId, progress: UnlockProgress): string {
  const ach = achievementForShip(id);
  if (!ach) return 'Locked';
  const { cur, need } = ach.progress(progress);
  return `${ach.desc} (${Math.min(cur, need)}/${need})`;
}
