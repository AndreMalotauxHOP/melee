import './style.css';
import { thinkAI } from './game/ai';
import {
  aiPickShip,
  availablePicks,
  bothPicked,
  createLadder,
  FLEET_SIZE,
  nextFightShips,
  randomFleet,
  resolveFight,
  selectShip,
  toggleFleetShip,
  type LadderState,
} from './game/fleet';
import { Renderer } from './game/renderer';
import { World3D } from './render/World3D';
import { sound } from './audio/sound';
import { SHIP_LIST, SHIPS } from './game/ships';
import {
  loadBalanceStats,
  recordBout,
  resetBalanceStats,
  rankedShips,
  balanceReport,
  matchupCallout,
  upsetUnderdog,
  type BalanceStats,
} from './game/balanceStats';
import {
  HOUSE_CHAPTERS,
  clearChapter,
  loadClimb,
  markTutorialDone,
  nextRank,
  rankForXp,
  recordSeriesResult,
  tutorialCpuFleet,
  tutorialYouFleet,
  type ClimbState,
} from './game/scrapyard';
import {
  advanceTutorial,
  createTutorial,
  tutorialPrompt,
  type TutorialState,
} from './game/tutorial';
import { shipVerb, shipMotif } from './game/identity';
import {
  fetchLeaderboard,
  loadCareer,
  recordBoutCareerProgress,
  recordSeriesCareer,
  setPlayerName,
  syncCareerToServer,
  winRate,
  type LeaderboardRow,
  type PlayerCareer,
} from './game/playerStats';
import {
  ACHIEVEMENTS,
  freshUnlocks,
  isShipUnlocked,
  progressFromCareer,
  STARTER_SHIPS,
  unlockHint,
  unlockedShips,
  type AchievementDef,
} from './game/unlocks';
import { pickCardHtml, shipCardHtml, movesPanelHtml } from './ui/shipInfo';
import { ShipPreview } from './ui/ShipPreview';
import { paintShipThumbs } from './ui/shipThumbs';
import {
  MATCH_INTRO_DURATION,
  matchIntroCue,
  matchIntroFrame,
  type MatchIntroMeta,
} from './game/matchIntro';
import {
  adviceLines,
  buildPerfAdvice,
  FpsMonitor,
  loadGraphicsConfig,
  saveGraphicsConfig,
  type GraphicsConfig,
  type PerfAdvice,
} from './game/graphicsConfig';
import { createSim, createArenaSim, packInput, planetFromSeed, stepSim, unpackInput, type PlanetConfig } from './game/simulation';
import {
  buildCpuFilledSlots,
  type ArenaFormat,
  type ArenaSlot,
} from './game/arena';
import { wrapMid } from './game/math';
import {
  UPGRADE_DEFS,
  EMPTY_UPGRADES,
  EMPTY_BETS,
  SHOP_BETS,
  buyUpgrade,
  buyBet,
  canBuyBet,
  cloneUpgrades,
  resolveBetsOnBout,
  upgradeCost,
  type PlayerUpgrades,
  type UpgradeId,
  type ShopBetState,
} from './game/upgrades';
import {
  ARENA_H,
  ARENA_W,
  DT,
  EMPTY_INPUT,
  VIEW_H,
  VIEW_W,
  isHostile,
  type Asteroid,
  type Drone,
  type Effect,
  type GameMode,
  type PlayerInput,
  type Projectile,
  type ShipId,
  type ShipRuntime,
  type SimState,
} from './game/types';
import { InputManager, P1_KEYS, P2_KEYS } from './input/controls';
import { OnlineClient } from './net/onlineClient';
import {
  loadSeason,
  recordRankedResult,
  rankForMmr,
  seasonKey,
  weeklyModeFor,
  type SeasonState,
} from './game/season';
import {
  loadCosmetics,
  syncCosmeticUnlocks,
  setTrail,
  setTitle,
  TRAIL_COLORS,
  TITLE_LABEL,
  KILL_SIGNATURE,
  type CosmeticState,
  type TrailId,
  type TitleId,
} from './game/cosmetics';
import { balancePulse } from './game/meta';
import { loadClips, saveClip, copyClip } from './game/replays';

type Screen =
  | 'title'
  | 'shipselect'
  | 'online'
  | 'battle'
  | 'stats'
  | 'players'
  | 'unlocks'
  | 'clips'
  | 'locker'
  | 'season';

const app = document.querySelector<HTMLDivElement>('#app')!;
const input = new InputManager();

let screen: Screen = 'title';
let mode: GameMode = 'vsai';
let fleet0: ShipId[] = [];
let fleet1: ShipId[] = [];
let selectingFor: 0 | 1 = 0;
let previewFocus: ShipId = 'solhammer';
let shipPreview: ShipPreview | null = null;
let onlineCode = '';
let onlineStatus = '';
let onlineError = '';
let onlineSlot: 0 | 1 = 0;
let onlineClient: OnlineClient | null = null;
let season: SeasonState = loadSeason();
let mapHint: string | null = null;
let teachPressure = 0;
let quickplayBo3 = false;
let quickplayScore: [number, number] = [0, 0];
let onlineRematchPending = false;
let lastSavedClipId: string | null = null;

/** Queued ship unlock unpacking ceremony */
let unlockQueue: AchievementDef[] = [];
let unlockOverlay: HTMLElement | null = null;
let unlockPreview: ShipPreview | null = null;
let unlockPhase: 'idle' | 'crate' | 'reveal' = 'idle';
let unlockTimers: number[] = [];
/** After ceremony: resume bout pick flow or stay on series end */
let unlockResume: 'bout' | 'series' | null = null;
/** Menu preview - no career / match resume side effects */
let unlockPreviewOnly = false;

let sim: SimState | null = null;
let ladder: LadderState | null = null;
let seriesSeed = 1;
let seriesPlanet: PlanetConfig | null = null;
let renderer: Renderer | null = null;
let world3d: World3D | null = null;
let canvas: HTMLCanvasElement | null = null;
let hudCanvas: HTMLCanvasElement | null = null;
let raf = 0;
let accum = 0;
let lastTs = 0;
let pausedOnline = false;
let prevHp: number[] = [0, 0];
let prevAlive: boolean[] = [true, true];
let prevProjCount = 0;
let prevWinner: number | null = null;
let arenaSlots: ArenaSlot[] | null = null;
let heardEffects = new Set<number>();
let callout: string | null = null;
let calloutLife = 0;
let boutStreak = 0; // consecutive bout wins for local/human side
let bestStreak = 0;
let combo = 0;
let comboTimer = 0;
let style = 0;
let bestCombo = 0;
let shipsKilled = 0;
let damageDealt = 0;
let firstBlood = false;
let intermissionTimer = 0;
let intermissionText: string | null = null;
let countdown = 0;
let matchIntroMeta: MatchIntroMeta | null = null;
let matchIntroElapsed = 0;
let graphicsConfig: GraphicsConfig = loadGraphicsConfig();
const fpsMonitor = new FpsMonitor();
let lastPerfAdvice: PerfAdvice | null = null;
let perfAdviceLife = 0;
let hitStop = 0;
let heartbeatCd = 0;
let floats: {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}[] = [];

type KillSnap = {
  ships: Pick<
    ShipRuntime,
    | 'x'
    | 'y'
    | 'vx'
    | 'vy'
    | 'angle'
    | 'alive'
    | 'hp'
    | 'maxHp'
    | 'energy'
    | 'maxEnergy'
    | 'omega'
    | 'cloak'
    | 'flash'
    | 'thrustTime'
    | 'shield'
    | 'afterburn'
    | 'panic'
    | 'shipId'
    | 'player'
  >[];
  projectiles: Projectile[];
  drones: Drone[];
  asteroids: Asteroid[];
  effects: Effect[];
};

type KillCamState = {
  frames: KillSnap[];
  elapsed: number;
  duration: number;
  focusX: number;
  focusY: number;
  subtitle: string;
  killerName: string | null;
  victimName: string | null;
  killerId: ShipId | null;
  victimSlot: number | null;
  /** Normalized index where victim dies */
  impactAt: number;
  victoryPlayed: boolean;
  lastShownHp: number;
  /** Cumulative damage shown during this replay */
  damageTotal: number;
  /** Latest chunk of damage (for pop animation) */
  lastHit: number;
  lastHitAge: number;
  /** Screen impact pulses */
  impacts: { x: number; y: number; life: number; maxLife: number; amount: number }[];
};

const KILL_BUF_MAX = 200;
let killBuffer: KillSnap[] = [];
let killCam: KillCamState | null = null;

function captureKillSnap(state: SimState): KillSnap {
  return {
    ships: state.ships.map((s) => ({
      x: s.x,
      y: s.y,
      vx: s.vx,
      vy: s.vy,
      angle: s.angle,
      alive: s.alive,
      hp: s.hp,
      maxHp: s.maxHp,
      energy: s.energy,
      maxEnergy: s.maxEnergy,
      omega: s.omega,
      cloak: s.cloak,
      flash: s.flash,
      thrustTime: s.thrustTime,
      shield: s.shield,
      afterburn: s.afterburn,
      panic: s.panic,
      shipId: s.shipId,
      player: s.player,
    })),
    projectiles: state.projectiles.map((p) => ({ ...p })),
    drones: state.drones.map((d) => ({ ...d })),
    asteroids: state.asteroids.map((a) => ({ ...a })),
    effects: state.effects.map((e) => ({ ...e })),
  };
}

function pushKillSnap(state: SimState): void {
  if (killCam || pickPhase || countdown > 0 || intermissionTimer > 0) return;
  killBuffer.push(captureKillSnap(state));
  if (killBuffer.length > KILL_BUF_MAX) killBuffer.shift();
}

function buildDrawState(base: SimState, snap: KillSnap): SimState {
  return {
    ...base,
    ships: [
      { ...base.ships[0], ...snap.ships[0] },
      { ...base.ships[1], ...snap.ships[1] },
    ],
    projectiles: snap.projectiles,
    drones: snap.drones,
    asteroids: snap.asteroids,
    effects: snap.effects,
  };
}

function lerpWrap(a: number, b: number, t: number, size: number): number {
  let d = b - a;
  if (d > size * 0.5) d -= size;
  if (d < -size * 0.5) d += size;
  return a + d * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Blend two kill snaps so slow-mo stays 60fps-smooth instead of stuttering. */
function interpolateKillSnap(a: KillSnap, b: KillSnap, t: number): KillSnap {
  const u = Math.max(0, Math.min(1, t));
  const ships = a.ships.map((sa, i) => {
    const sb = b.ships[i] ?? sa;
    return {
      ...sa,
      x: lerpWrap(sa.x, sb.x, u, ARENA_W),
      y: lerpWrap(sa.y, sb.y, u, ARENA_H),
      vx: sa.vx + (sb.vx - sa.vx) * u,
      vy: sa.vy + (sb.vy - sa.vy) * u,
      angle: lerpAngle(sa.angle, sb.angle, u),
      omega: sa.omega + (sb.omega - sa.omega) * u,
      hp: sa.hp + (sb.hp - sa.hp) * u,
      energy: sa.energy + (sb.energy - sa.energy) * u,
      cloak: sa.cloak + (sb.cloak - sa.cloak) * u,
      flash: sa.flash + (sb.flash - sa.flash) * u,
      thrustTime: sa.thrustTime + (sb.thrustTime - sa.thrustTime) * u,
      shield: sa.shield + (sb.shield - sa.shield) * u,
      afterburn: sa.afterburn + (sb.afterburn - sa.afterburn) * u,
      panic: sa.panic + (sb.panic - sa.panic) * u,
      // Flip alive only at the end so wrecks don't pop early
      alive: u < 0.92 ? sa.alive : sb.alive,
    };
  });

  const bProj = new Map(b.projectiles.map((p) => [p.id, p]));
  const projectiles = a.projectiles.map((pa) => {
    const pb = bProj.get(pa.id);
    if (!pb) return { ...pa, life: pa.life * (1 - u) };
    return {
      ...pa,
      x: lerpWrap(pa.x, pb.x, u, ARENA_W),
      y: lerpWrap(pa.y, pb.y, u, ARENA_H),
      vx: pa.vx + (pb.vx - pa.vx) * u,
      vy: pa.vy + (pb.vy - pa.vy) * u,
      life: pa.life + (pb.life - pa.life) * u,
    };
  });
  // New projectiles appearing in b
  for (const pb of b.projectiles) {
    if (!a.projectiles.some((p) => p.id === pb.id) && u > 0.5) {
      projectiles.push({ ...pb });
    }
  }

  const bDrone = new Map(b.drones.map((d) => [d.id, d]));
  const drones = a.drones.map((da) => {
    const db = bDrone.get(da.id);
    if (!db) return da;
    return {
      ...da,
      x: lerpWrap(da.x, db.x, u, ARENA_W),
      y: lerpWrap(da.y, db.y, u, ARENA_H),
      vx: da.vx + (db.vx - da.vx) * u,
      vy: da.vy + (db.vy - da.vy) * u,
      angle: lerpAngle(da.angle, db.angle, u),
    };
  });

  const bAst = new Map(b.asteroids.map((x) => [x.id, x]));
  const asteroids = a.asteroids.map((aa) => {
    const ab = bAst.get(aa.id);
    if (!ab) return aa;
    return {
      ...aa,
      x: lerpWrap(aa.x, ab.x, u, ARENA_W),
      y: lerpWrap(aa.y, ab.y, u, ARENA_H),
      vx: aa.vx + (ab.vx - aa.vx) * u,
      vy: aa.vy + (ab.vy - aa.vy) * u,
      spin: lerpAngle(aa.spin, ab.spin, u),
    };
  });

  // Effects: keep a's, fade life toward b when matched
  const bFx = new Map(b.effects.map((e) => [e.id, e]));
  const effects = a.effects.map((ea) => {
    const eb = bFx.get(ea.id);
    if (!eb) return { ...ea, life: ea.life * (1 - u * 0.5) };
    return {
      ...ea,
      x: lerpWrap(ea.x, eb.x, u, ARENA_W),
      y: lerpWrap(ea.y, eb.y, u, ARENA_H),
      life: ea.life + (eb.life - ea.life) * u,
      radius: ea.radius + (eb.radius - ea.radius) * u,
    };
  });
  for (const eb of b.effects) {
    if (!a.effects.some((e) => e.id === eb.id) && u > 0.35) {
      effects.push({ ...eb, life: eb.life * u });
    }
  }

  return { ships, projectiles, drones, asteroids, effects };
}

function startKillCam(): void {
  if (!sim || killCam || fightResolved) return;
  let frames = killBuffer.slice();
  frames.push(captureKillSnap(sim));

  let focusX = sim.ships[0]?.x ?? 0;
  let focusY = sim.ships[0]?.y ?? 0;
  let killerName: string | null = null;
  let victimName: string | null = null;
  let killerId: ShipId | null = null;
  let victimId: ShipId | null = null;
  let victimSlot: number | null = null;

  const w = sim.winner;
  if (w !== null && w >= 0) {
    const winnerShip = sim.ships[w];
    const victim =
      sim.ships.find((s) => !s.alive && winnerShip && isHostile(winnerShip, { ...s, alive: true })) ??
      sim.ships.find((s) => !s.alive && s.player !== w) ??
      null;
    if (winnerShip) {
      killerId = winnerShip.shipId;
      focusX = winnerShip.x;
      focusY = winnerShip.y;
    }
    if (victim) {
      victimId = victim.shipId;
      victimSlot = victim.player;
      focusX = victim.x;
      focusY = victim.y;
    }
  } else if (sim.ships.length >= 2) {
    const mid = wrapMid(sim.ships[0].x, sim.ships[0].y, sim.ships[1].x, sim.ships[1].y);
    focusX = mid.x;
    focusY = mid.y;
  }

  if (killerId) killerName = SHIPS[killerId].name.toUpperCase();
  if (victimId) victimName = SHIPS[victimId].name.toUpperCase();

  // Trim to finishing stretch with enough runway to see bullets land
  let impactIdx = Math.max(0, frames.length - 1);
  if (victimSlot !== null) {
    for (let i = 0; i < frames.length; i++) {
      if (!frames[i]!.ships[victimSlot]!.alive) {
        impactIdx = i;
        break;
      }
    }
    const pre = 72; // ~1.2s of last hits
    const post = 22;
    const start = Math.max(0, impactIdx - pre);
    const end = Math.min(frames.length, impactIdx + post);
    frames = frames.slice(start, end);
    impactIdx = impactIdx - start;
  } else if (frames.length > 80) {
    frames = frames.slice(-80);
    impactIdx = Math.floor(frames.length * 0.72);
  }

  if (frames.length < 12) {
    while (frames.length < 16) frames.unshift(frames[0]!);
    impactIdx = Math.max(impactIdx, frames.length - 4);
  }

  const impactAt = impactIdx / Math.max(1, frames.length - 1);
  const startHp =
    victimSlot !== null ? frames[0]!.ships[victimSlot]!.hp : 0;

  const subtitle =
    sim.winner === -1
      ? 'DOUBLE KO'
      : killerName && victimName
        ? `${killerName}  →  ${victimName}`
        : 'KILL CAM';

  floats = [];
  callout = null;
  calloutLife = 0;
  killCam = {
    frames,
    elapsed: 0,
    duration: 3.8,
    focusX,
    focusY,
    subtitle,
    killerName,
    victimName,
    killerId,
    victimSlot,
    impactAt,
    victoryPlayed: false,
    lastShownHp: startHp,
    damageTotal: 0,
    lastHit: 0,
    lastHitAge: 0,
    impacts: [],
  };

  if (killerId && victimName) {
    flashCallout(KILL_SIGNATURE[killerId], 1.8);
    const victimHp =
      victimSlot !== null
        ? frames.map(
            (f) =>
              f.ships[victimSlot]!.hp /
              Math.max(1, f.ships[victimSlot]!.maxHp),
          )
        : [];
    const clip = saveClip({
      killer: killerName ?? 'UNKNOWN',
      victim: victimName,
      subtitle,
      signature: KILL_SIGNATURE[killerId],
      victimHp,
      durationSec: killCam!.duration,
    });
    lastSavedClipId = clip.id;
    const human = humanSide();
    if (
      cosmetics.victoryPose &&
      sim.winner === human &&
      killerId === sim.ships[human].shipId
    ) {
      setTimeout(() => flashCallout('VICTORY POSE', 0.9), 420);
    }
  }

  world3d?.addShake(8);
  sound.explosion(true);
  killBuffer = [];
}

/** Credits: skill builds the bout purse, bank on win, spend in shop */
let credits: [number, number] = [0, 0];
let boutPurse = 0;
/** Bout-local skill meters feeding the purse */
let boutDamage = 0;
let boutComboPeak = 0;
let boutStylePeak = 0;
/** Damage dealt by each side this bout (for balance stats) */
let boutDamageBySide: [number, number] = [0, 0];
let balanceStats: BalanceStats = loadBalanceStats();
let climb: ClimbState = loadClimb();
let climbChapter = 0;
let career: PlayerCareer = loadCareer();
let cosmetics: CosmeticState = syncCosmeticUnlocks(
  loadCosmetics(),
  career,
  season.mmr,
);
let leaderboard: LeaderboardRow[] = [];
let tutorial: TutorialState = createTutorial(false);
let shopBets: [ShopBetState, ShopBetState] = [
  { ...EMPTY_BETS },
  { ...EMPTY_BETS },
];
let matchupLine: string | null = null;
let matchupLineLife = 0;
let deathDebrief: {
  samples: number[];
  killer: string;
  victim: string;
  life: number;
} | null = null;
let hpHistory: number[] = [];
let spectatorChips: string[] = [];
let spectatorChipTimer = 0;
let aivsaiAutoTimer = 0;
let upgrades: [PlayerUpgrades, PlayerUpgrades] = [
  cloneUpgrades(EMPTY_UPGRADES),
  cloneUpgrades(EMPTY_UPGRADES),
];
/** Add skill-earned cash to the live bout purse */
function awardSkill(amount: number): void {
  if (amount <= 0 || pickPhase || countdown > 0 || killCam) return;
  boutPurse += amount;
}

/** Fight resolution / ship pick */
let fightResolved = false;
let pickPhase = false;
let pickOverlay: HTMLElement | null = null;

/** Online lockstep buffers */
const localQueue = new Map<number, number>();
const remoteQueue = new Map<number, number>();
const pendingRemoteQueue = new Map<number, number>();
let onlineYou: 0 | 1 = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function fleetLabel(fleet: ShipId[]): string {
  if (fleet.length === 0) return '(empty)';
  return fleet.map((id, i) => `${i + 1}.${SHIPS[id].name}`).join(' · ');
}

function randomUnlockedFleet(): ShipId[] {
  const prog = progressFromCareer(career);
  const pool = unlockedShips(prog);
  if (pool.length >= FLEET_SIZE) {
    const copy = [...pool];
    const fleet: ShipId[] = [];
    while (fleet.length < FLEET_SIZE && copy.length > 0) {
      const j = (Math.random() * copy.length) | 0;
      fleet.push(copy.splice(j, 1)[0]!);
    }
    return fleet;
  }
  return randomFleet();
}

function applyWeeklyMapHint(id: ReturnType<typeof weeklyModeFor>['id']): void {
  if (
    id === 'sudden_death' ||
    id === 'low_grav' ||
    id === 'asteroid_storm' ||
    id === 'cloak_fog'
  ) {
    mapHint = id;
  } else {
    mapHint = null;
  }
}

function bossGauntletFleet(): ShipId[] {
  const prog = progressFromCareer(career);
  if (isShipUnlocked('bulwark', prog)) {
    return Array(FLEET_SIZE).fill('bulwark') as ShipId[];
  }
  return randomFleet();
}

function resetModeFlags(): void {
  mapHint = null;
  quickplayBo3 = false;
  quickplayScore = [0, 0];
  teachPressure = 0;
  onlineRematchPending = false;
  arenaSlots = null;
}

function isArenaBrawl(): boolean {
  return mode === 'teams2v2' || mode === 'ffa20';
}

function draftNeed(): number {
  return isArenaBrawl() ? 1 : FLEET_SIZE;
}

function shuffleShipIds(ids: ShipId[]): ShipId[] {
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = t;
  }
  return copy;
}

function cpuShipPool(): ShipId[] {
  const prog = progressFromCareer(career);
  const unlocked = unlockedShips(prog);
  const pool = unlocked.length > 0 ? unlocked : [...STARTER_SHIPS];
  return shuffleShipIds(pool);
}

function humanArenaSlot(): number {
  const idx = arenaSlots?.findIndex((s) => s.human) ?? 0;
  return idx >= 0 ? idx : 0;
}

function disposeShipPreview(): void {
  shipPreview?.dispose();
  shipPreview = null;
}

function renderUI(): void {
  disposeShipPreview();
  input.setBlocked(screen !== 'battle');
  app.classList.toggle('battle-lock', screen === 'battle');
  app.innerHTML = '';
  if (screen === 'title') renderTitle();
  else if (screen === 'shipselect') renderShipSelect();
  else if (screen === 'online') renderOnline();
  else if (screen === 'stats') renderStats();
  else if (screen === 'players') void renderPlayers();
  else if (screen === 'unlocks') renderUnlocks();
  else if (screen === 'clips') renderClips();
  else if (screen === 'locker') renderLocker();
  else if (screen === 'season') renderSeason();
  else renderBattleShell();
}

function renderTitle(): void {
  season = loadSeason();
  career = loadCareer();
  cosmetics = syncCosmeticUnlocks(cosmetics, career, season.mmr);
  balanceStats = loadBalanceStats();
  const weekly = weeklyModeFor();

  const shell = el('div', 'shell title-shell');
  shell.append(el('h1', 'brand', 'Scrap Rumble'));
  shell.append(
    el(
      'p',
      'tagline',
      'Orbit\'s dumbest bloodsport · winner stays · dignity leaves',
    ),
  );
  const panel = el('div', 'panel menu-grid');

  const meta = el('div', 'title-meta');
  const seasonCard = el('div', 'climb-card season-card');
  const sRank = rankForMmr(season.mmr);
  seasonCard.innerHTML = `
    <h3>Season ${seasonKey()} · ${sRank}</h3>
    <p>MMR <strong>${season.mmr}</strong> · Peak <strong>${season.peakMmr}</strong> · W/L <strong>${season.wins}/${season.losses}</strong></p>
  `;
  const weeklyCard = el('div', 'climb-card');
  weeklyCard.innerHTML = `
    <h3>Mode of the Week · ${weekly.name}</h3>
    <p>${weekly.blurb}</p>
  `;
  meta.append(seasonCard, weeklyCard);
  if (balanceStats.matches >= 8) {
    const pulseLines = balancePulse(balanceStats).filter(
      (line) => !line.includes('warming up'),
    );
    if (pulseLines.length) {
      const pulse = el('div', 'hint balance-pulse');
      pulse.innerHTML = pulseLines
        .slice(0, 2)
        .map((line) => `<p>${line}</p>`)
        .join('');
      meta.append(pulse);
    }
  }
  panel.append(meta);

  const b1 = el('button', 'primary', 'Bully the CPU');
  b1.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'vsai';
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    screen = 'shipselect';
    renderUI();
  };
  const b2 = el('button', '', 'Couch Chaos (2P)');
  b2.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'local2p';
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    screen = 'shipselect';
    renderUI();
  };
  const b3 = el('button', '', 'Online Mayhem');
  b3.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'online';
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    screen = 'shipselect';
    renderUI();
  };
  const bTut = el('button', '', 'First Fight School');
  bTut.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'tutorial';
    fleet0 = tutorialYouFleet();
    fleet1 = tutorialCpuFleet();
    tutorial = createTutorial(true);
    startSeries();
  };
  const bClimb = el('button', '', 'Scrapyard Climb');
  bClimb.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    climb = loadClimb();
    const idx = Math.min(climb.chapter, HOUSE_CHAPTERS.length - 1);
    climbChapter = idx;
    const chapter = HOUSE_CHAPTERS[idx];
    mode = 'climb';
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [...chapter.fleet];
    screen = 'shipselect';
    renderUI();
  };
  const bWeekly = el('button', '', 'Mode of the Week');
  bWeekly.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'weekly';
    applyWeeklyMapHint(weekly.id);
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    if (weekly.id === 'random_fleets') {
      fleet0 = randomUnlockedFleet();
      fleet1 = randomUnlockedFleet();
      startSeries();
      return;
    }
    if (weekly.id === 'boss_gauntlet') {
      fleet1 = bossGauntletFleet();
    }
    screen = 'shipselect';
    renderUI();
  };
  const bRanked = el('button', '', 'Ranked Climb');
  bRanked.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'ranked';
    mapHint = null;
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    screen = 'shipselect';
    renderUI();
  };
  const bBo3 = el('button', '', 'Quickplay BO3 (vs CPU)');
  bBo3.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'vsai';
    quickplayBo3 = true;
    mapHint = null;
    fleet0 = randomUnlockedFleet();
    fleet1 = randomUnlockedFleet();
    startSeries();
  };
  const bTeam = el('button', 'primary', 'Team Scuffle (2v2)');
  bTeam.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'teams2v2';
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    arenaSlots = null;
    screen = 'shipselect';
    renderUI();
  };
  const bFfa = el('button', 'primary', 'Free-For-All (20)');
  bFfa.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'ffa20';
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    arenaSlots = null;
    screen = 'shipselect';
    renderUI();
  };
  const bClips = el('button', '', 'Clip Vault');
  bClips.onclick = () => {
    void sound.unlock();
    sound.ui();
    screen = 'clips';
    renderUI();
  };
  const bLocker = el('button', '', 'Vanity Locker');
  bLocker.onclick = () => {
    void sound.unlock();
    sound.ui();
    screen = 'locker';
    renderUI();
  };
  const bSeason = el('button', '', 'Season Board');
  bSeason.onclick = () => {
    void sound.unlock();
    sound.ui();
    screen = 'season';
    renderUI();
  };
  const b4 = el('button', '', 'CPU vs CPU (spectate)');
  b4.onclick = () => {
    void sound.unlock();
    sound.ui();
    resetModeFlags();
    mode = 'aivsai';
    startAivsaiSeries();
  };
  const bStats = el('button', '', 'Balance Lab');
  bStats.onclick = () => {
    void sound.unlock();
    sound.ui();
    balanceStats = loadBalanceStats();
    screen = 'stats';
    renderUI();
  };
  const mute = el('button', '', 'Mute The Nonsense');
  mute.onclick = () => {
    void sound.unlock();
    sound.setMuted(!sound.muted);
    mute.textContent = sound.muted ? 'Unmute The Nonsense' : 'Mute The Nonsense';
  };
  const rank = rankForXp(climb.xp);
  const wr = Math.round(winRate(career) * 100);
  const careerCard = el('div', 'climb-card career-card');
  careerCard.innerHTML = `
    <h3>${career.name} · ${TITLE_LABEL[cosmetics.title]}</h3>
    <p><strong>${career.played}</strong> played · <strong>${career.wins}</strong>W/${career.losses}L · ${wr}% · unlocks <strong>${unlockedShips(progressFromCareer(career)).length}/20</strong></p>
    <p class="muted">${rank.title} · XP ${climb.xp} · ch ${Math.min(climb.chapter + 1, HOUSE_CHAPTERS.length)}/${HOUSE_CHAPTERS.length} · streak ${career.bestStreak}</p>
  `;
  const nameRow = el('div', 'name-row');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 18;
  nameInput.value = career.name;
  nameInput.placeholder = 'Callsign';
  nameInput.className = 'name-input';
  const saveName = el('button', '', 'Set Callsign');
  saveName.onclick = () => {
    career = setPlayerName(career, nameInput.value);
    void syncCareerToServer(career);
    sound.ui();
    renderUI();
  };
  nameRow.append(nameInput, saveName);
  careerCard.append(nameRow);

  const bAch = el('button', '', 'Unlocks & Achievements');
  bAch.onclick = () => {
    void sound.unlock();
    sound.ui();
    screen = 'unlocks';
    renderUI();
  };
  const bPlayers = el('button', '', 'Yard Hall (all pilots)');
  bPlayers.onclick = () => {
    void sound.unlock();
    sound.ui();
    screen = 'players';
    renderUI();
  };

  const primary = el('div', 'menu-primary');
  primary.append(b1, bWeekly, bRanked, bBo3, bTeam, bFfa);
  const actions = el('div', 'menu-actions');
  actions.append(
    bTut,
    bClimb,
    b2,
    b3,
    b4,
    bStats,
    bClips,
    bLocker,
    bSeason,
    bAch,
    bPlayers,
    mute,
  );
  // Play buttons first so short screens see them without scrolling
  panel.append(primary, actions, careerCard);
  panel.append(
    el(
      'div',
      'hint',
      `<p>Draft <strong>${FLEET_SIZE}</strong> scrapheaps · earn <strong>$</strong> from stylish hits · bank by winning · upgrade between bouts.</p>
       <p><strong>P1</strong> <kbd>W</kbd><kbd>A</kbd><kbd>D</kbd> · <kbd>F</kbd>/<kbd>G</kbd> · <strong>P2</strong> arrows · <kbd>/</kbd><kbd>.</kbd></p>`,
    ),
  );
  shell.append(panel);
  app.append(shell);
}

function renderShipSelect(): void {
  const prevScroll = document.querySelector('.ship-select')?.scrollTop ?? 0;
  const shell = el('div', 'shell');
  const drafting = selectingFor === 0 ? fleet0 : fleet1;
  const need = draftNeed();
  const weekly = weeklyModeFor();
  const title = isArenaBrawl()
    ? mode === 'teams2v2'
      ? `Team Scuffle · pick your ship · empty slots fill with CPU (${drafting.length}/1)`
      : `Free-For-All · pick your ship · 19 CPU fill the yard (${drafting.length}/1)`
    : mode === 'weekly'
      ? `Weekly · ${weekly.name} · pick ${FLEET_SIZE} (${drafting.length}/${FLEET_SIZE})`
      : mode === 'ranked'
        ? `Ranked · pick ${FLEET_SIZE} (${drafting.length}/${FLEET_SIZE})`
        : mode === 'climb'
          ? `Climb · ${HOUSE_CHAPTERS[climbChapter]?.name ?? 'Yard'} · pick ${FLEET_SIZE} (${drafting.length}/${FLEET_SIZE})`
          : mode === 'vsai' || mode === 'tutorial'
            ? `Grab ${FLEET_SIZE} weirdos (${drafting.length}/${FLEET_SIZE})`
            : mode === 'online'
              ? `Grab ${FLEET_SIZE} weirdos (${drafting.length}/${FLEET_SIZE})`
              : selectingFor === 0
                ? `P1 picks ${FLEET_SIZE} disasters (${drafting.length}/${FLEET_SIZE})`
                : `P2 picks ${FLEET_SIZE} disasters (${drafting.length}/${FLEET_SIZE})`;

  shell.append(el('h1', 'brand', isArenaBrawl() ? 'Pick Your Menace' : 'Junkyard Draft'));
  shell.append(el('p', 'tagline', title));
  if (mode === 'teams2v2') {
    shell.append(
      el(
        'p',
        'tagline',
        '2v2 on a 2× arena · you + 1 CPU ally vs 2 CPU · friendly fire off',
      ),
    );
  }
  if (mode === 'ffa20') {
    shell.append(
      el('p', 'tagline', '20 ships on a 10× arena · last scrapheap flying wins'),
    );
  }
  if (mode === 'climb') {
    const ch = HOUSE_CHAPTERS[climbChapter];
    shell.append(
      el('p', 'tagline', `${ch.name} - ${ch.blurb}`),
    );
  }
  if (mode === 'weekly') {
    shell.append(el('p', 'tagline', weekly.blurb));
  }
  if (mode === 'ranked') {
    shell.append(
      el(
        'p',
        'tagline',
        `${rankForMmr(season.mmr)} · MMR ${season.mmr} · wins matter for the board`,
      ),
    );
  }

  const panel = el('div', 'panel');

  const slots = el('div', 'fleet-slots');
  for (let i = 0; i < need; i++) {
    const id = drafting[i];
    const slot = el('div', `fleet-slot${id ? ' filled' : ''}`);
    if (id) {
      slot.style.borderColor = SHIPS[id].color;
      slot.innerHTML = `<span class="n">${i + 1}</span><span class="nm" style="color:${SHIPS[id].color}">${SHIPS[id].name}</span>`;
      slot.onclick = () => {
        if (selectingFor === 0) fleet0 = fleet0.filter((s) => s !== id);
        else fleet1 = fleet1.filter((s) => s !== id);
        renderUI();
      };
      slot.onmouseenter = () => focusPreview(id);
    } else {
      slot.innerHTML = `<span class="n">${i + 1}</span><span class="nm muted">empty</span>`;
    }
    slots.append(slot);
  }
  panel.append(slots);
  const prog = progressFromCareer(career);
  panel.append(
    el(
      'div',
      'hint',
      isArenaBrawl()
        ? `Pick one unlocked ship. Remaining seats fill with unlocked CPUs · <strong>${unlockedShips(prog).length}/20</strong> open.`
        : `Starter six are free. Unlock the rest with achievements · <strong>${unlockedShips(prog).length}/20</strong> open. Hover a weirdo for the roast. Order is fight order.`,
    ),
  );

  const layout = el('div', 'draft-layout');
  const left = el('div', 'draft-main');
  const grid = el('div', 'ship-select');
  for (const def of SHIP_LIST) {
    const inFleet = drafting.includes(def.id);
    const locked = !isShipUnlocked(def.id, prog);
    const full = drafting.length >= need && !inFleet;
    const card = el(
      'button',
      `ship-card${inFleet ? ' selected' : ''}${full || locked ? ' disabled' : ''}${locked ? ' locked' : ''}${previewFocus === def.id ? ' previewing' : ''}`,
    );
    card.type = 'button';
    card.dataset.shipId = def.id;
    card.disabled = full || locked;
    const ord = inFleet ? drafting.indexOf(def.id) + 1 : undefined;
    card.innerHTML =
      shipCardHtml(def, { ord }) +
      (locked
        ? `<div class="lock-banner">${unlockHint(def.id, prog)}</div>`
        : '');
    card.onmouseenter = () => focusPreview(def.id);
    card.onclick = () => {
      if (locked) {
        sound.ui();
        previewFocus = def.id;
        focusPreview(def.id);
        return;
      }
      sound.ui();
      if (isArenaBrawl()) {
        fleet0 = [def.id];
      } else if (selectingFor === 0) {
        fleet0 = toggleFleetShip(fleet0, def.id);
      } else {
        fleet1 = toggleFleetShip(fleet1, def.id);
      }
      previewFocus = def.id;
      renderUI();
    };
    grid.append(card);
  }
  left.append(grid);

  const right = el('div', 'preview-panel');
  const previewHead = el('div', 'preview-head');
  previewHead.id = 'preview-head';
  const canvas = document.createElement('canvas');
  canvas.className = 'ship-preview-canvas';
  const moves = el('div', 'moves-panel');
  moves.id = 'moves-panel';
  right.append(previewHead, canvas, moves);

  layout.append(left, right);
  panel.append(layout);

  const row = el('div', 'row');
  const back = el('button', '', 'Back');
  back.onclick = () => {
    if (mode === 'local2p' && selectingFor === 1) {
      selectingFor = 0;
      renderUI();
      return;
    }
    screen = 'title';
    renderUI();
  };
  const next = el('button', 'primary', isArenaBrawl() ? 'Fill With CPU & Fight' : 'Let\'s Rumble');
  next.disabled = drafting.length !== need;
  next.onclick = () => {
    if (drafting.length !== need) return;
    const clean = (fleet: ShipId[]) =>
      fleet.filter((id) => isShipUnlocked(id, progressFromCareer(career)));
    if (selectingFor === 0) fleet0 = clean(fleet0);
    else fleet1 = clean(fleet1);
    const draftingNow = selectingFor === 0 ? fleet0 : fleet1;
    if (draftingNow.length !== need) {
      renderUI();
      return;
    }
    if (isArenaBrawl()) {
      startArenaBrawl();
      return;
    }
    if (mode === 'local2p' && selectingFor === 0) {
      selectingFor = 1;
      renderUI();
      return;
    }
    if (mode === 'weekly') {
      const wk = weeklyModeFor();
      if (wk.id === 'mirror') {
        fleet1 = [...fleet0];
        startSeries();
        return;
      }
      if (wk.id === 'boss_gauntlet') {
        fleet1 = bossGauntletFleet();
        startSeries();
        return;
      }
      fleet1 = randomFleet();
      startSeries();
      return;
    }
    if (mode === 'ranked') {
      fleet1 = randomFleet();
      startSeries();
      return;
    }
    if (mode === 'vsai') {
      fleet1 = randomFleet();
      startSeries();
      return;
    }
    if (mode === 'climb') {
      fleet1 = [...HOUSE_CHAPTERS[climbChapter].fleet];
      startSeries();
      return;
    }
    if (mode === 'online') {
      screen = 'online';
      renderUI();
      return;
    }
    startSeries();
  };
  row.append(back, next);
  panel.append(row);
  shell.append(panel);
  app.append(shell);
  void paintShipThumbs(shell);

  shipPreview = new ShipPreview(canvas);
  const initial =
    drafting.includes(previewFocus)
      ? previewFocus
      : drafting[0] ?? SHIP_LIST[0].id;
  focusPreview(initial);
  requestAnimationFrame(() => {
    const list = document.querySelector('.ship-select');
    if (list) list.scrollTop = prevScroll;
  });

  function focusPreview(id: ShipId): void {
    previewFocus = id;
    const def = SHIPS[id];
    const loreName = def.name;
    const locked = !isShipUnlocked(id, prog);
    previewHead.innerHTML = locked
      ? `<span style="color:${def.color}">${loreName}</span> <em>LOCKED · ${unlockHint(id, prog)}</em>`
      : `<span style="color:${def.color}">${loreName}</span> <em>${def.tagline}</em>`;
    moves.innerHTML = movesPanelHtml(def, selectingFor);
    shipPreview?.setShip(id);
    shipPreview?.resize();
    for (const btn of grid.querySelectorAll('.ship-card')) {
      btn.classList.toggle('previewing', (btn as HTMLElement).dataset.shipId === id);
    }
  }
}

function renderOnline(): void {
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Online'));
  shell.append(
    el('p', 'tagline', `Fleet: ${fleetLabel(fleet0)}`),
  );
  const panel = el('div', 'panel');
  const cols = el('div', 'cols');

  const left = el('div');
  left.append(el('p', 'tagline', 'Host a series'));
  const hostBtn = el('button', 'primary', 'Create Room');
  hostBtn.onclick = () => beginOnline('create');
  left.append(hostBtn);

  const right = el('div');
  right.append(el('p', 'tagline', 'Join a series'));
  const field = el('label', 'field');
  field.innerHTML = 'Room code';
  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.maxLength = 4;
  codeInput.placeholder = 'ABCD';
  codeInput.value = onlineCode;
  field.append(codeInput);
  const joinBtn = el('button', '', 'Join Room');
  joinBtn.onclick = () => {
    onlineCode = codeInput.value.trim().toUpperCase();
    beginOnline('join');
  };
  const joinRow = el('div', 'row');
  joinRow.append(joinBtn);
  right.append(field, joinRow);

  cols.append(left, right);
  panel.append(cols);

  const status = el('div', `status${onlineError ? ' err' : ''}`);
  status.textContent = onlineError || onlineStatus || 'Connecting to match server…';
  panel.append(status);

  if (onlineCode && !onlineError) {
    panel.append(
      el(
        'div',
        'hint',
        `Room <strong>${onlineCode}</strong> · You are P${onlineSlot + 1}. Waiting for opponent…`,
      ),
    );
  }

  const back = el('button', '', 'Back');
  back.onclick = () => {
    onlineClient?.disconnect();
    onlineClient = null;
    onlineCode = '';
    onlineError = '';
    onlineStatus = '';
    screen = 'shipselect';
    renderUI();
  };
  const brow = el('div', 'row');
  brow.style.marginTop = '16px';
  brow.append(back);
  panel.append(brow);

  shell.append(panel);
  app.append(shell);
}

function beginOnline(kind: 'create' | 'join'): void {
  onlineError = '';
  onlineStatus = 'Connecting…';
  onlineClient?.disconnect();
  onlineClient = new OnlineClient();
  onlineClient.connect({
    onStatus: (s) => {
      onlineStatus = s;
      if (screen === 'online') renderUI();
    },
    onError: (m) => {
      onlineError = m;
      onlineStatus = '';
      if (screen === 'online') renderUI();
    },
    onRoom: (code, slot) => {
      onlineCode = code;
      onlineSlot = slot;
      onlineStatus = `In room ${code}`;
      onlineClient?.ready();
      if (screen === 'online') renderUI();
    },
    onStart: (info) => {
      fleet0 = info.fleets[0];
      fleet1 = info.fleets[1];
      onlineYou = info.you;
      localQueue.clear();
      remoteQueue.clear();
      startSeries(info.seed);
    },
    onPeerInput: (tick, bits) => {
      if (pickPhase || (fightResolved && ladder?.seriesWinner === null)) {
        pendingRemoteQueue.set(tick, bits);
      } else {
        remoteQueue.set(tick, bits);
      }
    },
    onPeerPick: (index) => {
      if (!ladder) return;
      const peerSide = (onlineYou === 0 ? 1 : 0) as 0 | 1;
      if (!ladder.needsPick[peerSide]) return;
      selectShip(ladder, peerSide, index);
      sound.ui();
      refreshPickOverlay();
      tryStartFightFromPicks();
    },
    onPeerLeft: () => {
      pausedOnline = true;
      onlineError = 'Opponent disconnected';
    },
    onRematchStart: (seed) => {
      onlineRematchPending = false;
      localQueue.clear();
      remoteQueue.clear();
      pendingRemoteQueue.clear();
      startSeries(seed);
    },
  });

  if (kind === 'create') {
    onlineClient.create(fleet0);
  } else {
    if (!onlineCode) {
      onlineError = 'Enter a room code';
      renderUI();
      return;
    }
    onlineClient.join(onlineCode, fleet0);
  }
  renderUI();
}

function startAivsaiSeries(): void {
  fleet0 = randomFleet();
  fleet1 = randomFleet();
  // Avoid identical fleets for cleaner matchup data
  let guard = 0;
  while (fleet0.join() === fleet1.join() && guard++ < 8) {
    fleet1 = randomFleet();
  }
  startSeries();
}



function renderUnlocks(): void {
  career = loadCareer();
  const prog = progressFromCareer(career);
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Unlocks'));
  shell.append(
    el(
      'p',
      'tagline',
      `Start with 6 scrapheaps · unlock the rest · ${unlockedShips(prog).length}/20 open`,
    ),
  );
  const panel = el('div', 'panel');
  panel.append(
    el(
      'div',
      'climb-card',
      `<h3>Starter Six</h3><p>${STARTER_SHIPS.map((id) => SHIPS[id].name).join(' · ')}</p>`,
    ),
  );
  const table = el('div', 'stats-table unlocks-table');
  table.innerHTML = `
    <div class="stats-row head">
      <span>Goal</span><span>Reward</span><span>Progress</span><span></span>
    </div>
  `;
  for (const ach of ACHIEVEMENTS) {
    const done = ach.done(prog);
    const { cur, need } = ach.progress(prog);
    const row = el('div', `stats-row${done ? ' hot' : ''}`);
    row.innerHTML = `
      <span><strong>${ach.title}</strong><br/><em>${ach.desc}</em></span>
      <span style="color:${SHIPS[ach.unlocks].color}">${SHIPS[ach.unlocks].name}</span>
      <span>${Math.min(cur, need)}/${need}</span>
      <span>${done ? 'OPEN' : 'LOCKED'}</span>
    `;
    table.append(row);
  }
  panel.append(table);
  const row = el('div', 'row');
  const back = el('button', '', 'Back');
  back.onclick = () => {
    screen = 'title';
    renderUI();
  };
  const preview = el('button', 'primary', 'Preview Unpacking');
  preview.onclick = () => {
    void sound.unlock();
    sound.ui();
    const locked = ACHIEVEMENTS.find((a) => !a.done(prog));
    const sample = locked ?? ACHIEVEMENTS[0]!;
    startUnlockCeremony(sample, { preview: true });
  };
  row.append(back, preview);
  panel.append(row);
  shell.append(panel);
  app.append(shell);
}

function renderClips(): void {
  const clips = loadClips();
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Clip Vault'));
  shell.append(
    el('p', 'tagline', `${clips.length} saved kill cams · copy to share`),
  );
  const panel = el('div', 'panel');
  if (clips.length === 0) {
    panel.append(
      el(
        'p',
        'hint',
        'No clips yet. Land a kill in battle and the yard auto-saves the replay.',
      ),
    );
  } else {
    for (const clip of clips) {
      const card = el('div', 'climb-card');
      const spark = clip.victimHp
        .map((h) => {
          const bars = Math.round(h * 8);
          return '▁▂▃▄▅▆▇█'[Math.min(7, bars)] ?? '▁';
        })
        .join('');
      card.innerHTML = `
        <h3>${clip.killer} → ${clip.victim}</h3>
        <p><em>${clip.signature}</em></p>
        <p class="muted">${clip.subtitle} · ${clip.durationSec.toFixed(1)}s</p>
        <p class="muted spark">${spark}</p>
        <p class="muted">${new Date(clip.createdAt).toLocaleString()}</p>
      `;
      const copyBtn = el('button', '', 'Copy Share Text');
      copyBtn.onclick = async () => {
        const ok = await copyClip(clip);
        flashCallout(ok ? 'CLIP COPIED' : 'SEE CONSOLE', 1.0);
        sound.ui();
      };
      card.append(copyBtn);
      if (clip.id === lastSavedClipId) {
        card.append(el('p', 'hint', 'Latest save from your last bout'));
      }
      panel.append(card);
    }
  }
  const back = el('button', '', 'Back');
  back.onclick = () => {
    screen = 'title';
    renderUI();
  };
  panel.append(back);
  shell.append(panel);
  app.append(shell);
}

function renderLocker(): void {
  career = loadCareer();
  season = loadSeason();
  cosmetics = syncCosmeticUnlocks(cosmetics, career, season.mmr);
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Vanity Locker'));
  shell.append(
    el('p', 'tagline', 'Trails and titles earned from yard nonsense'),
  );
  const panel = el('div', 'panel');

  panel.append(el('h3', '', 'Engine Trails'));
  const trailGrid = el('div', 'row');
  for (const trail of Object.keys(TRAIL_COLORS) as TrailId[]) {
    const unlocked = cosmetics.unlockedTrails.includes(trail);
    const btn = el(
      'button',
      `${cosmetics.trail === trail ? 'primary' : ''}${unlocked ? '' : ' disabled'}`,
      trail.toUpperCase(),
    );
    btn.disabled = !unlocked;
    btn.style.borderColor = TRAIL_COLORS[trail];
    btn.onclick = () => {
      cosmetics = setTrail(cosmetics, trail);
      sound.ui();
      renderUI();
    };
    trailGrid.append(btn);
  }
  panel.append(trailGrid);

  panel.append(el('h3', '', 'Pilot Titles'));
  const titleGrid = el('div', 'row');
  for (const title of Object.keys(TITLE_LABEL) as TitleId[]) {
    const unlocked = cosmetics.unlockedTitles.includes(title);
    const btn = el(
      'button',
      `${cosmetics.title === title ? 'primary' : ''}${unlocked ? '' : ' disabled'}`,
      TITLE_LABEL[title],
    );
    btn.disabled = !unlocked;
    btn.onclick = () => {
      cosmetics = setTitle(cosmetics, title);
      sound.ui();
      renderUI();
    };
    titleGrid.append(btn);
  }
  panel.append(titleGrid);

  if (cosmetics.victoryPose) {
    panel.append(el('p', 'hint', 'Victory pose unlocked - flex on kill cams.'));
  }

  const back = el('button', '', 'Back');
  back.onclick = () => {
    screen = 'title';
    renderUI();
  };
  panel.append(back);
  shell.append(panel);
  app.append(shell);
}

function renderSeason(): void {
  season = loadSeason();
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Season Board'));
  shell.append(el('p', 'tagline', `Week ${season.season} ranked ladder`));
  const panel = el('div', 'panel');
  const rank = rankForMmr(season.mmr);
  const card = el('div', 'climb-card');
  card.innerHTML = `
    <h3>${rank}</h3>
    <p>MMR <strong>${season.mmr}</strong> · Peak <strong>${season.peakMmr}</strong></p>
    <p>This week <strong>${season.wins}W</strong> / <strong>${season.losses}L</strong></p>
    <p class="muted">Ranked and weekly wins move MMR. New weeks soft-decay rating.</p>
  `;
  panel.append(card);

  const weekly = weeklyModeFor();
  const wk = el('div', 'climb-card');
  wk.innerHTML = `
    <h3>Mode of the Week · ${weekly.name}</h3>
    <p>${weekly.blurb}</p>
  `;
  panel.append(wk);

  const back = el('button', '', 'Back');
  back.onclick = () => {
    screen = 'title';
    renderUI();
  };
  panel.append(back);
  shell.append(panel);
  app.append(shell);
}

function countsForCareer(): boolean {
  return (
    mode === 'vsai' ||
    mode === 'climb' ||
    mode === 'tutorial' ||
    mode === 'online' ||
    mode === 'local2p' ||
    mode === 'weekly' ||
    mode === 'ranked'
  );
}

function noteCareerSeries(won: boolean): void {
  if (!countsForCareer()) return;
  const before = progressFromCareer(career);
  career = recordSeriesCareer(career, won, bestStreak);
  const after = progressFromCareer(career);
  queueUnlockCeremony(freshUnlocks(before, after));
  void syncCareerToServer(career);
}

function noteBoutProgress(info: { kill?: boolean; boutStreak?: number }): void {
  if (!countsForCareer()) return;
  const before = progressFromCareer(career);
  career = recordBoutCareerProgress(career, info);
  const after = progressFromCareer(career);
  queueUnlockCeremony(freshUnlocks(before, after));
}

function queueUnlockCeremony(list: AchievementDef[]): void {
  for (const ach of list) {
    if (
      unlockQueue.some((a) => a.id === ach.id) ||
      (unlockPhase !== 'idle' &&
        unlockOverlay?.dataset.achId === ach.id)
    ) {
      continue;
    }
    unlockQueue.push(ach);
  }
}

function clearUnlockTimers(): void {
  for (const id of unlockTimers) window.clearTimeout(id);
  unlockTimers = [];
}

function disposeUnlockCeremony(): void {
  clearUnlockTimers();
  unlockPreview?.dispose();
  unlockPreview = null;
  unlockOverlay?.remove();
  unlockOverlay = null;
  unlockPhase = 'idle';
}

function isUnlockCeremonyActive(): boolean {
  return unlockPhase !== 'idle';
}

/** Start next unlock scene if queued. Returns true if a ceremony is running/started. */
function tryPresentUnlocks(resume: 'bout' | 'series' | null = null): boolean {
  if (resume) unlockResume = resume;
  if (isUnlockCeremonyActive()) return true;
  if (unlockQueue.length === 0) return false;
  if (killCam) return false;
  const next = unlockQueue.shift()!;
  startUnlockCeremony(next);
  return true;
}

function finishUnlockResume(): void {
  if (unlockPreviewOnly) {
    disposeUnlockCeremony();
    unlockPreviewOnly = false;
    unlockResume = null;
    if (screen === 'unlocks' || screen === 'title') renderUI();
    return;
  }
  const resume = unlockResume;
  disposeUnlockCeremony();
  if (unlockQueue.length > 0) {
    tryPresentUnlocks(resume);
    return;
  }
  unlockResume = null;
  if (resume === 'bout' && ladder && ladder.seriesWinner === null) {
    intermissionTimer = mode === 'aivsai' ? 0.35 : 0.55;
    intermissionText =
      mode === 'aivsai' ? 'NEXT SCRAPHEAP INCOMING' : 'BACK TO THE YARD';
  }
}

function startUnlockCeremony(
  ach: AchievementDef,
  opts?: { preview?: boolean },
): void {
  disposeUnlockCeremony();
  hidePickOverlay();
  intermissionTimer = 0;
  intermissionText = null;
  unlockPreviewOnly = !!opts?.preview;
  unlockPhase = 'crate';

  const wrap = document.body;
  const overlay = el('div', 'unlock-ceremony');
  overlay.dataset.achId = ach.id;
  unlockOverlay = overlay;

  const ship = SHIPS[ach.unlocks];
  const verb = shipVerb(ach.unlocks);
  const motif = shipMotif(ach.unlocks);

  const stage = el('div', 'unlock-stage');
  const eyebrow = el('p', 'unlock-eyebrow', 'SCRAP CRATE INCOMING');
  const title = el('h2', 'unlock-title', 'Something rattling in the junk');
  const crate = el('div', 'unlock-crate');
  crate.innerHTML = `
    <div class="crate-lid"></div>
    <div class="crate-body">
      <span class="crate-stamp">SEALED</span>
      <span class="crate-mark">?</span>
    </div>
    <div class="crate-glow"></div>
  `;
  const hint = el('p', 'unlock-hint', 'Tap / click to crack it open');
  const sparkHost = el('div', 'unlock-sparks');
  for (let i = 0; i < 18; i++) {
    const s = el('span', 'unlock-spark');
    s.style.setProperty('--i', String(i));
    s.style.setProperty('--a', `${(i / 18) * 360}deg`);
    sparkHost.append(s);
  }

  const reveal = el('div', 'unlock-reveal');
  reveal.hidden = true;
  const canvas = document.createElement('canvas');
  canvas.className = 'unlock-ship-canvas';
  const nameEl = el('h2', 'unlock-ship-name', ship.name);
  nameEl.style.color = ship.color;
  const verbEl = el('div', 'unlock-verb', verb);
  verbEl.style.borderColor = ship.accent;
  verbEl.style.color = ship.accent;
  const achEl = el(
    'p',
    'unlock-ach',
    `<strong>${ach.title}</strong> · ${ach.desc}`,
  );
  const motifEl = el('p', 'unlock-motif', motif);
  const claim = el(
    'button',
    'primary unlock-claim',
    unlockPreviewOnly ? 'NICE · CLOSE' : 'CLAIM THIS WEIRDO',
  );
  const more =
    !unlockPreviewOnly && unlockQueue.length > 0
      ? el(
          'p',
          'unlock-more',
          `+${unlockQueue.length} more crate${unlockQueue.length > 1 ? 's' : ''} waiting`,
        )
      : null;

  reveal.append(canvas, nameEl, verbEl, achEl, motifEl, claim);
  if (more) reveal.append(more);

  stage.append(eyebrow, title, crate, hint, sparkHost, reveal);
  overlay.append(stage);
  wrap.append(overlay);

  void sound.unlock();
  sound.crateRattle();
  world3d?.addShake(4);

  const openCrate = () => {
    if (unlockPhase !== 'crate') return;
    unlockPhase = 'reveal';
    clearUnlockTimers();
    crate.classList.add('cracking');
    overlay.classList.add('revealed');
    sound.unlockFanfare(ach.unlocks);
    world3d?.addShake(16);
    if (!unlockPreviewOnly) {
      flashCallout(`UNLOCKED ${ship.name.toUpperCase()}`, 2.0);
    }

    const tid = window.setTimeout(() => {
      crate.hidden = true;
      hint.hidden = true;
      title.textContent = unlockPreviewOnly
        ? 'PREVIEW UNPACK'
        : 'NEW SCRAPHEAP UNLOCKED';
      eyebrow.textContent = unlockPreviewOnly ? 'VANITY DEMO' : 'FLEET EXPANSION';
      reveal.hidden = false;
      sparkHost.classList.add('burst');
      unlockPreview?.dispose();
      unlockPreview = new ShipPreview(canvas);
      unlockPreview.setDrama(true);
      unlockPreview.setShip(ach.unlocks);
      unlockPreview.resize();
    }, 420);
    unlockTimers.push(tid);
  };

  crate.onclick = openCrate;
  overlay.onclick = (e) => {
    if (unlockPhase === 'crate' && e.target !== claim) openCrate();
  };
  claim.onclick = (e) => {
    e.stopPropagation();
    sound.pick();
    finishUnlockResume();
  };

  // Auto-open after a short tease so it feels authored, not idle
  unlockTimers.push(window.setTimeout(openCrate, 1600));
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      if (unlockPhase === 'crate') openCrate();
      else claim.click();
    }
    if (e.code === 'Escape' && unlockPreviewOnly) {
      e.preventDefault();
      finishUnlockResume();
    }
  };
  overlay.tabIndex = 0;
  overlay.focus();
  overlay.addEventListener('keydown', onKey);
}

async function renderPlayers(): Promise<void> {
  career = loadCareer();
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Yard Hall'));
  shell.append(
    el(
      'p',
      'tagline',
      'Every pilot who has rumble-synced · played · wins · best streak',
    ),
  );
  const panel = el('div', 'panel');
  const you = el('div', 'climb-card');
  const wr = Math.round(winRate(career) * 100);
  you.innerHTML = `
    <h3>You · ${career.name}</h3>
    <p>Played ${career.played} · Won ${career.wins} · Lost ${career.losses} · ${wr}%</p>
    <p>Best bout streak ${career.bestStreak} · Best series streak ${career.bestSeriesStreak} · Live series streak ${career.seriesStreak}</p>
  `;
  panel.append(you);
  panel.append(el('p', 'hint', 'Loading shared board…'));
  const back = el('button', '', 'Back');
  back.onclick = () => {
    screen = 'title';
    renderUI();
  };
  const sync = el('button', 'primary', 'Sync My Stats');
  sync.onclick = async () => {
    await syncCareerToServer(career);
    screen = 'players';
    renderUI();
  };
  const row = el('div', 'row');
  row.append(back, sync);
  panel.append(row);
  shell.append(panel);
  app.append(shell);

  leaderboard = await fetchLeaderboard();
  if (screen !== 'players') return;
  // Ensure local pilot appears even if server is empty/offline
  if (!leaderboard.some((p) => p.playerId === career.playerId) && career.played > 0) {
    leaderboard = [
      {
        playerId: career.playerId,
        name: career.name,
        played: career.played,
        wins: career.wins,
        losses: career.losses,
        bestStreak: career.bestStreak,
        seriesStreak: career.seriesStreak,
        bestSeriesStreak: career.bestSeriesStreak,
        updatedAt: career.updatedAt,
      },
      ...leaderboard,
    ];
  }
  leaderboard.sort((a, b) => b.wins - a.wins || b.bestStreak - a.bestStreak || b.played - a.played);

  panel.querySelector('.hint')?.remove();
  const table = el('div', 'stats-table players-table');
  table.innerHTML = `
    <div class="stats-row head">
      <span>#</span><span>Pilot</span><span>Played</span><span>Won</span><span>Win%</span><span>Best streak</span>
    </div>
  `;
  if (leaderboard.length === 0) {
    panel.insertBefore(
      el('p', 'hint', 'No shared pilots yet. Finish a series, then Sync. Others appear when they play on this server.'),
      row,
    );
  } else {
    leaderboard.forEach((p, i) => {
      const rate = p.played > 0 ? Math.round((p.wins / p.played) * 100) : 0;
      const mine = p.playerId === career.playerId ? ' mine' : '';
      const r = el('div', `stats-row${mine}`);
      r.innerHTML = `
        <span>${i + 1}</span>
        <span>${p.name}${mine ? ' (you)' : ''}</span>
        <span>${p.played}</span>
        <span>${p.wins}</span>
        <span>${rate}%</span>
        <span>${p.bestStreak}</span>
      `;
      table.append(r);
    });
    panel.insertBefore(table, row);
  }
}

function renderStats(): void {

  balanceStats = loadBalanceStats();
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Balance Lab'));
  shell.append(
    el(
      'p',
      'tagline',
      `CPU match data · ${balanceStats.matches} bouts recorded`,
    ),
  );
  const panel = el('div', 'panel');
  if (balanceStats.matches >= 8) {
    const pulse = el('div', 'hint balance-pulse');
    pulse.innerHTML = balancePulse(balanceStats)
      .map((line) => `<p>${line}</p>`)
      .join('');
    panel.append(pulse);
  }
  const ranked = rankedShips(balanceStats).filter((r) => r.row.fights > 0);
  if (ranked.length === 0) {
    panel.append(
      el(
        'p',
        'hint',
        'No data yet. Run <strong>CPU vs CPU</strong> and let bots farm matchups for you.',
      ),
    );
  } else {
    const table = el('div', 'stats-table');
    table.innerHTML = `
      <div class="stats-row head">
        <span>Ship</span><span>Win%</span><span>W/L/D</span><span>n</span><span>Dmg/F</span><span>Avg t</span>
      </div>
    `;
    for (const r of ranked) {
      const name = SHIPS[r.id].name;
      const avgDmg =
        r.row.fights > 0 ? Math.round(r.row.damageDealt / r.row.fights) : 0;
      const avgT =
        r.row.fights > 0 ? (r.row.fightTicks / r.row.fights).toFixed(1) : '0';
      const row = el('div', 'stats-row');
      const hot = r.rate >= 0.58 ? ' hot' : r.rate <= 0.42 && r.row.fights >= 5 ? ' cold' : '';
      row.className = `stats-row${hot}`;
      row.innerHTML = `
        <span style="color:${SHIPS[r.id].color}">${name}</span>
        <span>${(r.rate * 100).toFixed(0)}%</span>
        <span>${r.row.wins}/${r.row.losses}/${r.row.draws}</span>
        <span>${r.row.fights}</span>
        <span>${avgDmg}</span>
        <span>${avgT}s</span>
      `;
      table.append(row);
    }
    panel.append(table);
    panel.append(
      el(
        'p',
        'hint',
        'Hot = possibly overtuned (≥58%). Cold = possibly weak (≤42%, n≥5). Use CPU vs CPU to grow the sample.',
      ),
    );
  }
  const row = el('div', 'row');
  const back = el('button', '', 'Back');
  back.onclick = () => {
    screen = 'title';
    renderUI();
  };
  const run = el('button', 'primary', 'Farm CPU Matches');
  run.onclick = () => {
    mode = 'aivsai';
    startAivsaiSeries();
  };
  const wipe = el('button', '', 'Reset Stats');
  wipe.onclick = () => {
    if (!confirm('Wipe all balance stats?')) return;
    balanceStats = resetBalanceStats();
    renderUI();
  };
  const copy = el('button', '', 'Copy Report');
  copy.onclick = () => {
    const text = balanceReport(loadBalanceStats());
    void navigator.clipboard.writeText(text).then(
      () => flashCallout('COPIED', 0.8),
      () => {
        console.log(text);
        flashCallout('SEE CONSOLE', 0.8);
      },
    );
  };
  row.append(back, run, copy, wipe);
  panel.append(row);
  shell.append(panel);
  app.append(shell);
}

function startArenaBrawl(seed = (Math.random() * 0xffffffff) | 0): void {
  cancelAnimationFrame(raf);
  disposeUnlockCeremony();
  unlockQueue = [];
  unlockResume = null;
  const format = mode as ArenaFormat;
  const humanShip = fleet0[0] ?? 'solhammer';
  arenaSlots = buildCpuFilledSlots(format, humanShip, cpuShipPool(), 0);
  seriesSeed = seed;
  seriesPlanet = planetFromSeed(seed);
  ladder = null;
  pickPhase = false;
  fightResolved = false;
  boutStreak = 0;
  bestStreak = 0;
  combo = 0;
  comboTimer = 0;
  style = 0;
  bestCombo = 0;
  shipsKilled = 0;
  damageDealt = 0;
  firstBlood = false;
  intermissionTimer = 0;
  intermissionText = null;
  floats = [];
  credits = [45, 45];
  boutPurse = 0;
  boutDamage = 0;
  boutComboPeak = 0;
  boutStylePeak = 0;
  boutDamageBySide = [0, 0];
  upgrades = [cloneUpgrades(EMPTY_UPGRADES), cloneUpgrades(EMPTY_UPGRADES)];
  shopBets = [{ ...EMPTY_BETS }, { ...EMPTY_BETS }];
  matchupLine = null;
  matchupLineLife = 0;
  deathDebrief = null;
  hpHistory = [];
  spectatorChips = [];
  callout = null;
  calloutLife = 0;
  killBuffer = [];
  killCam = null;
  onlineRematchPending = false;
  sim = createArenaSim(format, arenaSlots, seed, {
    planet: seriesPlanet,
    mapHint,
  });
  screen = 'battle';
  renderUI();
  requestAnimationFrame(() => {
    if (!canvas || !hudCanvas || !sim) return;
    world3d?.dispose();
    world3d = new World3D(canvas);
    world3d.setArenaMood(sim.map, TRAIL_COLORS[cosmetics.trail]);
    world3d.resetTracking(sim);
    applyGraphicsToWorld();
    fpsMonitor.reset();
    const ctx = hudCanvas.getContext('2d')!;
    renderer = new Renderer(ctx);
    accum = 0;
    lastTs = performance.now();
    prevHp = sim.ships.map((s) => s.hp);
    prevAlive = sim.ships.map(() => true);
    prevProjCount = 0;
    prevWinner = null;
    hidePickOverlay();
    sound.setTheme(humanShip);
    sound.setIntensity(0.32);
    beginMatchIntro();
    loop(lastTs);
  });
}

function startSeries(seed = (Math.random() * 0xffffffff) | 0): void {
  cancelAnimationFrame(raf);
  disposeUnlockCeremony();
  unlockQueue = [];
  unlockResume = null;
  seriesSeed = seed;
  seriesPlanet = planetFromSeed(seed);
  ladder = createLadder(fleet0, fleet1);
  fightResolved = false;
  pickPhase = false;
  pausedOnline = false;
  localQueue.clear();
  remoteQueue.clear();
  pendingRemoteQueue.clear();
  boutStreak = 0;
  bestStreak = 0;
  combo = 0;
  comboTimer = 0;
  style = 0;
  bestCombo = 0;
  shipsKilled = 0;
  damageDealt = 0;
  firstBlood = false;
  intermissionTimer = 0;
  intermissionText = null;
  countdown = 0;
  matchIntroMeta = null;
  matchIntroElapsed = 0;
  floats = [];
  credits = [45, 45];
  boutPurse = 0;
  boutDamage = 0;
  boutComboPeak = 0;
  boutStylePeak = 0;
  boutDamageBySide = [0, 0];
  aivsaiAutoTimer = 0;
  upgrades = [cloneUpgrades(EMPTY_UPGRADES), cloneUpgrades(EMPTY_UPGRADES)];
  shopBets = [{ ...EMPTY_BETS }, { ...EMPTY_BETS }];
  matchupLine = null;
  matchupLineLife = 0;
  deathDebrief = null;
  hpHistory = [];
  spectatorChips = [];
  spectatorChipTimer = 0;
  if (mode !== 'tutorial') tutorial = createTutorial(false);
  if (mode === 'tutorial') teachPressure = 0;
  if (quickplayBo3) quickplayScore = [0, 0];
  callout = null;
  calloutLife = 0;
  killBuffer = [];
  killCam = null;
  onlineRematchPending = false;
  // Backdrop sim until openers are chosen
  sim = createSim(fleet0[0], fleet1[0], seed, {
    planet: seriesPlanet,
    mapHint,
  });
  screen = 'battle';
  renderUI();
  requestAnimationFrame(() => {
    if (!canvas || !hudCanvas) return;
    world3d?.dispose();
    world3d = new World3D(canvas);
    if (sim) world3d.setArenaMood(sim.map, TRAIL_COLORS[cosmetics.trail]);
    applyGraphicsToWorld();
    fpsMonitor.reset();
    const ctx = hudCanvas.getContext('2d')!;
    renderer = new Renderer(ctx);
    accum = 0;
    lastTs = performance.now();
    prevHp = [sim!.ships[0].hp, sim!.ships[1].hp];
    prevAlive = [true, true];
    prevProjCount = 0;
    prevWinner = null;
    enterPickPhase();
    loop(lastTs);
  });
}

function beginFight(): void {
  if (!ladder || !bothPicked(ladder)) return;
  const next = nextFightShips(ladder);
  const seed = (seriesSeed + ladder.fight * 7919) >>> 0;
  sim = createSim(next.ship0, next.ship1, seed, {
    hp0: next.hp0,
    hp1: next.hp1,
    fullHeal0: ladder.carryHp[0] === null,
    fullHeal1: ladder.carryHp[1] === null,
    planet: seriesPlanet ?? planetFromSeed(seriesSeed),
    upgrades,
    mapHint,
  });
  fightResolved = false;
  pickPhase = false;
  hidePickOverlay();
  world3d?.resetTracking(sim);
  world3d?.setArenaMood(sim.map, TRAIL_COLORS[cosmetics.trail]);
  localQueue.clear();
  remoteQueue.clear();
  for (const [t, bits] of pendingRemoteQueue) {
    remoteQueue.set(t, bits);
  }
  pendingRemoteQueue.clear();
  accum = 0;
  boutPurse = 0;
  boutDamage = 0;
  boutComboPeak = 0;
  boutStylePeak = 0;
  boutDamageBySide = [0, 0];
  const themeShip =
    mode === 'online'
      ? onlineYou === 0
        ? next.ship0
        : next.ship1
      : next.ship0;
  sound.setTheme(themeShip);
  sound.setIntensity(0.32);
  prevHp = [sim.ships[0].hp, sim.ships[1].hp];
  prevAlive = [true, true];
  prevProjCount = 0;
  prevWinner = null;
  heardEffects.clear();
  combo = 0;
  comboTimer = 0;
  style = Math.max(0, style * 0.35);
  firstBlood = false;
  floats = [];
  hitStop = 0;
  fpsMonitor.reset();
  applyGraphicsToWorld();
  beginMatchIntro();
  killBuffer = [];
  killCam = null;
  hpHistory = [];
  deathDebrief = null;
  matchupLine = matchupCallout(balanceStats, next.ship0, next.ship1);
  matchupLineLife = matchupLine ? 4.5 : 0;
  if (matchupLine) flashCallout(matchupLine, 1.6);
  spectatorChips = [];
  if (mode === 'aivsai') {
    spectatorChips.push(
      `${SHIPS[next.ship0].name} (${shipVerb(next.ship0)}) vs ${SHIPS[next.ship1].name} (${shipVerb(next.ship1)})`,
    );
  }
  if (mode === 'tutorial' && ladder.fight === 1) {
    flashCallout('SCHOOL IS IN', 1.4);
  }
  if (sim.map?.label) {
    flashCallout(sim.map.label, 1.2);
  }
  if (quickplayBo3) {
    flashCallout(
      `BO3 · ${quickplayScore[0]}-${quickplayScore[1]}`,
      1.0,
    );
  }
}

function applyGraphicsToWorld(): void {
  world3d?.setGraphicsConfig(graphicsConfig);
}

function publishPerfAdvice(): void {
  const snap = fpsMonitor.snapshot();
  if (snap.samples < 30) return;
  const advice = buildPerfAdvice(snap, graphicsConfig);
  lastPerfAdvice = advice;
  perfAdviceLife = 7.5;
  if (advice.changed.length) {
    graphicsConfig = advice.suggested;
    saveGraphicsConfig(graphicsConfig);
    applyGraphicsToWorld();
    const offs = advice.advice
      .filter((a) => a.action === 'disable')
      .map((a) => a.label)
      .slice(0, 3);
    const ons = advice.advice
      .filter((a) => a.action === 'enable')
      .map((a) => a.label)
      .slice(0, 3);
    if (offs.length) flashCallout(`GFX OFF · ${offs.join(' · ')}`, 1.8);
    else if (ons.length) flashCallout(`GFX ON · ${ons.join(' · ')}`, 1.8);
    else flashCallout(`GFX · ${advice.preset.toUpperCase()}`, 1.4);
  } else {
    flashCallout(
      `FPS ${snap.avg.toFixed(0)} · LO ${snap.min.toFixed(0)} · HI ${snap.max.toFixed(0)}`,
      1.5,
    );
  }
}

function beginMatchIntro(): void {
  if (!sim) return;
  const a = sim.ships[0];
  const b = sim.ships[1] ?? sim.ships[0];
  const human = isArenaBrawl() ? humanArenaSlot() : humanSide();
  const you = sim.ships[human] ?? a;
  const foe =
    sim.ships.find((s) => s !== you && (you ? isHostile(you, s) : true)) ?? b;

  let eventTitle = 'SCRAP RUMBLE';
  let stakeLine = ladder ? `BOUT ${ladder.fight} · WINNER STAYS` : 'WINNER STAYS · DIGNITY LEAVES';
  let leftName = SHIPS[you?.shipId ?? a!.shipId].name;
  let rightName = SHIPS[foe?.shipId ?? b!.shipId].name;
  let leftColor = SHIPS[you?.shipId ?? a!.shipId].color;
  let rightColor = SHIPS[foe?.shipId ?? b!.shipId].color;
  let leftTag = mode === 'local2p' ? 'P1' : 'YOU';
  let rightTag =
    mode === 'local2p' ? 'P2' : mode === 'aivsai' ? 'CPU B' : 'CPU';

  if (mode === 'teams2v2') {
    eventTitle = 'TEAM SCUFFLE';
    stakeLine = '2v2 · FRIENDLY FIRE OFF · FILL THE GRAVE';
    leftName = 'ALPHA';
    rightName = 'BRAVO';
    leftColor = '#7cf5c8';
    rightColor = '#ff8a5c';
    leftTag = 'YOUR SIDE';
    rightTag = 'THEM';
  } else if (mode === 'ffa20') {
    eventTitle = 'FREE FOR ALL';
    stakeLine = '20 SHIPS · LAST SCRAPHEAP STANDING';
    leftName = SHIPS[you!.shipId].name;
    rightName = 'THE FIELD';
    leftColor = SHIPS[you!.shipId].color;
    rightColor = '#ffe566';
    leftTag = 'YOU';
    rightTag = '19 CPU';
  } else if (mode === 'ranked') {
    eventTitle = 'RANKED CLIMB';
    stakeLine = `${rankForMmr(season.mmr)} · MMR ${season.mmr}`;
  } else if (mode === 'weekly') {
    eventTitle = 'MODE OF THE WEEK';
    stakeLine = weeklyModeFor().name.toUpperCase();
  } else if (mode === 'climb') {
    eventTitle = 'SCRAPYARD CLIMB';
    stakeLine = HOUSE_CHAPTERS[climbChapter]?.name?.toUpperCase() ?? 'THE YARD';
  } else if (mode === 'aivsai') {
    eventTitle = 'CPU SPECTACLE';
    leftTag = 'CPU A';
    rightTag = 'CPU B';
  } else if (mode === 'online') {
    eventTitle = 'ONLINE MAYHEM';
    leftTag = onlineYou === human ? 'YOU' : 'OPP';
    rightTag = onlineYou === human ? 'OPP' : 'YOU';
  }

  matchIntroMeta = {
    eventTitle,
    venue: sim.map?.label
      ? `LIVE · ${sim.map.label.toUpperCase()}`
      : 'LIVE · ORBITAL SCRAPYARD',
    leftName,
    rightName,
    leftColor,
    rightColor,
    leftTag,
    rightTag,
    stakeLine,
  };
  matchIntroElapsed = 0;
  countdown = MATCH_INTRO_DURATION;
  sound.setIntensity(0.55);
  sound.introBroadcast();
}

function flashCallout(text: string, life = 1.35): void {
  callout = text;
  calloutLife = life;
}

function pushFloat(
  x: number,
  y: number,
  text: string,
  color: string,
  life = 0.75,
): void {
  floats.push({ x, y, text, life, maxLife: life, color });
  if (floats.length > 24) floats.shift();
}

function humanSide(): 0 | 1 {
  if (isArenaBrawl()) return 0;
  return mode === 'online' ? onlineYou : 0;
}

function onArenaBrawlEnded(): void {
  if (!sim || fightResolved || sim.winner === null) return;
  fightResolved = true;
  publishPerfAdvice();
  const w = sim.winner;
  world3d?.addShake(22);
  const human = humanArenaSlot();
  const humanTeam = arenaSlots?.[human]?.team ?? null;
  const humanWon =
    w === human ||
    (sim.winnerTeam !== null && humanTeam !== null && sim.winnerTeam === humanTeam);

  if (w === -1) {
    flashCallout('EVERYONE EXPLODED', 1.6);
  } else if (mode === 'teams2v2') {
    if (humanWon) {
      boutStreak += 1;
      shipsKilled += 1;
      noteBoutProgress({ kill: true, boutStreak });
      sound.boutWin(boutStreak);
      flashCallout(sim.winnerTeam === 0 ? 'TEAM ALPHA WINS' : 'TEAM BRAVO WINS', 1.6);
      noteCareerSeries(true);
    } else {
      boutStreak = 0;
      flashCallout(sim.winnerTeam === 0 ? 'TEAM ALPHA WINS' : 'TEAM BRAVO WINS', 1.6);
      setTimeout(() => flashCallout('YOUR SIDE ATE DIRT', 1.2), 400);
      noteCareerSeries(false);
    }
  } else if (humanWon) {
    boutStreak += 1;
    shipsKilled += 1;
    noteBoutProgress({ kill: true, boutStreak });
    sound.boutWin(boutStreak);
    sound.taunt(sim.ships[w]?.shipId ?? sim.ships[0]!.shipId, true);
    flashCallout('LAST SCRAPHEAP STANDING', 1.7);
    noteCareerSeries(true);
  } else {
    boutStreak = 0;
    const champ = sim.ships[w];
    flashCallout(
      champ ? `${SHIPS[champ.shipId].name.toUpperCase()} WINS FFA` : 'FFA OVER',
      1.6,
    );
    noteCareerSeries(false);
  }

  intermissionText = 'Esc menu · Enter rematch (reshuffle CPU)';
  intermissionTimer = 2.2;
}

function onFightEnded(): void {
  if (!sim || fightResolved || sim.winner === null) return;
  if (isArenaBrawl()) {
    onArenaBrawlEnded();
    return;
  }
  if (!ladder) return;
  fightResolved = true;
  publishPerfAdvice();

  const w = sim.winner;
  world3d?.addShake(22);
  const human = humanSide();

  // Balance lab: record every bout with ship IDs + damage
  const ship0 = sim.ships[0].shipId;
  const ship1 = sim.ships[1].shipId;
  const duelWinner = (w === -1 || w === 0 || w === 1 ? w : -1) as -1 | 0 | 1;
  balanceStats = recordBout(balanceStats, {
    ship0,
    ship1,
    winner: duelWinner,
    damage0: boutDamageBySide[0],
    damage1: boutDamageBySide[1],
    durationSec: sim.tick * DT,
  });

  // Why-did-I-die strip for the human (or CPU A in spectator)
  const victimSide: 0 | 1 =
    w === -1 ? human : w === 0 ? 1 : 0;
  const killerSide: 0 | 1 = victimSide === 0 ? 1 : 0;
  if (w !== -1 && (mode === 'aivsai' || victimSide === human || mode === 'local2p')) {
    const samples =
      hpHistory.length > 4
        ? hpHistory.slice(-120)
        : [1, 0.8, 0.5, 0.2, 0];
    deathDebrief = {
      samples,
      killer: SHIPS[sim.ships[killerSide].shipId].name,
      victim: SHIPS[sim.ships[victimSide].shipId].name,
      life: 3.4,
    };
  }

  if (mode === 'aivsai' && w !== -1) {
    const dog = upsetUnderdog(balanceStats, ship0, ship1);
    if (dog !== null && dog === w) {
      spectatorChips.push('UPSET!');
      flashCallout('UPSET!', 1.5);
    } else {
      spectatorChips.push(
        `${SHIPS[sim.ships[w].shipId].name} takes it`,
      );
    }
  }

  // Finish purse from skill this bout (not fight length)
  boutPurse +=
    18 +
    boutComboPeak * 5 +
    boutStylePeak * 0.45 +
    Math.min(50, boutDamage * 0.08);

  if (w === -1) {
    boutStreak = 0;
    shipsKilled += 1;
    noteBoutProgress({ kill: true });
    const banked = Math.round(boutPurse * 0.5);
    credits[human] += banked;
    if (mode === 'local2p') credits[1] += Math.round(boutPurse * 0.25);
    flashCallout('DOUBLE KILL', 1.5);
    if (banked > 0) setTimeout(() => flashCallout(`+$${banked} SPLIT`, 1.1), 450);
  } else if (w === 0 || w === 1) {
    if (mode === 'aivsai') {
      sound.boutWin(1);
      sound.taunt(sim.ships[w].shipId, true);
      flashCallout(w === 0 ? 'CPU A TAKES IT' : 'CPU B TAKES IT', 1.2);
    } else {
      const winnerIsYou = mode === 'local2p' || w === human;
      if (w === human) {
        boutStreak += 1;
        shipsKilled += 1;
        if (boutStreak > bestStreak) bestStreak = boutStreak;
        noteBoutProgress({ kill: true, boutStreak });
        sound.boutWin(boutStreak);
        sound.taunt(sim.ships[w].shipId, true);
        if (boutStreak >= 4) flashCallout(`UNHINGED x${boutStreak}`, 1.6);
        else if (boutStreak === 3) flashCallout('HAT TRICK OF CHAOS', 1.5);
        else if (boutStreak === 2) flashCallout('ON A ROLL', 1.4);
        else flashCallout('SHIP GO BYE BYE', 1.3);
        style = Math.min(100, style + 18);
      } else if (mode === 'local2p') {
        boutStreak = 0;
        sound.boutWin(1);
        flashCallout(w === 0 ? 'P1 WINS BOUT' : 'P2 WINS BOUT', 1.3);
      } else {
        boutStreak = 0;
        flashCallout('OOF YOU LOST ONE', 1.3);
      }

      if (winnerIsYou) {
        const streakBonus =
          w === human ? 1 + Math.max(0, boutStreak - 1) * 0.12 : 1;
        const banked = Math.round(boutPurse * streakBonus);
        credits[w] += banked;
        if (banked > 0) setTimeout(() => flashCallout(`+$${banked} BANKED`, 1.2), 500);
      } else if (boutPurse > 0) {
        setTimeout(() => flashCallout('PURSE LOST', 1.0), 400);
      }
    }
  }
  // Shop bet resolution
  if (mode !== 'aivsai') {
    const sides: (0 | 1)[] =
      mode === 'local2p' ? [0, 1] : mode === 'online' ? [human] : [human];
    for (const side of sides) {
      const won = w === side;
      const res = resolveBetsOnBout(shopBets[side], credits[side], won);
      shopBets[side] = res.bets;
      credits[side] = res.credits;
      res.flashes.forEach((f, i) =>
        setTimeout(() => flashCallout(f, 1.1), 600 + i * 450),
      );
    }
  }

  if (mode === 'tutorial' && w === human) {
    climb = markTutorialDone(climb);
  }

  boutPurse = 0;
  boutDamage = 0;
  boutComboPeak = 0;

  boutStylePeak = 0;

  resolveFight(ladder, duelWinner, sim.ships[0].hp, sim.ships[1].hp);

  if (quickplayBo3 && (w === 0 || w === 1)) {
    quickplayScore[w]++;
    if (quickplayScore[w] >= 2 && ladder.seriesWinner === null) {
      ladder.seriesWinner = w;
    }
  }

  if (ladder.seriesWinner !== null) {
    pickPhase = false;
    hidePickOverlay();
    if (mode === 'ranked' || mode === 'weekly') {
      season = recordRankedResult(season, ladder.seriesWinner === human);
    }
    cosmetics = syncCosmeticUnlocks(cosmetics, career, season.mmr);
    if (mode === 'aivsai') {
      flashCallout(
        ladder.seriesWinner === 0 ? 'CPU A WINS FLEET' : 'CPU B WINS FLEET',
        1.6,
      );
      aivsaiAutoTimer = 2.4;
    } else if (ladder.seriesWinner === human) {
      flashCallout('FLEET VICTORY', 2.2);
      if (mode === 'climb' || mode === 'vsai' || mode === 'tutorial') {
        climb = recordSeriesResult(climb, true, bestStreak);
        if (mode === 'climb') {
          climb = clearChapter(climb, climbChapter);
          const nxt = nextRank(climb.xp);
          flashCallout(
            nxt ? `${rankForXp(climb.xp).title} · next ${nxt.title}` : 'YARD LEGEND',
            2.0,
          );
        }
      }
      if (mode === 'ranked' || mode === 'weekly') {
        flashCallout(`${rankForMmr(season.mmr)} · MMR ${season.mmr}`, 2.0);
      }
      noteCareerSeries(true);
    } else {
      flashCallout('FLEET DEFEATED', 2.0);
      if (mode === 'climb' || mode === 'vsai') {
        climb = recordSeriesResult(climb, false, 0);
      }
      if (mode === 'ranked' || mode === 'weekly') {
        flashCallout(`${rankForMmr(season.mmr)} · MMR ${season.mmr}`, 2.0);
      }
      noteCareerSeries(false);
    }
    // Celebrate unlocks before the rematch prompt
    if (tryPresentUnlocks('series')) return;
    return;
  }

  // Bout unlocks (kills / hat tricks) get the crate before the next pick
  if (tryPresentUnlocks('bout')) return;

  intermissionText =
    mode === 'aivsai'
      ? w === -1
        ? 'BOTH CPUS EXPLODED'
        : 'NEXT SCRAPHEAP INCOMING'
      : w === human
        ? 'WINNER STAYS LOOKING SMUG'
        : w === -1
          ? 'EVERYONE EXPLODED'
          : 'SEND IN THE NEXT CLOWN';
  intermissionTimer = mode === 'aivsai' ? 0.55 : 0.85;
}

function enterPickPhase(): void {
  if (!ladder || ladder.seriesWinner !== null) return;
  if (tryPresentUnlocks('bout')) return;
  pickPhase = true;

  // AI auto-picks when needed
  if (mode === 'aivsai') {
    if (ladder.needsPick[0]) selectShip(ladder, 0, aiPickShip(ladder, 0));
    if (ladder.needsPick[1]) selectShip(ladder, 1, aiPickShip(ladder, 1));
    hidePickOverlay();
    tryStartFightFromPicks();
    return;
  }
  if (
    (mode === 'vsai' ||
      mode === 'tutorial' ||
      mode === 'climb' ||
      mode === 'weekly' ||
      mode === 'ranked') &&
    ladder.needsPick[1]
  ) {
    selectShip(ladder, 1, aiPickShip(ladder, 1));
  }
  // Tutorial opener: auto-lock first ships so the lesson starts immediately
  if (mode === 'tutorial' && ladder.fight === 1) {
    if (ladder.needsPick[0]) selectShip(ladder, 0, 0);
    if (ladder.needsPick[1]) selectShip(ladder, 1, 0);
    hidePickOverlay();
    tryStartFightFromPicks();
    return;
  }

  refreshPickOverlay();
  tryStartFightFromPicks();
}

function tryStartFightFromPicks(): void {
  if (!ladder || ladder.seriesWinner !== null) return;
  if (!bothPicked(ladder)) return;
  beginFight();
}

function buildShopPanel(side: 0 | 1): HTMLElement {
  const shop = el('div', 'shop-panel');
  const cash = Math.floor(credits[side]);
  shop.append(
    el(
      'div',
      'shop-head',
      `<span>Upgrade Bay</span><strong>$${cash}</strong>`,
    ),
  );
  shop.append(
    el(
      'p',
      'shop-sub',
      'Earn $ from stylish nonsense. Bank it by winning. Upgrades last the series.',
    ),
  );
  const list = el('div', 'shop-list');
  for (const def of UPGRADE_DEFS) {
    const level = upgrades[side][def.id];
    const cost = upgradeCost(def.id, level);
    const maxed = level >= def.maxLevel;
    const afford = cash >= cost && !maxed;
    const row = el('button', `shop-item${afford ? '' : ' disabled'}`);
    row.type = 'button';
    row.disabled = !afford;
    row.innerHTML = `
      <div class="shop-name">${def.name} <em>Lv ${level}/${def.maxLevel}</em></div>
      <div class="shop-desc">${def.perLevel}</div>
      <div class="shop-cost">${maxed ? 'MAX' : `$${cost}`}</div>
    `;
    row.onclick = () => {
      const res = buyUpgrade(upgrades[side], def.id as UpgradeId, credits[side]);
      if (!res.ok) return;
      upgrades[side] = res.ups;
      credits[side] = res.credits;
      sound.pick();
      flashCallout(`${def.name} Lv ${res.ups[def.id]}`, 0.9);
      refreshPickOverlay();
    };
    list.append(row);
  }
  shop.append(list);
  if (mode !== 'aivsai' && mode !== 'tutorial') {
    const bets = el('div', 'shop-bets');
    bets.append(el('p', 'shop-sub', 'Greed vs safety - pick a story.'));
    for (const bet of SHOP_BETS) {
      const ok = canBuyBet(shopBets[side], bet.id, credits[side]);
      const btn = el('button', 'shop-bet');
      btn.type = 'button';
      btn.disabled = !ok;
      btn.innerHTML = `<strong>${bet.name} · $${bet.cost}</strong><span>${bet.desc}</span>`;
      btn.onclick = () => {
        const res = buyBet(shopBets[side], bet.id, credits[side]);
        if (!res.ok) return;
        shopBets[side] = res.bets;
        credits[side] = res.credits;
        sound.pick();
        flashCallout(res.flash, 0.9);
        refreshPickOverlay();
      };
      bets.append(btn);
    }
    const st = shopBets[side];
    if (st.safeStash || st.greedActive || st.insurance) {
      bets.append(
        el(
          'p',
          'shop-sub',
          `Stash $${st.safeStash}${st.greedActive ? ' · GREED LIVE' : ''}${st.insurance ? ' · INSURED' : ''}`,
        ),
      );
    }
    shop.append(bets);
  }
  return shop;
}

function playerPickSides(): (0 | 1)[] {
  if (!ladder) return [];
  if (mode === 'vsai' || mode === 'tutorial' || mode === 'climb' || mode === 'weekly' || mode === 'ranked')
    return ladder.needsPick[0] ? [0] : [];
  if (mode === 'online') {
    return ladder.needsPick[onlineYou] ? [onlineYou] : [];
  }
  // local 2p: whoever still needs to pick
  const sides: (0 | 1)[] = [];
  if (ladder.needsPick[0]) sides.push(0);
  if (ladder.needsPick[1]) sides.push(1);
  return sides;
}

function hidePickOverlay(): void {
  disposeShipPreview();
  pickOverlay?.remove();
  pickOverlay = null;
}

function refreshPickOverlay(): void {
  if (!ladder || !pickPhase) {
    hidePickOverlay();
    return;
  }
  const wrap = document.querySelector('.game-wrap');
  if (!wrap) return;
  const prevScroll = document.querySelector('.pick-lists')?.scrollTop ?? 0;

  hidePickOverlay();
  const overlay = el('div', 'pick-overlay');
  pickOverlay = overlay;

  if (ladder.seriesWinner !== null) return;

  const sides = playerPickSides();
  if (sides.length === 0) {
    // Waiting on opponent / AI already done
    const waiting = el('div', 'pick-panel');
    waiting.append(el('h2', '', 'Waiting for opponent to pick…'));
    if (mode === 'vsai' && !ladder.needsPick[0] && ladder.needsPick[1]) {
      waiting.querySelector('h2')!.textContent = 'CPU is choosing…';
    }
    if ((mode === 'weekly' || mode === 'ranked') && !ladder.needsPick[0] && ladder.needsPick[1]) {
      waiting.querySelector('h2')!.textContent = 'CPU is choosing…';
    }
    overlay.append(waiting);
    wrap.append(overlay);
    return;
  }

  const layout = el('div', 'pick-layout');
  const lists = el('div', 'pick-lists');
  let firstPickId: ShipId | null = null;
  let previewSide: 0 | 1 = sides[0];

  for (const side of sides) {
    const panel = el('div', 'pick-panel');
    const label =
      mode === 'vsai' || mode === 'weekly' || mode === 'ranked'
        ? 'Pick your next menace'
        : mode === 'online'
          ? 'Pick your next menace'
          : side === 0
            ? 'P1 - pick your next menace'
            : 'P2 - pick your next menace';
    const staying =
      side === 0
        ? ladder.carryHp[1] !== null
        : ladder.carryHp[0] !== null;
    panel.append(el('h2', '', label));
    if (ladder.fight === 1 && ladder.active[0] < 0 && ladder.active[1] < 0) {
      panel.append(el('p', 'pick-sub', 'Who starts the chaos?'));
    } else if (staying) {
      const foe = side === 0 ? 1 : 0;
      const foeShip = ladder.fleets[foe][ladder.active[foe]];
      const hp = ladder.carryHp[foe];
      panel.append(
        el(
          'p',
          'pick-sub',
          `Vs limping ${SHIPS[foeShip.shipId].name} (${hp}/${SHIPS[foeShip.shipId].maxHp} hull)`,
        ),
      );
    } else {
      panel.append(el('p', 'pick-sub', 'Both sides send in fresh disasters'));
    }

    const grid = el('div', 'pick-grid');
    const picks = availablePicks(ladder, side);
    for (const { index, ship } of picks) {
      if (!firstPickId) firstPickId = ship.shipId;
      const def = SHIPS[ship.shipId];
      const btn = el('button', 'pick-card');
      btn.type = 'button';
      btn.dataset.shipId = def.id;
      btn.innerHTML = pickCardHtml(def);
      btn.onmouseenter = () => {
        previewSide = side;
        focusPick(def.id);
      };
      btn.onclick = () => {
        if (!ladder?.needsPick[side]) return;
        selectShip(ladder, side, index);
        sound.pick();
        if (mode === 'online' && side === onlineYou) {
          onlineClient?.sendPick(index);
        }
        refreshPickOverlay();
        tryStartFightFromPicks();
      };
      grid.append(btn);
    }
    panel.append(grid);
    lists.append(panel);

    // Upgrade shop for this picking side
    lists.append(buildShopPanel(side));
  }

  const sidePreview = el('div', 'preview-panel pick-preview');
  const previewHead = el('div', 'preview-head');
  const canvasEl = document.createElement('canvas');
  canvasEl.className = 'ship-preview-canvas';
  const moves = el('div', 'moves-panel');
  sidePreview.append(previewHead, canvasEl, moves);
  layout.append(lists, sidePreview);
  overlay.append(layout);

  disposeShipPreview();
  shipPreview = new ShipPreview(canvasEl);
  focusPick(firstPickId ?? previewFocus);

  function focusPick(id: ShipId): void {
    previewFocus = id;
    const def = SHIPS[id];
    previewHead.innerHTML = `<span style="color:${def.color}">${def.name}</span> <em>${def.tagline}</em>`;
    moves.innerHTML = movesPanelHtml(def, previewSide);
    shipPreview?.setShip(id);
    shipPreview?.resize();
    for (const btn of overlay.querySelectorAll('.pick-card')) {
      btn.classList.toggle('previewing', (btn as HTMLElement).dataset.shipId === id);
    }
  }

  wrap.append(overlay);
  void paintShipThumbs(overlay);
  requestAnimationFrame(() => {
    const list = document.querySelector('.pick-lists');
    if (list) list.scrollTop = prevScroll;
  });
}

function renderBattleShell(): void {
  const shell = el('div', 'shell');
  const top = el('div', 'topbar');
  top.append(el('h1', '', 'Scrap Rumble'));
  const st = el('div', 'status');
  st.textContent =
    mode === 'teams2v2'
      ? 'Team Scuffle 2v2 · 2× arena · CPU fills empty seats'
      : mode === 'ffa20'
        ? 'Free-For-All · 20 ships · 10× arena · CPU fills the yard'
        : mode === 'weekly'
      ? `Weekly · ${weeklyModeFor().name} · pick a weirdo each bout`
      : mode === 'ranked'
        ? `Ranked · MMR ${season.mmr} · ${rankForMmr(season.mmr)}`
        : mode === 'vsai'
          ? quickplayBo3
            ? `Quickplay BO3 · ${quickplayScore[0]}-${quickplayScore[1]}`
            : 'You vs the CPU · pick a weirdo each bout'
          : mode === 'local2p'
            ? 'Couch chaos · pick ships between bouts'
            : mode === 'aivsai'
              ? `CPU vs CPU · ${balanceStats.matches} bouts logged · Esc menu`
              : mode === 'tutorial' || mode === 'climb'
                ? 'Training bout · pick ships between fights'
                : `Online · Room ${onlineCode} · You P${onlineYou + 1}`;
  top.append(st);
  shell.append(top);

  const wrap = el('div', 'game-wrap');
  canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  hudCanvas = document.createElement('canvas');
  hudCanvas.className = 'hud-canvas';
  hudCanvas.width = VIEW_W;
  hudCanvas.height = VIEW_H;
  wrap.append(canvas, hudCanvas);
  if (pausedOnline) {
    wrap.append(
      el(
        'div',
        'overlay-msg',
        'Opponent left<br/><span style="font-size:12px;letter-spacing:0.05em">Esc for menu</span>',
      ),
    );
  }
  shell.append(wrap);
  shell.append(
    el(
      'div',
      'hint',
      mode === 'local2p'
        ? 'P1 WASD+F/G · P2 Arrows+/<kbd>.</kbd> · Esc menu · Enter rematch series'
        : mode === 'teams2v2' || mode === 'ffa20'
          ? 'WASD thrust/turn · F fire · G special · Esc menu · Enter rematch (reshuffle CPU)'
        : mode === 'vsai' ||
            mode === 'tutorial' ||
            mode === 'climb' ||
            mode === 'weekly' ||
            mode === 'ranked'
          ? 'WASD thrust/turn · F fire · G special · Esc menu · Enter rematch series'
          : mode === 'aivsai'
            ? 'Spectating bots · Esc menu · Enter force rematch · Balance Lab on title'
            : 'Same controls as P1 · Esc menu · Enter rematch vote',
    ),
  );
  app.append(shell);
}

function readLocalInputs(): PlayerInput[] {
  if (!sim || pickPhase || (!isArenaBrawl() && ladder?.seriesWinner !== null)) {
    return sim?.ships.map(() => ({ ...EMPTY_INPUT })) ?? [EMPTY_INPUT, EMPTY_INPUT];
  }
  if (isArenaBrawl()) {
    const human = humanArenaSlot();
    const humanInput = input.read(P1_KEYS);
    return sim.ships.map((ship, i) => {
      if (!ship.alive) return { ...EMPTY_INPUT };
      if (i === human) return humanInput;
      return thinkAI(sim!, ship, null, { style: 'standard', skill: 0.95 });
    });
  }
  if (mode === 'local2p') {
    return [input.read(P1_KEYS), input.read(P2_KEYS)];
  }
  if (mode === 'vsai' || mode === 'tutorial' || mode === 'climb' || mode === 'weekly' || mode === 'ranked') {
    const human = input.read(P1_KEYS);
    let ai;
    if (mode === 'tutorial') {
      ai = thinkAI(sim, sim.ships[1], sim.ships[0], {
        style: 'teach',
        skill: 0.5,
        playerPressure: teachPressure,
      });
    } else if (mode === 'climb' || mode === 'ranked') {
      ai = thinkAI(sim, sim.ships[1], sim.ships[0], {
        style: 'ranked',
        skill: 1.15,
      });
    } else {
      ai = thinkAI(sim, sim.ships[1], sim.ships[0], {
        style: 'standard',
        skill: 1,
      });
    }
    return [human, ai];
  }
  if (mode === 'aivsai') {
    return [
      thinkAI(sim, sim.ships[0], sim.ships[1]),
      thinkAI(sim, sim.ships[1], sim.ships[0]),
    ];
  }
  const mine = input.read(P1_KEYS);
  return onlineYou === 0 ? [mine, EMPTY_INPUT] : [EMPTY_INPUT, mine];
}

function stepOnline(): boolean {
  if (!sim || !onlineClient) return false;
  if (pickPhase || ladder?.seriesWinner !== null) return false;

  const tick = sim.tick;
  if (!localQueue.has(tick)) {
    const mine = input.read(P1_KEYS);
    const bits = packInput(mine);
    localQueue.set(tick, bits);
    onlineClient.sendInput(tick, bits);
  }
  const remote = remoteQueue.get(tick);
  const local = localQueue.get(tick);
  if (remote === undefined || local === undefined) return false;

  const i0 = unpackInput(onlineYou === 0 ? local : remote);
  const i1 = unpackInput(onlineYou === 0 ? remote : local);
  stepSim(sim, [i0, i1]);
  localQueue.delete(tick);
  remoteQueue.delete(tick);
  pushKillSnap(sim);
  if (sim.winner !== null && !killCam && !fightResolved) startKillCam();
  return true;
}

function loop(ts: number): void {
  raf = requestAnimationFrame(loop);
  if (!sim || !renderer || !world3d) return;

  const dtFrame = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  fpsMonitor.sample(dtFrame);
  if (perfAdviceLife > 0) perfAdviceLife -= dtFrame;

  if (intermissionTimer > 0) {
    if (isUnlockCeremonyActive()) {
      accum = 0;
    } else {
      intermissionTimer -= dtFrame;
      if (intermissionTimer <= 0) {
        intermissionTimer = 0;
        intermissionText = null;
        if (!isArenaBrawl()) enterPickPhase();
      }
      accum = 0;
    }
  }

  if (isUnlockCeremonyActive()) {
    accum = 0;
    // Keep drawing the arena underneath the crate
  } else if (countdown > 0 && !pickPhase && intermissionTimer <= 0) {
    const prevElapsed = matchIntroElapsed;
    countdown -= dtFrame;
    matchIntroElapsed = Math.min(
      MATCH_INTRO_DURATION,
      MATCH_INTRO_DURATION - Math.max(0, countdown),
    );
    const cue = matchIntroCue(prevElapsed, matchIntroElapsed);
    if (cue === 'matchup') sound.introMatchup();
    else if (cue === 'count3' || cue === 'count2' || cue === 'count1') {
      sound.countdownBeep(false);
      world3d?.addShake(cue === 'count1' ? 10 : 6);
    } else if (cue === 'drop') {
      sound.countdownBeep(true);
      world3d?.addShake(18);
      flashCallout('FIGHT', 0.85);
      if (sim.ships[0]) sound.taunt(sim.ships[0].shipId, false);
      setTimeout(() => {
        if (sim?.ships[1]) sound.taunt(sim.ships[1].shipId, false);
      }, 200);
    }
    if (countdown <= 0) {
      countdown = 0;
      matchIntroMeta = null;
      matchIntroElapsed = MATCH_INTRO_DURATION;
      sound.setIntensity(0.32);
    }
    accum = 0;
  }

  if (hitStop > 0) {
    hitStop -= dtFrame;
    accum = 0;
  } else if (!killCam) {
    accum += dtFrame;
  }

  // Visual kill cam: follow last hits, pop damage, victory jingle on impact
  if (killCam) {
    killCam.elapsed += dtFrame;
    killCam.lastHitAge += dtFrame;
    for (const imp of killCam.impacts) imp.life -= dtFrame;
    killCam.impacts = killCam.impacts.filter((imp) => imp.life > 0);

    const u = Math.min(1, killCam.elapsed / killCam.duration);
    if (!killCam.victoryPlayed && u >= 0.64) {
      killCam.victoryPlayed = true;
      if (killCam.killerId) sound.victorySong(killCam.killerId);
      else sound.win();
      world3d?.addShake(10);
      sound.explosion(true);
    }
    if (killCam.elapsed >= killCam.duration) {
      killCam = null;
      onFightEnded();
    }
    accum = 0;
  }

  // CPU vs CPU: auto-farm next series after a short pause
  if (mode === 'aivsai' && aivsaiAutoTimer > 0) {
    aivsaiAutoTimer -= dtFrame;
    if (aivsaiAutoTimer <= 0) {
      aivsaiAutoTimer = 0;
      startAivsaiSeries();
      return;
    }
  }

  const frozen =
    pausedOnline ||
    pickPhase ||
    intermissionTimer > 0 ||
    countdown > 0 ||
    hitStop > 0 ||
    !!killCam ||
    isUnlockCeremonyActive();

  // Skill purse grows from play, not clock time
  if (!frozen && (!ladder || ladder.seriesWinner === null) && sim.winner === null) {
    if (style > boutStylePeak) {
      const gain = style - boutStylePeak;
      boutStylePeak = style;
      // Peak style ticks pay - high-heat play is worth more than camping
      if (gain >= 4) awardSkill(gain * 0.55);
    }
  }

  if (!frozen) {
    if (mode === 'online') {
      let steps = 0;
      while (steps < 5) {
        if (!stepOnline()) break;
        steps++;
      }
    } else if (!ladder || ladder.seriesWinner === null) {
      while (accum >= DT) {
        const inputs = readLocalInputs();
        stepSim(sim, inputs);
        pushKillSnap(sim);
        const hum = isArenaBrawl() ? humanArenaSlot() : humanSide();
        if (sim.ships[hum]?.alive) {
          hpHistory.push(sim.ships[hum].hp / Math.max(1, sim.ships[hum].maxHp));
          if (hpHistory.length > 140) hpHistory.shift();
        }
        if (mode === 'tutorial') {
          tutorial = advanceTutorial(tutorial, inputs[0], DT);
        }
        if (mode === 'aivsai') {
          spectatorChipTimer += DT;
          if (spectatorChipTimer > 5.5) {
            spectatorChipTimer = 0;
            const a = sim.ships[0];
            const b = sim.ships[1];
            if (a.alive && b.alive) {
              const ra = a.hp / a.maxHp;
              const rb = b.hp / b.maxHp;
              if (Math.abs(ra - rb) > 0.22) {
                spectatorChips.push(
                  ra < rb
                    ? `${SHIPS[a.shipId].name} is melting`
                    : `${SHIPS[b.shipId].name} is melting`,
                );
              } else if (a.telegraph > 0 || b.telegraph > 0) {
                const s = a.telegraph > 0 ? a : b;
                spectatorChips.push(`${SHIPS[s.shipId].name} winds up...`);
              } else {
                spectatorChips.push('Neck and neck scrap');
              }
              if (spectatorChips.length > 6) spectatorChips.shift();
            }
          }
        }
        if (sim.winner !== null) {
          startKillCam();
          accum = 0;
          break;
        }
        accum -= DT;
      }
    }
  } else if (pickPhase || intermissionTimer > 0 || killCam) {
    accum = 0;
  }

  syncAudio(sim, dtFrame);
  if (matchupLineLife > 0) {
    matchupLineLife -= dtFrame;
    if (matchupLineLife <= 0) {
      matchupLineLife = 0;
      matchupLine = null;
    }
  }
  if (deathDebrief) {
    deathDebrief.life -= dtFrame;
    if (deathDebrief.life <= 0) deathDebrief = null;
  }
  if (calloutLife > 0) {
    calloutLife -= dtFrame;
    if (calloutLife <= 0) {
      calloutLife = 0;
      callout = null;
    }
  }
  for (const f of floats) f.life -= dtFrame;
  floats = floats.filter((f) => f.life > 0);

  if (comboTimer > 0) {
    comboTimer -= dtFrame;
    if (comboTimer <= 0) {
      comboTimer = 0;
      combo = 0;
    }
  }
  style = Math.max(0, style - dtFrame * 6);

  const labels: [string, string] =
    mode === 'vsai' || mode === 'tutorial' || mode === 'climb'
      ? [
          mode === 'tutorial' ? 'STUDENT' : 'YOU',
          mode === 'climb' ? 'HOUSE' : mode === 'tutorial' ? 'FRIDGE' : 'CPU',
        ]
      : mode === 'aivsai'
        ? ['CPU A', 'CPU B']
        : mode === 'online'
          ? onlineYou === 0
            ? ['YOU', 'OPP']
            : ['OPP', 'YOU']
          : ['P1', 'P2'];

  const human = isArenaBrawl() ? humanArenaSlot() : humanSide();
  const myHp = sim.ships[human]?.alive
    ? sim.ships[human]!.hp / sim.ships[human]!.maxHp
    : 1;
  const danger =
    pickPhase || countdown > 0 || intermissionTimer > 0 || killCam
      ? 0
      : Math.max(0, 1 - myHp / 0.35) * (myHp < 0.35 ? 1 : 0);

  let drawState: SimState = sim;
  let killCamOpts: {
    progress: number;
    focusX: number;
    focusY: number;
    subtitle: string;
    phase: 0 | 1 | 2;
    victimHp?: number;
    victimMaxHp?: number;
    victimLabel?: string;
    damageTotal?: number;
    lastHit?: number;
    lastHitAge?: number;
    impacts?: { x: number; y: number; life: number; maxLife: number; amount: number }[];
  } | null = null;
  let killCamHud: {
    progress: number;
    focusX: number;
    focusY: number;
    subtitle: string;
    phase: 0 | 1 | 2;
    victimHp?: number;
    victimMaxHp?: number;
    victimLabel?: string;
    damageTotal?: number;
    lastHit?: number;
    lastHitAge?: number;
    impacts?: { x: number; y: number; life: number; maxLife: number; amount: number }[];
  } | null = null;
  if (killCam && killCam.frames.length > 0) {
    const u = Math.min(1, killCam.elapsed / killCam.duration);
    const impact = killCam.impactAt;
    // Spend almost all time on the finishing hits window
    let replayU: number;
    if (u < 0.68) {
      const t = u / 0.68;
      const from = Math.max(0, impact - 0.72);
      replayU = from + (impact - from) * Math.pow(t, 0.92);
    } else if (u < 0.82) {
      const t = (u - 0.68) / 0.14;
      const to = Math.min(1, impact + 0.06);
      replayU = impact + (to - impact) * t;
    } else {
      const t = (u - 0.82) / 0.18;
      const from = Math.min(1, impact + 0.06);
      replayU = from + (1 - from) * t;
    }
    const maxIdx = Math.max(0, killCam.frames.length - 1);
    const f = Math.min(maxIdx, replayU * maxIdx);
    const i0 = Math.min(maxIdx, Math.floor(f));
    const i1 = Math.min(maxIdx, i0 + 1);
    const frac = f - i0;
    const snap =
      i0 === i1
        ? killCam.frames[i0]!
        : interpolateKillSnap(killCam.frames[i0]!, killCam.frames[i1]!, frac);
    drawState = buildDrawState(sim, snap);

    let fx = killCam.focusX;
    let fy = killCam.focusY;
    let victimHp: number | undefined;
    let victimMaxHp: number | undefined;
    if (killCam.victimSlot !== null) {
      const victimSlot = killCam.victimSlot;
      const vs = drawState.ships[victimSlot]!;
      const ks =
        drawState.ships.find((s) => s.alive && isHostile(s, { ...vs, alive: true })) ??
        drawState.ships.find((s) => s.player !== victimSlot) ??
        vs;
      victimHp = Math.max(0, vs.hp);
      victimMaxHp = vs.maxHp;

      const lost = killCam.lastShownHp - victimHp;
      if (lost > 0.4) {
        const chunk = Math.round(lost);
        killCam.damageTotal += lost;
        killCam.lastHit = chunk;
        killCam.lastHitAge = 0;
        killCam.lastShownHp = victimHp;
        pushFloat(vs.x, vs.y - 18, `-${chunk}`, chunk >= 20 ? '#ffe08a' : '#ff6b6b');
        killCam.impacts.push({
          x: vs.x,
          y: vs.y,
          life: 0.5,
          maxLife: 0.5,
          amount: chunk,
        });
        if (killCam.impacts.length > 8) killCam.impacts.shift();
        sound.hit();
        world3d?.addShake(3 + Math.min(10, chunk) * 0.15);
        vs.flash = Math.max(vs.flash, 0.28);
      } else if (!vs.alive) {
        killCam.lastShownHp = 0;
      }

      if (vs.alive) {
        const shotBias = snap.projectiles.length > 0 ? 0.45 : 0.62;
        fx = vs.x * shotBias + ks.x * (1 - shotBias);
        fy = vs.y * shotBias + ks.y * (1 - shotBias);
        let best: { x: number; y: number; d: number } | null = null;
        for (const p of snap.projectiles) {
          const d = Math.hypot(p.x - vs.x, p.y - vs.y);
          if (d < 160 && (!best || d < best.d)) best = { x: p.x, y: p.y, d };
        }
        if (best) {
          fx = fx * 0.5 + best.x * 0.3 + vs.x * 0.2;
          fy = fy * 0.5 + best.y * 0.3 + vs.y * 0.2;
        }
      } else {
        fx = vs.x;
        fy = vs.y;
      }
      killCam.focusX = fx;
      killCam.focusY = fy;
    }

    const phase: 0 | 1 | 2 = u < 0.68 ? 0 : u < 0.82 ? 1 : 2;
    killCamOpts = {
      progress: u,
      focusX: fx,
      focusY: fy,
      subtitle: killCam.subtitle,
      phase,
      victimHp,
      victimMaxHp,
      victimLabel: killCam.victimName ?? undefined,
      damageTotal: Math.round(killCam.damageTotal),
      lastHit: killCam.lastHit,
      lastHitAge: killCam.lastHitAge,
      impacts: killCam.impacts,
    };
  }

  const screenFloats = floats.map((f) => {
    const p = world3d!.worldToScreen(f.x, f.y);
    return { ...f, x: p.x, y: p.y };
  });

  const rank = rankForXp(climb.xp);
  const drawOpts = {
    labels,
    ladder,
    intermission: intermissionText,
    seriesOver: isArenaBrawl() ? fightResolved : ladder?.seriesWinner !== null,
    callout,
    calloutLife,
    style,
    combo,
    floats: screenFloats,
    countdown: null,
    matchIntro:
      countdown > 0 && matchIntroMeta
        ? matchIntroFrame(matchIntroElapsed, matchIntroMeta)
        : null,
    fps: (() => {
      const s = fpsMonitor.snapshot();
      return {
        current: s.current,
        min: s.min,
        max: s.max,
        avg: s.avg,
      };
    })(),
    perfAdvice:
      perfAdviceLife > 0 && lastPerfAdvice
        ? { lines: adviceLines(lastPerfAdvice, 3), life: perfAdviceLife }
        : null,
    danger,
    killCam: killCamOpts,
    dt: dtFrame,
    focusSide: human,
    localSlot: human,
    credits: credits[human],
    boutPurse: Math.floor(boutPurse),
    deathDebrief,
    matchupLine: matchupLineLife > 0 ? matchupLine : null,
    tutorialPrompt: mode === 'tutorial' ? tutorialPrompt(tutorial) : null,
    climbLabel:
      mode === 'climb'
        ? `${rank.title} · Ch.${climbChapter + 1} ${HOUSE_CHAPTERS[climbChapter]?.name ?? ''}`
        : `${rank.title} · ${climb.xp} XP`,
    spectator:
      mode === 'aivsai'
        ? {
            chips: spectatorChips,
            hp0: drawState.ships[0].hp,
            hp1: drawState.ships[1].hp,
            max0: drawState.ships[0].maxHp,
            max1: drawState.ships[1].maxHp,
          }
        : null,
    seriesStats:
      ladder?.seriesWinner !== null
        ? {
            streak: bestStreak,
            bestCombo,
            damage: damageDealt,
            kills: shipsKilled,
          }
        : null,
  };
  world3d.draw(drawState, drawOpts);
  if (killCamOpts) {
    const focusScreen = world3d.worldToScreen(killCamOpts.focusX, killCamOpts.focusY);
    const screenImpacts = (killCamOpts.impacts ?? []).map((imp) => {
      const p = world3d!.worldToScreen(imp.x, imp.y);
      return { ...imp, x: p.x, y: p.y };
    });
    killCamHud = {
      ...killCamOpts,
      focusX: focusScreen.x,
      focusY: focusScreen.y,
      impacts: screenImpacts,
    };
  }
  renderer.drawHudOverlay(drawState, { ...drawOpts, killCam: killCamHud });

  // No CSS canvas scale - it desyncs world vs HUD and reads as ghosting
  if (canvas) {
    canvas.style.transform = '';
  }
}

function syncAudio(state: SimState, dtFrame = 1 / 60): void {
  const human = isArenaBrawl() ? humanArenaSlot() : humanSide();
  const foe: number = state.ships.find((s) => isHostile(state.ships[human]!, s))?.player ?? (human === 0 ? 1 : 0);

  // Music heat: higher when ships are low HP / lots of projectiles / style
  const aliveHp = state.ships.filter((s) => s.alive).map((s) => s.hp / Math.max(1, s.maxHp));
  const danger = aliveHp.length ? 1 - Math.min(...aliveHp) : 1;
  const chaos = Math.min(1, state.projectiles.length / Math.max(14, state.ships.length * 2));
  const styleHeat = style / 100;
  sound.setIntensity(
    pickPhase || countdown > 0 || killCam
      ? killCam
        ? 0.62
        : 0.18
      : 0.22 + danger * 0.38 + chaos * 0.14 + styleHeat * 0.12,
  );

  // Heartbeat under pressure
  const myRatio = state.ships[human].alive
    ? state.ships[human].hp / state.ships[human].maxHp
    : 1;
  if (!pickPhase && countdown <= 0 && myRatio < 0.28 && state.ships[human].alive) {
    heartbeatCd -= dtFrame;
    if (heartbeatCd <= 0) {
      sound.heartbeat();
      heartbeatCd = 0.55 + myRatio * 0.5;
    }
  } else {
    heartbeatCd = 0;
  }

  for (let i = 0; i < state.ships.length; i++) {
    const s = state.ships[i];
    if (prevHp[i] === undefined) prevHp[i] = s.hp;
    if (prevAlive[i] === undefined) prevAlive[i] = s.alive;
    if (i < 2) sound.setThrust(
      i,
      s.alive && s.thrustTime > 0 && !pickPhase && countdown <= 0 && !killCam,
      s.afterburn > 0,
    );

    const lost = prevHp[i] - s.hp;
    if (lost > 0.5) {
      sound.hit();
      world3d?.addShake(4 + Math.min(12, lost) * 0.18);

      const attacker: 0 | 1 =
        isArenaBrawl() ? (i === human ? 1 : 0) : ((i === 0 ? 1 : 0) as 0 | 1);
      if (!pickPhase && countdown <= 0 && !killCam) {
        boutDamageBySide[attacker] += lost;
        pushFloat(s.x, s.y - 20, `-${Math.round(lost)}`, '#ff8a8a');
      }
      const scored =
        mode === 'local2p'
          ? true
          : mode === 'aivsai'
            ? false
            : i !== human && (isArenaBrawl() || i === foe);
      if (scored && !pickPhase && countdown <= 0 && !killCam) {
        damageDealt += lost;
        boutDamage += lost;
        combo += 1;
        comboTimer = 1.85;
        style = Math.min(100, style + Math.min(18, lost * 0.85) + 3);
        if (combo > bestCombo) bestCombo = combo;
        if (combo > boutComboPeak) boutComboPeak = combo;
        // Skill pay: damage + combo multipliers, not time spent
        awardSkill(lost * 0.65 + Math.min(14, combo * 1.4));
        sound.combo(combo);

        if (!firstBlood) {
          firstBlood = true;
          flashCallout('FIRST OUCH', 1.1);
          awardSkill(18);
        } else if (combo === 3) {
          flashCallout('COMBO x3', 1.0);
          awardSkill(12);
        } else if (combo === 5) {
          flashCallout('COMBO x5', 1.1);
          awardSkill(20);
        } else if (combo === 8) {
          flashCallout('UNSTOPPABLE', 1.3);
          awardSkill(32);
        } else if (combo === 12) {
          flashCallout('GODLIKE', 1.4);
          awardSkill(48);
        }

        const attackerShip = state.ships[attacker];
        const atkLow =
          attackerShip.alive && attackerShip.hp / attackerShip.maxHp < 0.3;
        if (atkLow && lost > 8) {
          flashCallout('CLUTCH', 1.0);
          sound.clutch();
          style = Math.min(100, style + 12);
          awardSkill(22);
        }
        if (lost > 18) hitStop = 0.045;
      }
      if (mode !== 'local2p' && i === human && combo > 0) {
        combo = Math.max(0, combo - 1);
        comboTimer = Math.min(comboTimer, 0.6);
      }
      if (mode === 'tutorial' && i === human && lost > 12) {
        teachPressure = Math.min(3, teachPressure + 1);
      }
    }
    if (prevAlive[i] && !s.alive) {
      world3d?.addShake(16);
      if (i === foe) pushFloat(s.x, s.y, 'KO', '#ffe08a', 1.1);
    }
    prevHp[i] = s.hp;
    prevAlive[i] = s.alive;
  }
  if (state.projectiles.length > prevProjCount) {
    const newest = state.projectiles[state.projectiles.length - 1];
    if (newest) {
      const shooter = state.ships[newest.owner];
      if (shooter) sound.shipFire(shooter.shipId);
      else if (newest.kind === 'nuke' || newest.kind === 'butt') sound.fire('missile');
      else if (newest.kind === 'heavy') sound.fire('heavy');
      else if (newest.kind === 'shard') sound.fire('special');
      else sound.fire('laser');
    }
  }
  prevProjCount = state.projectiles.length;

  for (const e of state.effects) {
    if (heardEffects.has(e.id)) continue;
    heardEffects.add(e.id);
    if (e.kind === 'explosion' && e.radius > 55) {
      sound.explosion(true);
      world3d?.addShake(14);
    } else if (e.kind === 'explosion') {
      sound.explosion(false);
      world3d?.addShake(6);
    } else if (e.kind === 'wake') {
      if (e.id % 5 === 0) sound.ability('wake');
    } else if (
      e.kind === 'nuke_flash' ||
      e.kind === 'teleport' ||
      e.kind === 'phase' ||
      e.kind === 'shield_flash' ||
      e.kind === 'nova' ||
      e.kind === 'hive' ||
      e.kind === 'panic' ||
      e.kind === 'cloak_pop' ||
      e.kind === 'pickup'
    ) {
      sound.ability(e.kind);
      if (e.kind === 'nuke_flash' || e.kind === 'nova') world3d?.addShake(12);
      else if (e.kind === 'teleport' || e.kind === 'phase' || e.kind === 'panic') {
        world3d?.addShake(5);
      } else if (e.kind === 'pickup') {
        world3d?.addShake(3);
        const label =
          e.color === '#4ade80'
            ? 'REPAIR'
            : e.color === '#38bdf8'
              ? 'CAPACITOR'
              : e.color === '#f97316'
                ? 'OVERCHARGE'
                : e.color === '#c084fc'
                  ? 'BOOST'
                  : e.color === '#fbbf24'
                    ? 'AEGIS'
                    : 'PICKUP';
        flashCallout(label, 0.85);
        awardSkill(10);
      }
    }
  }
  if (heardEffects.size > 80) {
    const live = new Set(state.effects.map((e) => e.id));
    for (const id of heardEffects) {
      if (!live.has(id)) heardEffects.delete(id);
    }
  }

  if (ladder?.seriesWinner !== null && prevWinner === null && ladder) {
    sound.win();
    world3d?.addShake(26);
  }
  prevWinner = ladder?.seriesWinner ?? state.winner;
}

window.addEventListener('keydown', (e) => {
  if (screen !== 'battle') return;
  if (e.code === 'Escape') {
    cancelAnimationFrame(raf);
    disposeUnlockCeremony();
    unlockQueue = [];
    unlockResume = null;
    onlineClient?.disconnect();
    onlineClient = null;
    sound.setThrust(0, false);
    sound.setThrust(1, false);
    world3d?.dispose();
    world3d = null;
    sim = null;
    ladder = null;
    sound.setTheme(null);
    onlineRematchPending = false;
    screen = 'title';
    renderUI();
    return;
  }
  if (isUnlockCeremonyActive()) return;
  if (e.code === 'Enter' && (isArenaBrawl() ? fightResolved : ladder?.seriesWinner !== null)) {
    if (isArenaBrawl()) {
      startArenaBrawl();
    } else if (mode === 'online') {
      if (!onlineRematchPending) {
        onlineClient?.rematch();
        onlineRematchPending = true;
        flashCallout('REMATCH VOTE SENT', 1.4);
      }
    } else if (mode === 'aivsai') {
      startAivsaiSeries();
    } else {
      startSeries();
    }
  }
});

renderUI();
