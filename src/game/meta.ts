import type { ShipId } from './types';
import { SHIPS } from './ships';
import type { BalanceStats } from './balanceStats';
import { rankedShips, winRate } from './balanceStats';

export type MapRuleId = 'standard' | 'asteroid_storm' | 'cloak_fog' | 'scrap_maze' | 'low_grav';

export type MapRules = {
  id: MapRuleId;
  label: string;
  /** Extra asteroid spawn rate multiplier */
  asteroidMul: number;
  /** Dim distant ships (fog) */
  cloakFog: boolean;
  /** Extra scrap zones */
  scrapHeavy: boolean;
  /** Force gravity tier */
  forceGravity?: 0 | 1 | 2;
  /** Start HP fraction */
  startHpFrac: number;
};

export function mapRulesFromSeed(
  seed: number,
  weeklyHint?: string | null,
): MapRules {
  if (weeklyHint === 'asteroid_storm') {
    return {
      id: 'asteroid_storm',
      label: 'ROCK OPERA',
      asteroidMul: 3.2,
      cloakFog: false,
      scrapHeavy: false,
      startHpFrac: 1,
    };
  }
  if (weeklyHint === 'cloak_fog') {
    return {
      id: 'cloak_fog',
      label: 'NEON FOG',
      asteroidMul: 1,
      cloakFog: true,
      scrapHeavy: false,
      startHpFrac: 1,
    };
  }
  if (weeklyHint === 'low_grav') {
    return {
      id: 'low_grav',
      label: 'WHISPER ORBIT',
      asteroidMul: 1,
      cloakFog: false,
      scrapHeavy: false,
      forceGravity: 0,
      startHpFrac: 1,
    };
  }
  if (weeklyHint === 'sudden_death') {
    return {
      id: 'standard',
      label: 'SUDDEN DEATH',
      asteroidMul: 1,
      cloakFog: false,
      scrapHeavy: false,
      startHpFrac: 0.4,
    };
  }

  const roll = ((seed >>> 0) % 1000) / 1000;
  if (roll < 0.18) {
    return {
      id: 'asteroid_storm',
      label: 'ASTEROID STORM',
      asteroidMul: 2.4,
      cloakFog: false,
      scrapHeavy: false,
      startHpFrac: 1,
    };
  }
  if (roll < 0.32) {
    return {
      id: 'cloak_fog',
      label: 'NEON FOG',
      asteroidMul: 0.8,
      cloakFog: true,
      scrapHeavy: false,
      startHpFrac: 1,
    };
  }
  if (roll < 0.45) {
    return {
      id: 'scrap_maze',
      label: 'SCRAP MAZE',
      asteroidMul: 1,
      cloakFog: false,
      scrapHeavy: true,
      startHpFrac: 1,
    };
  }
  return {
    id: 'standard',
    label: 'STANDARD YARD',
    asteroidMul: 1,
    cloakFog: false,
    scrapHeavy: false,
    startHpFrac: 1,
  };
}

/** Auto patch-note style pulse from balance lab. */
export function balancePulse(stats: BalanceStats): string[] {
  const ranked = rankedShips(stats).filter((r) => r.row.fights >= 8);
  if (ranked.length < 4) {
    return ['Balance pulse warming up - farm more CPU vs CPU bouts.'];
  }
  const hot = ranked.filter((r) => winRate(r.row) >= 0.58).slice(0, 3);
  const cold = ranked.filter((r) => winRate(r.row) <= 0.42).slice(-3).reverse();
  const lines: string[] = [`Pulse from ${stats.matches} CPU bouts:`];
  for (const h of hot) {
    lines.push(
      `HOT  ${SHIPS[h.id as ShipId].name} ${(winRate(h.row) * 100).toFixed(0)}% (n=${h.row.fights})`,
    );
  }
  for (const c of cold) {
    lines.push(
      `COLD ${SHIPS[c.id as ShipId].name} ${(winRate(c.row) * 100).toFixed(0)}% (n=${c.row.fights})`,
    );
  }
  if (hot.length) {
    lines.push(`Watchlist: nerf fantasy for ${SHIPS[hot[0].id as ShipId].name} if players pile on.`);
  }
  if (cold.length) {
    lines.push(`Buff candidate: ${SHIPS[cold[0].id as ShipId].name} needs a clearer win verb.`);
  }
  return lines;
}
