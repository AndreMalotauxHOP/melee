/** Local career stats + sync to the shared Yard Hall leaderboard. */

export type PlayerCareer = {
  version: 1;
  playerId: string;
  name: string;
  /** Fleet series started (human modes only) */
  played: number;
  wins: number;
  losses: number;
  /** Best bout win streak in a series */
  bestStreak: number;
  /** Current consecutive series wins */
  seriesStreak: number;
  /** Best consecutive series wins */
  bestSeriesStreak: number;
  /** Lifetime ships destroyed by this pilot */
  shipsKilled: number;
  /** Times a 3+ bout streak was landed */
  hatTricks: number;
  updatedAt: number;
};

export type LeaderboardRow = {
  playerId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  bestStreak: number;
  seriesStreak: number;
  bestSeriesStreak: number;
  updatedAt: number;
};

const STORAGE_KEY = 'scrap-rumble-player-v1';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyCareer(name = 'Scrap Pilot'): PlayerCareer {
  return {
    version: 1,
    playerId: newId(),
    name: sanitizeName(name),
    played: 0,
    wins: 0,
    losses: 0,
    bestStreak: 0,
    seriesStreak: 0,
    bestSeriesStreak: 0,
    shipsKilled: 0,
    hatTricks: 0,
    updatedAt: Date.now(),
  };
}

export function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[^\w\s\-'.]/g, '').trim().slice(0, 18);
  return cleaned || 'Scrap Pilot';
}

export function loadCareer(): PlayerCareer {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyCareer();
    const parsed = JSON.parse(raw) as PlayerCareer;
    if (!parsed || parsed.version !== 1 || !parsed.playerId) return emptyCareer();
    return {
      ...emptyCareer(parsed.name),
      ...parsed,
      name: sanitizeName(parsed.name || 'Scrap Pilot'),
      shipsKilled: parsed.shipsKilled ?? 0,
      hatTricks: parsed.hatTricks ?? 0,
      version: 1,
    };
  } catch {
    return emptyCareer();
  }
}

export function saveCareer(career: PlayerCareer): void {
  try {
    career.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(career));
  } catch {
    /* quota */
  }
}

export function setPlayerName(career: PlayerCareer, name: string): PlayerCareer {
  const next = { ...career, name: sanitizeName(name) };
  saveCareer(next);
  return next;
}

/** Record one finished fleet series for the local pilot. */
export function recordSeriesCareer(
  career: PlayerCareer,
  won: boolean,
  boutBestStreak: number,
  extras?: { shipsKilledDelta?: number; hatTrickThisSeries?: boolean },
): PlayerCareer {
  const next: PlayerCareer = {
    ...career,
    played: career.played + 1,
    wins: career.wins + (won ? 1 : 0),
    losses: career.losses + (won ? 0 : 1),
    bestStreak: Math.max(career.bestStreak, boutBestStreak),
    seriesStreak: won ? career.seriesStreak + 1 : 0,
    bestSeriesStreak: career.bestSeriesStreak,
    shipsKilled: career.shipsKilled + Math.max(0, extras?.shipsKilledDelta ?? 0),
    hatTricks: career.hatTricks + (extras?.hatTrickThisSeries ? 1 : 0),
  };
  if (won) {
    next.bestSeriesStreak = Math.max(next.bestSeriesStreak, next.seriesStreak);
  }
  saveCareer(next);
  return next;
}

/** Mid-series progress (kills / hat tricks) without finishing a series. */
export function recordBoutCareerProgress(
  career: PlayerCareer,
  info: { kill?: boolean; boutStreak?: number },
): PlayerCareer {
  const next: PlayerCareer = { ...career };
  if (info.kill) next.shipsKilled += 1;
  if (info.boutStreak !== undefined) {
    next.bestStreak = Math.max(next.bestStreak, info.boutStreak);
    if (info.boutStreak === 3) next.hatTricks += 1;
  }
  saveCareer(next);
  return next;
}

export function winRate(career: Pick<PlayerCareer, 'played' | 'wins'>): number {
  if (career.played <= 0) return 0;
  return career.wins / career.played;
}

function apiRoot(): string {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  // Vite dev: API lives on the game server (:3080), client on :5173
  if (import.meta.env.DEV) {
    return `http://${location.hostname || 'localhost'}:3080`;
  }
  return '';
}

/** Push local career to the shared board (best-effort). */
export async function syncCareerToServer(career: PlayerCareer): Promise<void> {
  try {
    await fetch(`${apiRoot()}/api/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: career.playerId,
        name: career.name,
        played: career.played,
        wins: career.wins,
        losses: career.losses,
        bestStreak: career.bestStreak,
        seriesStreak: career.seriesStreak,
        bestSeriesStreak: career.bestSeriesStreak,
        updatedAt: career.updatedAt,
      }),
    });
  } catch {
    /* offline / local vite without API */
  }
}

/** Fetch every pilot who has synced from any client. */
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const res = await fetch(`${apiRoot()}/api/players`);
    if (!res.ok) return [];
    const data = (await res.json()) as { players?: LeaderboardRow[] };
    return Array.isArray(data.players) ? data.players : [];
  } catch {
    return [];
  }
}
