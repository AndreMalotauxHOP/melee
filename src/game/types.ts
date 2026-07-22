export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Visible canvas / HUD size (SC2 "full screen" frame) */
export const VIEW_W = 1280;
export const VIEW_H = 720;
/**
 * Combat world - ~4x the zoomed-out frame, like classic Super Melee.
 * Camera tracks the ships; the planet sits in this world and is not always on-screen center.
 */
export const ARENA_W = 2560;
export const ARENA_H = 1440;
export const PLANET_X = ARENA_W / 2;
export const PLANET_Y = ARENA_H / 2;
/** Default radius - actual value lives on SimState per match */
export const PLANET_R = 48;
/** Default gravity - actual value lives on SimState per match */
export const GRAVITY = 9000;
export const MAX_SPEED = 420;
export const WRAP_MARGIN = 24;

export type ShipId =
  | 'solhammer'
  | 'zephyr'
  | 'bulwark'
  | 'shade'
  | 'prism'
  | 'brood'
  | 'cinder'
  | 'grappler'
  | 'scuttle'
  | 'nullpoint'
  | 'stormlance'
  | 'mirage'
  | 'harrier'
  | 'minewright'
  | 'razorwing'
  | 'glacier'
  | 'swarmlord'
  | 'pulsejet'
  | 'railfox'
  | 'sanguine';

export interface PlayerInput {
  left: boolean;
  right: boolean;
  thrust: boolean;
  fire: boolean;
  special: boolean;
}

export const EMPTY_INPUT: PlayerInput = {
  left: false,
  right: false,
  thrust: false,
  fire: false,
  special: false,
};

export type ProjectileKind =
  | 'laser'
  | 'heavy'
  | 'flame'
  | 'crystal'
  | 'spore'
  | 'missile'
  | 'nuke'
  | 'limpet'
  | 'butt'
  | 'drain'
  | 'shard'
  | 'drone_shot';

export interface Projectile {
  id: number;
  /** Slot index of owner */
  owner: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  radius: number;
  homing: number;
  pierce: boolean;
  trail: boolean;
}

export interface Effect {
  id: number;
  kind:
    | 'explosion'
    | 'teleport'
    | 'shield_flash'
    | 'nova'
    | 'cloak_pop'
    | 'phase'
    | 'nuke_flash'
    | 'ring'
    | 'spark'
    | 'hive'
    | 'wake'
    | 'panic'
    | 'pickup';
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
}

export interface Drone {
  id: number;
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  life: number;
  hp: number;
  fireCd: number;
}

export interface ShipRuntime {
  /** Slot index 0..N-1 (legacy name `player`) */
  player: number;
  /** Team for 2v2; null for FFA */
  team: 0 | 1 | null;
  shipId: ShipId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  fireCd: number;
  specialCd: number;
  alive: boolean;
  thrustTime: number;
  /** Angular velocity (rad/s) - heavy ships spool slowly */
  omega: number;
  // status
  cloak: number;
  shield: number;
  slow: number;
  invuln: number;
  afterburn: number;
  limpets: number;
  tractor: number;
  cone: number;
  panic: number;
  // visual
  flash: number;
  trailHeat: number;
  /** Run upgrades baked in at spawn */
  dmgMult: number;
  cdMult: number;
  thrustMult: number;
  regenMult: number;
  /** Temporary asteroid pickups */
  powerBoost: number;
  hasteBoost: number;
  /** Windup before a big special fires (seconds remaining) */
  telegraph: number;
  /** Special already paid for - fire when telegraph hits 0 */
  pendingSpecial: boolean;
  /** Seconds of big hit-read flash after taking damage */
  hitRead: number;
  /** Direction of last hit (for trail) */
  lastHitAngle: number;
}

export type AsteroidKind = 'rock' | 'heal' | 'energy' | 'power' | 'haste' | 'shield';

export interface Asteroid {
  id: number;
  kind: AsteroidKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  spin: number;
  omega: number;
  hp: number;
  life: number;
}

/** Soft arena hazard - scrap piles and drag lanes. */
export type ScrapZoneKind = 'pile' | 'lane';

export interface ScrapZone {
  id: number;
  kind: ScrapZoneKind;
  x: number;
  y: number;
  /** For lanes: length along angle; for piles: radius */
  radius: number;
  angle: number;
  /** Extra length for lane rectangles */
  length: number;
  /** Drag multiplier while inside (1 = none, >1 = sticky) */
  drag: number;
  /** Tiny chip damage per second while inside piles */
  dps: number;
}

export type MapRuleId = 'standard' | 'asteroid_storm' | 'cloak_fog' | 'scrap_maze' | 'low_grav';

export interface MapRulesState {
  id: MapRuleId;
  label: string;
  asteroidMul: number;
  cloakFog: boolean;
  scrapHeavy: boolean;
  forceGravity?: 0 | 1 | 2;
  startHpFrac: number;
}

export interface SimState {
  tick: number;
  ships: ShipRuntime[];
  projectiles: Projectile[];
  drones: Drone[];
  effects: Effect[];
  asteroids: Asteroid[];
  scrapZones: ScrapZone[];
  /**
   * Duel: -1 draw, 0/1 slot.
   * Teams/FFA: winning slot index, or -1 draw.
   */
  winner: number | null;
  /** Set for teams2v2 when a team wipes the other */
  winnerTeam: 0 | 1 | null;
  nextId: number;
  seed: number;
  /** Per-match planet */
  planetR: number;
  gravity: number;
  /** 0 = whisper, 1 = normal, 2 = crushing */
  gravityTier: 0 | 1 | 2;
  map: MapRulesState;
  format: import('./arena').ArenaFormat;
  arenaW: number;
  arenaH: number;
}

export type GameMode =
  | 'local2p'
  | 'vsai'
  | 'online'
  | 'aivsai'
  | 'tutorial'
  | 'climb'
  | 'weekly'
  | 'ranked'
  | 'teams2v2'
  | 'ffa20';

export interface MatchConfig {
  mode: GameMode;
  fleet0: ShipId[];
  fleet1: ShipId[];
  roomCode?: string;
}

/** True if a and b can hurt each other. */
export function isHostile(a: ShipRuntime, b: ShipRuntime): boolean {
  if (!b.alive || a.player === b.player) return false;
  if (a.team !== null && b.team !== null && a.team === b.team) return false;
  return true;
}
