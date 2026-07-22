import type { ShipId } from './types';
import type { PlayerCareer } from './playerStats';

export type TrailId = 'stock' | 'neon' | 'ember' | 'void' | 'gold';
export type TitleId =
  | 'junkrat'
  | 'scrapper'
  | 'hat_trick_hero'
  | 'orbit_bully'
  | 'yard_legend'
  | 'fog_runner'
  | 'season_climber';

export type CosmeticState = {
  version: 1;
  trail: TrailId;
  title: TitleId;
  unlockedTrails: TrailId[];
  unlockedTitles: TitleId[];
  victoryPose: boolean;
};

const STORAGE = 'scrap-rumble-cosmetics-v1';

export const TRAIL_COLORS: Record<TrailId, string> = {
  stock: '#8ab4d8',
  neon: '#00ffa8',
  ember: '#ff2e63',
  void: '#7c83ff',
  gold: '#ffd60a',
};

export const TITLE_LABEL: Record<TitleId, string> = {
  junkrat: 'Junkrat',
  scrapper: 'Scrapper',
  hat_trick_hero: 'Hat Trick Hero',
  orbit_bully: 'Orbit Bully',
  yard_legend: 'Yard Legend',
  fog_runner: 'Fog Runner',
  season_climber: 'Season Climber',
};

function empty(): CosmeticState {
  return {
    version: 1,
    trail: 'stock',
    title: 'junkrat',
    unlockedTrails: ['stock'],
    unlockedTitles: ['junkrat'],
    victoryPose: false,
  };
}

export function loadCosmetics(): CosmeticState {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as CosmeticState;
    if (!parsed || parsed.version !== 1) return empty();
    return { ...empty(), ...parsed, version: 1 };
  } catch {
    return empty();
  }
}

export function saveCosmetics(c: CosmeticState): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(c));
  } catch {
    /* quota */
  }
}

export function syncCosmeticUnlocks(
  c: CosmeticState,
  career: PlayerCareer,
  seasonMmr: number,
): CosmeticState {
  const next = { ...c, unlockedTrails: [...c.unlockedTrails], unlockedTitles: [...c.unlockedTitles] };
  const unlockTrail = (t: TrailId) => {
    if (!next.unlockedTrails.includes(t)) next.unlockedTrails.push(t);
  };
  const unlockTitle = (t: TitleId) => {
    if (!next.unlockedTitles.includes(t)) next.unlockedTitles.push(t);
  };

  if (career.wins >= 3) unlockTrail('neon');
  if (career.shipsKilled >= 25) unlockTrail('ember');
  if (career.bestStreak >= 5) unlockTrail('void');
  if (career.wins >= 25) unlockTrail('gold');

  if (career.wins >= 1) unlockTitle('scrapper');
  if (career.hatTricks >= 1) unlockTitle('hat_trick_hero');
  if (career.wins >= 10) unlockTitle('orbit_bully');
  if (career.wins >= 40) unlockTitle('yard_legend');
  if (career.bestStreak >= 3) unlockTitle('fog_runner');
  if (seasonMmr >= 1300) unlockTitle('season_climber');

  if (career.wins >= 5) next.victoryPose = true;

  saveCosmetics(next);
  return next;
}

export function setTrail(c: CosmeticState, trail: TrailId): CosmeticState {
  if (!c.unlockedTrails.includes(trail)) return c;
  const next = { ...c, trail };
  saveCosmetics(next);
  return next;
}

export function setTitle(c: CosmeticState, title: TitleId): CosmeticState {
  if (!c.unlockedTitles.includes(title)) return c;
  const next = { ...c, title };
  saveCosmetics(next);
  return next;
}

/** Signature one-liner when a ship lands the kill. */
export const KILL_SIGNATURE: Record<ShipId, string> = {
  solhammer: 'BIG RED BUTTON SAYS BYE',
  zephyr: 'BLINKED OUT OF YOUR LIFE',
  bulwark: 'FRIDGE DELIVERED',
  shade: 'STAB FROM NOWHERE',
  prism: 'PARTY FOULED',
  brood: 'ROOMMATES ATE WELL',
  cinder: 'FLOOR WAS LAVA',
  grappler: 'CONSENT REVOKED',
  scuttle: 'COWARD WINS AGAIN',
  nullpoint: 'BATTERY STOLEN',
  stormlance: 'GOSSIP CHAIN COMPLETE',
  mirage: 'WAS NEVER THERE',
  harrier: 'DIVE BOMB SIGNATURE',
  minewright: 'STEPPED ON REGRET',
  razorwing: 'HAIRCUT OF DOOM',
  glacier: 'COLD SHOULDER FATAL',
  swarmlord: 'UNPAID INTERNS DID IT',
  pulsejet: 'WHOOSH INTO HISTORY',
  railfox: 'RED DOT CONFIRMED',
  sanguine: 'JUICE BOX EMPTY',
};
