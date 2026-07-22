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
import { pickCardHtml, shipCardHtml, movesPanelHtml } from './ui/shipInfo';
import { ShipPreview } from './ui/ShipPreview';
import { createSim, packInput, planetFromSeed, stepSim, unpackInput, type PlanetConfig } from './game/simulation';
import { wrapMid } from './game/math';
import {
  UPGRADE_DEFS,
  EMPTY_UPGRADES,
  buyUpgrade,
  cloneUpgrades,
  upgradeCost,
  type PlayerUpgrades,
  type UpgradeId,
} from './game/upgrades';
import {
  ARENA_H,
  ARENA_W,
  DT,
  EMPTY_INPUT,
  VIEW_H,
  VIEW_W,
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

type Screen = 'title' | 'shipselect' | 'online' | 'battle';

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
let prevHp: [number, number] = [0, 0];
let prevAlive: [boolean, boolean] = [true, true];
let prevProjCount = 0;
let prevWinner: -1 | 0 | 1 | null = null;
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
let countdownLabel: string | null = null;
let lastCountdownSec = -1;
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
  lines: { at: number; text: string }[];
  lineIdx: number;
  line: string;
};

const KILL_BUF_MAX = 120;
let killBuffer: KillSnap[] = [];
let killCam: KillCamState | null = null;

const COMMENTARY_BANK = {
  open: [
    'OK REWIND THAT CHAOS...',
    'WAIT WAIT WAIT...',
    'SOMEONE CALL THEIR MOM...',
  ],
  build: [
    'THEY ARE COOKING...',
    'OH NO THEY ARE LINING IT UP...',
    'DO NOT LOOK AWAY...',
    'HERE COMES THE BIT...',
  ],
  peak: [
    'OHHHHH NOOO!',
    'THAT IS ILLEGAL!',
    'GET HIM OUTTA THERE!',
    'ABSOLUTE MENACE!',
  ],
  finish: [
    'SHIP WRECKED!',
    'SEND FLOWERS!',
    'THAT WAS RUDE!',
    'DELETED FROM EXISTENCE!',
    'CRINGE COMPILATION!',
  ],
  crowd: [
    'THE CROWD IS UNWELL!',
    'ARENA LOSES ITS MIND!',
    'SOMEBODY STOP THIS!',
    'THEY WILL MEME THIS!',
  ],
  draw: [
    'BOTH EXPLODED! ICONIC!',
    'NO WINNERS ONLY VIBES!',
    'MUTUAL DESTRUCTION ARC!',
  ],
};

function pickLine(pool: string[]): string {
  return pool[(Math.random() * pool.length) | 0]!;
}

function buildKillCommentary(
  winner: -1 | 0 | 1,
  scorerName: string | null,
): { at: number; text: string }[] {
  if (winner === -1) {
    return [
      { at: 0.0, text: pickLine(COMMENTARY_BANK.open) },
      { at: 0.35, text: pickLine(COMMENTARY_BANK.peak) },
      { at: 0.7, text: pickLine(COMMENTARY_BANK.draw) },
    ];
  }
  const who = scorerName ?? 'THAT SHIP';
  return [
    { at: 0.0, text: pickLine(COMMENTARY_BANK.open) },
    { at: 0.28, text: `${who} ON THE CHARGE...` },
    { at: 0.55, text: pickLine(COMMENTARY_BANK.finish) },
    { at: 0.82, text: pickLine(COMMENTARY_BANK.crowd) },
  ];
}

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
  const frames = killBuffer.slice();
  frames.push(captureKillSnap(sim));
  if (frames.length < 8) {
    while (frames.length < 12) frames.unshift(frames[0]!);
  }

  let focusX = sim.ships[0].x;
  let focusY = sim.ships[0].y;
  let scorerName: string | null = null;
  if (sim.winner === 0) {
    focusX = sim.ships[1].x;
    focusY = sim.ships[1].y;
    scorerName = SHIPS[sim.ships[0].shipId].name.toUpperCase();
  } else if (sim.winner === 1) {
    focusX = sim.ships[0].x;
    focusY = sim.ships[0].y;
    scorerName = SHIPS[sim.ships[1].shipId].name.toUpperCase();
  } else {
    const mid = wrapMid(sim.ships[0].x, sim.ships[0].y, sim.ships[1].x, sim.ships[1].y);
    focusX = mid.x;
    focusY = mid.y;
  }

  const lines = buildKillCommentary(sim.winner ?? -1, scorerName);
  killCam = {
    frames,
    elapsed: 0,
    duration: 3.2,
    focusX,
    focusY,
    lines,
    lineIdx: 0,
    line: lines[0]?.text ?? 'REPLAY...',
  };
  world3d?.addShake(20);
  sound.ability('nova');
  sound.explosion(true);
  flashCallout(killCam.line, 1.6);
  killBuffer = [];
}

/** Credits: skill builds the bout purse, bank on win, spend in shop */
let credits: [number, number] = [0, 0];
let boutPurse = 0;
/** Bout-local skill meters feeding the purse */
let boutDamage = 0;
let boutComboPeak = 0;
let boutStylePeak = 0;
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

function disposeShipPreview(): void {
  shipPreview?.dispose();
  shipPreview = null;
}

function renderUI(): void {
  disposeShipPreview();
  input.setBlocked(screen !== 'battle');
  app.innerHTML = '';
  if (screen === 'title') renderTitle();
  else if (screen === 'shipselect') renderShipSelect();
  else if (screen === 'online') renderOnline();
  else renderBattleShell();
}

function renderTitle(): void {
  const shell = el('div', 'shell');
  shell.append(el('h1', 'brand', 'Scrap Rumble'));
  shell.append(
    el(
      'p',
      'tagline',
      'Orbit\'s dumbest bloodsport · winner stays · dignity leaves',
    ),
  );
  const panel = el('div', 'panel menu-grid');
  const b1 = el('button', 'primary', 'Bully the CPU');
  b1.onclick = () => {
    void sound.unlock();
    sound.ui();
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
    mode = 'online';
    selectingFor = 0;
    fleet0 = [];
    fleet1 = [];
    screen = 'shipselect';
    renderUI();
  };
  const mute = el('button', '', 'Mute The Nonsense');
  mute.onclick = () => {
    void sound.unlock();
    sound.setMuted(!sound.muted);
    mute.textContent = sound.muted ? 'Unmute The Nonsense' : 'Mute The Nonsense';
  };
  panel.append(b1, b2, b3, mute);
  panel.append(
    el(
      'div',
      'hint',
      `<p>Each side drafts <strong>${FLEET_SIZE}</strong> different scrapheaps. Heavy ones turn like couches. Tiny ones are gremlins.</p>
       <p>Earn <strong>$</strong> from stylish nonsense - combos, clutch hits, drama - bank it by winning - buy upgrades between bouts.</p>
       <p><strong>P1</strong> <kbd>W</kbd><kbd>A</kbd><kbd>D</kbd> · <kbd>F</kbd> pew · <kbd>G</kbd> big move</p>
       <p><strong>P2</strong> <kbd>↑</kbd><kbd>←</kbd><kbd>→</kbd> · <kbd>/</kbd> pew · <kbd>.</kbd> big move</p>`,
    ),
  );
  shell.append(panel);
  app.append(shell);
}

function renderShipSelect(): void {
  const prevScroll = document.querySelector('.ship-select')?.scrollTop ?? 0;
  const shell = el('div', 'shell');
  const drafting = selectingFor === 0 ? fleet0 : fleet1;
  const title =
    mode === 'vsai'
      ? `Grab ${FLEET_SIZE} weirdos (${drafting.length}/${FLEET_SIZE})`
      : mode === 'online'
        ? `Grab ${FLEET_SIZE} weirdos (${drafting.length}/${FLEET_SIZE})`
        : selectingFor === 0
          ? `P1 picks ${FLEET_SIZE} disasters (${drafting.length}/${FLEET_SIZE})`
          : `P2 picks ${FLEET_SIZE} disasters (${drafting.length}/${FLEET_SIZE})`;

  shell.append(el('h1', 'brand', 'Junkyard Draft'));
  shell.append(el('p', 'tagline', title));

  const panel = el('div', 'panel');

  const slots = el('div', 'fleet-slots');
  for (let i = 0; i < FLEET_SIZE; i++) {
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
  panel.append(
    el('div', 'hint', 'Hover a weirdo for the full roast. Click to add or yeet. Order is fight order.'),
  );

  const layout = el('div', 'draft-layout');
  const left = el('div', 'draft-main');
  const grid = el('div', 'ship-select');
  for (const def of SHIP_LIST) {
    const inFleet = drafting.includes(def.id);
    const full = drafting.length >= FLEET_SIZE && !inFleet;
    const card = el(
      'button',
      `ship-card${inFleet ? ' selected' : ''}${full ? ' disabled' : ''}${previewFocus === def.id ? ' previewing' : ''}`,
    );
    card.type = 'button';
    card.dataset.shipId = def.id;
    card.disabled = full;
    const ord = inFleet ? drafting.indexOf(def.id) + 1 : undefined;
    card.innerHTML = shipCardHtml(def, { ord });
    card.onmouseenter = () => focusPreview(def.id);
    card.onclick = () => {
      sound.ui();
      if (selectingFor === 0) fleet0 = toggleFleetShip(fleet0, def.id);
      else fleet1 = toggleFleetShip(fleet1, def.id);
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
  const next = el('button', 'primary', 'Let\'s Rumble');
  next.disabled = drafting.length !== FLEET_SIZE;
  next.onclick = () => {
    if (drafting.length !== FLEET_SIZE) return;
    if (mode === 'local2p' && selectingFor === 0) {
      selectingFor = 1;
      renderUI();
      return;
    }
    if (mode === 'vsai') {
      fleet1 = randomFleet();
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

  shipPreview = new ShipPreview(canvas);
  const initial =
    drafting.includes(previewFocus)
      ? previewFocus
      : drafting[0] ?? SHIP_LIST[0].id;
  focusPreview(initial);
  // Keep hangar scroll where you were after toggling a ship
  requestAnimationFrame(() => {
    const list = document.querySelector('.ship-select');
    if (list) list.scrollTop = prevScroll;
  });

  function focusPreview(id: ShipId): void {
    previewFocus = id;
    const def = SHIPS[id];
    const loreName = def.name;
    previewHead.innerHTML = `<span style="color:${def.color}">${loreName}</span> <em>${def.tagline}</em>`;
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

function startSeries(seed = (Math.random() * 0xffffffff) | 0): void {
  cancelAnimationFrame(raf);
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
  countdownLabel = null;
  floats = [];
  credits = [45, 45];
  boutPurse = 0;
  boutDamage = 0;
  boutComboPeak = 0;
  boutStylePeak = 0;
  upgrades = [cloneUpgrades(EMPTY_UPGRADES), cloneUpgrades(EMPTY_UPGRADES)];
  callout = null;
  calloutLife = 0;
  killBuffer = [];
  killCam = null;
  // Backdrop sim until openers are chosen
  sim = createSim(fleet0[0], fleet1[0], seed, {
    planet: seriesPlanet,
  });
  screen = 'battle';
  renderUI();
  requestAnimationFrame(() => {
    if (!canvas || !hudCanvas) return;
    world3d?.dispose();
    world3d = new World3D(canvas);
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
  });
  fightResolved = false;
  pickPhase = false;
  hidePickOverlay();
  world3d?.resetTracking(sim);
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
  countdown = 3.15;
  countdownLabel = '3';
  lastCountdownSec = 3;
  sound.countdownBeep(false);
  killBuffer = [];
  killCam = null;
}

function flashCallout(text: string, life = 1.35): void {
  callout = text;
  calloutLife = life;
}

function humanSide(): 0 | 1 {
  return mode === 'online' ? onlineYou : 0;
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

function onFightEnded(): void {
  if (!sim || !ladder || fightResolved || sim.winner === null) return;
  fightResolved = true;

  const w = sim.winner;
  world3d?.addShake(22);
  const human = humanSide();

  // Finish purse from skill this bout (not fight length)
  boutPurse +=
    18 +
    boutComboPeak * 5 +
    boutStylePeak * 0.45 +
    Math.min(50, boutDamage * 0.08);

  if (w === -1) {
    boutStreak = 0;
    shipsKilled += 1;
    const banked = Math.round(boutPurse * 0.5);
    credits[human] += banked;
    if (mode === 'local2p') credits[1] += Math.round(boutPurse * 0.25);
    flashCallout('DOUBLE KILL', 1.5);
    if (banked > 0) setTimeout(() => flashCallout(`+$${banked} SPLIT`, 1.1), 450);
  } else if (w === 0 || w === 1) {
    const winnerIsYou = mode === 'local2p' || w === human;
    if (w === human) {
      boutStreak += 1;
      shipsKilled += 1;
      if (boutStreak > bestStreak) bestStreak = boutStreak;
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
  boutPurse = 0;
  boutDamage = 0;
  boutComboPeak = 0;
  boutStylePeak = 0;

  resolveFight(ladder, sim.winner, sim.ships[0].hp, sim.ships[1].hp);

  if (ladder.seriesWinner !== null) {
    pickPhase = false;
    hidePickOverlay();
    if (ladder.seriesWinner === human) flashCallout('FLEET VICTORY', 2.2);
    else flashCallout('FLEET DEFEATED', 2.0);
    return;
  }

  intermissionText =
    w === human ? 'WINNER STAYS LOOKING SMUG' : w === -1 ? 'EVERYONE EXPLODED' : 'SEND IN THE NEXT CLOWN';
  intermissionTimer = 0.85;
}

function enterPickPhase(): void {
  if (!ladder || ladder.seriesWinner !== null) return;
  pickPhase = true;

  // AI auto-picks when needed
  if (mode === 'vsai' && ladder.needsPick[1]) {
    selectShip(ladder, 1, aiPickShip(ladder, 1));
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
  return shop;
}

function playerPickSides(): (0 | 1)[] {
  if (!ladder) return [];
  if (mode === 'vsai') return ladder.needsPick[0] ? [0] : [];
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
      mode === 'vsai'
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
    mode === 'vsai'
      ? 'You vs the CPU · pick a weirdo each bout'
      : mode === 'local2p'
        ? 'Couch chaos · pick ships between bouts'
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
        : mode === 'vsai'
          ? 'WASD thrust/turn · F fire · G special · Esc menu · Enter rematch series'
          : 'Same controls as P1 · Esc menu',
    ),
  );
  app.append(shell);
}

function readLocalInputs(): [PlayerInput, PlayerInput] {
  if (!sim || pickPhase || ladder?.seriesWinner !== null) {
    return [EMPTY_INPUT, EMPTY_INPUT];
  }
  if (mode === 'local2p') {
    return [input.read(P1_KEYS), input.read(P2_KEYS)];
  }
  if (mode === 'vsai') {
    const human = input.read(P1_KEYS);
    const ai = thinkAI(sim, sim.ships[1], sim.ships[0]);
    return [human, ai];
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

  if (intermissionTimer > 0) {
    intermissionTimer -= dtFrame;
    if (intermissionTimer <= 0) {
      intermissionTimer = 0;
      intermissionText = null;
      enterPickPhase();
    }
    accum = 0;
  }

  if (countdown > 0 && !pickPhase && intermissionTimer <= 0) {
    countdown -= dtFrame;
    const sec = Math.ceil(countdown);
    if (sec !== lastCountdownSec && sec >= 1) {
      lastCountdownSec = sec;
      countdownLabel = String(sec);
      sound.countdownBeep(false);
    }
    if (countdown <= 0) {
      countdown = 0;
      countdownLabel = 'YEET';
      sound.countdownBeep(true);
      flashCallout('YEET', 0.7);
      sound.taunt(sim.ships[0].shipId, false);
      setTimeout(() => {
        if (sim) sound.taunt(sim.ships[1].shipId, false);
      }, 180);
      setTimeout(() => {
        if (countdownLabel === 'YEET') countdownLabel = null;
      }, 450);
    } else if (countdown > 0) {
      countdownLabel = String(Math.max(1, sec));
    }
    accum = 0;
  }

  if (hitStop > 0) {
    hitStop -= dtFrame;
    accum = 0;
  } else if (!killCam) {
    accum += dtFrame;
  }

  // Anime slow-mo kill replay + football booth commentary
  if (killCam) {
    killCam.elapsed += dtFrame;
    const u = Math.min(1, killCam.elapsed / killCam.duration);
    while (
      killCam.lineIdx + 1 < killCam.lines.length &&
      u >= killCam.lines[killCam.lineIdx + 1]!.at
    ) {
      killCam.lineIdx += 1;
      killCam.line = killCam.lines[killCam.lineIdx]!.text;
      flashCallout(killCam.line, 1.55);
      if (/GOAL|STRIKE|DONE IT|WILD|BOTH DOWN|UNBELIEVABLE|WORLD CLASS/.test(killCam.line)) {
        sound.ability('nova');
        world3d?.addShake(8);
      } else if (/OHHH|THROUGH|PLATE|LOOK/.test(killCam.line)) {
        sound.ability('ring');
      }
    }
    if (killCam.elapsed >= killCam.duration) {
      killCam = null;
      onFightEnded();
    }
    accum = 0;
  }

  const frozen =
    pausedOnline ||
    pickPhase ||
    intermissionTimer > 0 ||
    countdown > 0 ||
    hitStop > 0 ||
    !!killCam;

  // Skill purse grows from play, not clock time
  if (!frozen && ladder?.seriesWinner === null && sim.winner === null) {
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
    } else if (ladder?.seriesWinner === null) {
      while (accum >= DT) {
        const inputs = readLocalInputs();
        stepSim(sim, inputs);
        pushKillSnap(sim);
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
    mode === 'vsai'
      ? ['YOU', 'CPU']
      : mode === 'online'
        ? onlineYou === 0
          ? ['YOU', 'OPP']
          : ['OPP', 'YOU']
        : ['P1', 'P2'];

  const human = humanSide();
  const myHp = sim.ships[human].alive
    ? sim.ships[human].hp / sim.ships[human].maxHp
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
    line: string;
  } | null = null;
  let killCamHud: {
    progress: number;
    focusX: number;
    focusY: number;
    line: string;
  } | null = null;
  if (killCam && killCam.frames.length > 0) {
    const u = Math.min(1, killCam.elapsed / killCam.duration);
    // Crawl through frames - early action quicker, linger on the kill
    const replayU = u < 0.88 ? u / 0.88 : 1;
    const biased = Math.pow(replayU, 1.85);
    const maxIdx = Math.max(0, killCam.frames.length - 1);
    const f = biased * maxIdx;
    const i0 = Math.min(maxIdx, Math.floor(f));
    const i1 = Math.min(maxIdx, i0 + 1);
    const frac = f - i0;
    const snap =
      i0 === i1
        ? killCam.frames[i0]!
        : interpolateKillSnap(killCam.frames[i0]!, killCam.frames[i1]!, frac);
    drawState = buildDrawState(sim, snap);
    // World3D needs world focus; HUD overlay needs screen focus
    killCamOpts = {
      progress: u,
      focusX: killCam.focusX,
      focusY: killCam.focusY,
      line: killCam.line,
    };
  }

  const screenFloats = floats.map((f) => {
    const p = world3d!.worldToScreen(f.x, f.y);
    return { ...f, x: p.x, y: p.y };
  });

  const drawOpts = {
    labels,
    ladder,
    intermission: intermissionText,
    seriesOver: ladder?.seriesWinner !== null,
    callout,
    calloutLife,
    style,
    combo,
    floats: screenFloats,
    countdown: countdown > 0 || countdownLabel === 'YEET' ? countdownLabel : null,
    danger,
    killCam: killCamOpts,
    dt: dtFrame,
    focusSide: human,
    localSlot: human,
    credits: credits[human],
    boutPurse: Math.floor(boutPurse),
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
    killCamHud = {
      ...killCamOpts,
      focusX: focusScreen.x,
      focusY: focusScreen.y,
    };
  }
  renderer.drawHudOverlay(drawState, { ...drawOpts, killCam: killCamHud });

  // No CSS canvas scale - it desyncs world vs HUD and reads as ghosting
  if (canvas) {
    canvas.style.transform = '';
  }
}

function syncAudio(state: SimState, dtFrame = 1 / 60): void {
  const human = humanSide();
  const foe: 0 | 1 = human === 0 ? 1 : 0;

  // Music heat: higher when ships are low HP / lots of projectiles / style
  const danger =
    1 -
    Math.min(state.ships[0].hp / state.ships[0].maxHp, state.ships[1].hp / state.ships[1].maxHp);
  const chaos = Math.min(1, state.projectiles.length / 14);
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

  for (let i = 0; i < 2; i++) {
    const s = state.ships[i];
    sound.setThrust(
      i,
      s.alive && s.thrustTime > 0 && !pickPhase && countdown <= 0 && !killCam,
      s.afterburn > 0,
    );

    const lost = prevHp[i] - s.hp;
    if (lost > 0.5) {
      sound.hit();
      world3d?.addShake(4 + Math.min(12, lost) * 0.18);

      const attacker: 0 | 1 = i === 0 ? 1 : 0;
      const scored =
        mode === 'local2p' ? true : attacker === human && i === foe;
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
        pushFloat(s.x, s.y - 20, `-${Math.round(lost)}`, '#ff8a8a');
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
    onlineClient?.disconnect();
    onlineClient = null;
    sound.setThrust(0, false);
    sound.setThrust(1, false);
    world3d?.dispose();
    world3d = null;
    sim = null;
    ladder = null;
    sound.setTheme(null);
    screen = 'title';
    renderUI();
  }
  if (
    e.code === 'Enter' &&
    ladder?.seriesWinner !== null &&
    mode !== 'online'
  ) {
    startSeries();
  }
});

renderUI();
