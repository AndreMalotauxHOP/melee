import type { ShipId } from './types';
import { SHIP_LIST } from './ships';

export type ShipBalanceRow = {
  fights: number;
  wins: number;
  losses: number;
  draws: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  deaths: number;
  fightTicks: number;
};

export type MatchupKey = string;

export type BalanceStats = {
  version: 1;
  matches: number;
  ships: Record<ShipId, ShipBalanceRow>;
  /** "attacker>defender" -> wins for attacker */
  matchups: Record<string, { fights: number; wins: number }>;
};

const STORAGE_KEY = 'scrap-rumble-balance-v1';

function emptyRow(): ShipBalanceRow {
  return {
    fights: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    damageDealt: 0,
    damageTaken: 0,
    kills: 0,
    deaths: 0,
    fightTicks: 0,
  };
}

function emptyStats(): BalanceStats {
  const ships = {} as Record<ShipId, ShipBalanceRow>;
  for (const s of SHIP_LIST) ships[s.id] = emptyRow();
  return { version: 1, matches: 0, ships, matchups: {} };
}

export function loadBalanceStats(): BalanceStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as BalanceStats;
    if (!parsed || parsed.version !== 1) return emptyStats();
    // Fill any new ships
    for (const s of SHIP_LIST) {
      if (!parsed.ships[s.id]) parsed.ships[s.id] = emptyRow();
    }
    return parsed;
  } catch {
    return emptyStats();
  }
}

export function saveBalanceStats(stats: BalanceStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    /* quota / private mode */
  }
}

export function resetBalanceStats(): BalanceStats {
  const stats = emptyStats();
  saveBalanceStats(stats);
  return stats;
}

export function matchupKey(a: ShipId, b: ShipId): string {
  return `${a}>${b}`;
}

/** Record one finished bout for balance analysis. */
export function recordBout(
  stats: BalanceStats,
  info: {
    ship0: ShipId;
    ship1: ShipId;
    winner: -1 | 0 | 1;
    damage0: number;
    damage1: number;
    durationSec: number;
  },
): BalanceStats {
  const { ship0, ship1, winner, damage0, damage1, durationSec } = info;
  const a = stats.ships[ship0] ?? emptyRow();
  const b = stats.ships[ship1] ?? emptyRow();
  stats.ships[ship0] = a;
  stats.ships[ship1] = b;

  stats.matches += 1;
  a.fights += 1;
  b.fights += 1;
  a.damageDealt += damage0;
  a.damageTaken += damage1;
  b.damageDealt += damage1;
  b.damageTaken += damage0;
  a.fightTicks += durationSec;
  b.fightTicks += durationSec;

  if (winner === -1) {
    a.draws += 1;
    b.draws += 1;
  } else if (winner === 0) {
    a.wins += 1;
    a.kills += 1;
    b.losses += 1;
    b.deaths += 1;
    const k = matchupKey(ship0, ship1);
    const m = stats.matchups[k] ?? { fights: 0, wins: 0 };
    m.fights += 1;
    m.wins += 1;
    stats.matchups[k] = m;
    const k2 = matchupKey(ship1, ship0);
    const m2 = stats.matchups[k2] ?? { fights: 0, wins: 0 };
    m2.fights += 1;
    stats.matchups[k2] = m2;
  } else {
    b.wins += 1;
    b.kills += 1;
    a.losses += 1;
    a.deaths += 1;
    const k = matchupKey(ship1, ship0);
    const m = stats.matchups[k] ?? { fights: 0, wins: 0 };
    m.fights += 1;
    m.wins += 1;
    stats.matchups[k] = m;
    const k2 = matchupKey(ship0, ship1);
    const m2 = stats.matchups[k2] ?? { fights: 0, wins: 0 };
    m2.fights += 1;
    stats.matchups[k2] = m2;
  }

  saveBalanceStats(stats);
  return stats;
}

export function winRate(row: ShipBalanceRow): number {
  if (row.fights <= 0) return 0;
  return row.wins / row.fights;
}

export function rankedShips(stats: BalanceStats): {
  id: ShipId;
  row: ShipBalanceRow;
  rate: number;
}[] {
  return SHIP_LIST.map((s) => {
    const row = stats.ships[s.id] ?? emptyRow();
    return { id: s.id, row, rate: winRate(row) };
  }).sort((a, b) => {
    if (b.row.fights !== a.row.fights && (a.row.fights < 3 || b.row.fights < 3)) {
      return b.row.fights - a.row.fights;
    }
    return b.rate - a.rate || b.row.fights - a.row.fights;
  });
}

/** One-line matchup callout from CPU farm data, or null if sample too small. */
export function matchupCallout(
  stats: BalanceStats,
  a: ShipId,
  b: ShipId,
): string | null {
  const k = matchupKey(a, b);
  const m = stats.matchups[k];
  if (!m || m.fights < 5) return null;
  const rate = m.wins / m.fights;
  const nameA = SHIP_LIST.find((s) => s.id === a)?.name ?? a;
  const nameB = SHIP_LIST.find((s) => s.id === b)?.name ?? b;
  if (rate >= 0.58) {
    return `${nameA} chews ${nameB} (${Math.round(rate * 100)}% · n=${m.fights})`;
  }
  if (rate <= 0.42) {
    return `${nameA} struggles vs ${nameB} (${Math.round(rate * 100)}% · n=${m.fights})`;
  }
  return `${nameA} vs ${nameB} is a coin flip (${Math.round(rate * 100)}% · n=${m.fights})`;
}

/** Expected underdog if CPU rates disagree sharply. */
export function upsetUnderdog(
  stats: BalanceStats,
  a: ShipId,
  b: ShipId,
): 0 | 1 | null {
  const ra = winRate(stats.ships[a] ?? emptyRow());
  const rb = winRate(stats.ships[b] ?? emptyRow());
  const na = stats.ships[a]?.fights ?? 0;
  const nb = stats.ships[b]?.fights ?? 0;
  if (na < 5 || nb < 5) return null;
  if (ra + 0.12 < rb) return 0;
  if (rb + 0.12 < ra) return 1;
  return null;
}

export function balanceReport(stats: BalanceStats): string {
  const ranked = rankedShips(stats).filter((r) => r.row.fights > 0);
  if (ranked.length === 0) return 'No CPU matches recorded yet.';
  const lines = [
    `Matches: ${stats.matches}`,
    '',
    'Ship win rates (CPU data):',
  ];
  for (const r of ranked) {
    const avgDmg =
      r.row.fights > 0 ? Math.round(r.row.damageDealt / r.row.fights) : 0;
    const avgDur =
      r.row.fights > 0 ? (r.row.fightTicks / r.row.fights).toFixed(1) : '0';
    lines.push(
      `${r.id.padEnd(12)} ${(r.rate * 100).toFixed(0).padStart(3)}%  W${r.row.wins}/L${r.row.losses}/D${r.row.draws}  n=${r.row.fights}  dmg/f=${avgDmg}  t=${avgDur}s`,
    );
  }
  return lines.join('\n');
}
