import { SHIPS } from './ships';
import {
  VIEW_H as ARENA_H,
  VIEW_W as ARENA_W,
  PLANET_R,
  PLANET_X,
  PLANET_Y,
  type ShipRuntime,
  type SimState,
} from './types';
import type { LadderState } from './fleet';
import { shipsRemaining } from './fleet';
import { gravityLabel } from './simulation';

interface Star {
  x: number;
  y: number;
  z: number;
  tw: number;
}

export interface DrawOpts {
  localSlot?: 0 | 1;
  /** Which ship the chase cam must never lose (human / local player) */
  focusSide?: 0 | 1;
  labels?: [string, string];
  showHud?: boolean;
  ladder?: LadderState | null;
  intermission?: string | null;
  seriesOver?: boolean;
  /** Floating callout e.g. "DOUBLE KILL" / "STREAK x3" */
  callout?: string | null;
  calloutLife?: number;
  /** In-fight style meter 0-100 */
  style?: number;
  combo?: number;
  /** Floating damage / style pops */
  floats?: { x: number; y: number; text: string; life: number; maxLife: number; color: string }[];
  /** Pre-fight countdown label */
  countdown?: string | null;
  /** Low-HP danger 0-1 for vignette */
  danger?: number;
  seriesStats?: {
    streak: number;
    bestCombo: number;
    damage: number;
    kills: number;
  } | null;
  credits?: number;
  boutPurse?: number;
  /** Real frame delta for smooth camera / VFX when sim is frozen */
  dt?: number;
  /** Anime kill-cam slow-mo replay */
  killCam?: {
    progress: number;
    focusX: number;
    focusY: number;
    line?: string;
  } | null;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private t = 0;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    for (let i = 0; i < 140; i++) {
      this.stars.push({
        x: Math.random() * ARENA_W,
        y: Math.random() * ARENA_H,
        z: 0.3 + Math.random() * 1.2,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  draw(state: SimState, opts: DrawOpts = {}): void {
    const { ctx } = this;
    this.t += 1 / 60;
    ctx.save();
    ctx.clearRect(0, 0, ARENA_W, ARENA_H);

    const bg = ctx.createRadialGradient(
      PLANET_X,
      PLANET_Y,
      40,
      PLANET_X,
      PLANET_Y,
      520,
    );
    bg.addColorStop(0, '#121a2e');
    bg.addColorStop(0.45, '#080c18');
    bg.addColorStop(1, '#03050c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, ARENA_W, ARENA_H);

    this.drawStars();
    this.drawPlanet();
    this.drawEffects(state);
    this.drawProjectiles(state);
    this.drawDrones(state);
    this.drawAsteroids(state);
    for (const ship of state.ships) {
      if (ship.alive) this.drawShip(ship);
    }
    if (opts.showHud !== false) {
      this.drawHud(state, opts);
    }
    ctx.restore();
  }

  /** Transparent overlay HUD for the 3D view */
  drawHudOverlay(state: SimState, opts: DrawOpts = {}): void {
    const { ctx } = this;
    this.t += 1 / 60;
    ctx.clearRect(0, 0, ARENA_W, ARENA_H);
    this.drawHud(state, opts);
  }

  private drawStars(): void {
    const { ctx } = this;
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.t * 2 + s.tw));
      ctx.fillStyle = `rgba(210, 230, 255, ${a * s.z * 0.7})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.z * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPlanet(): void {
    const { ctx } = this;
    const atmo = ctx.createRadialGradient(
      PLANET_X,
      PLANET_Y,
      PLANET_R * 0.7,
      PLANET_X,
      PLANET_Y,
      PLANET_R * 2.2,
    );
    atmo.addColorStop(0, 'rgba(56, 140, 220, 0.35)');
    atmo.addColorStop(0.5, 'rgba(40, 90, 160, 0.12)');
    atmo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = atmo;
    ctx.beginPath();
    ctx.arc(PLANET_X, PLANET_Y, PLANET_R * 2.2, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createRadialGradient(
      PLANET_X - 12,
      PLANET_Y - 14,
      8,
      PLANET_X,
      PLANET_Y,
      PLANET_R,
    );
    body.addColorStop(0, '#6ec8ff');
    body.addColorStop(0.4, '#2a6fb0');
    body.addColorStop(0.75, '#143a68');
    body.addColorStop(1, '#0a1c34');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(PLANET_X, PLANET_Y, PLANET_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(40, 140, 90, 0.45)';
    ctx.beginPath();
    ctx.ellipse(PLANET_X - 10, PLANET_Y + 4, 18, 10, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(PLANET_X + 14, PLANET_Y - 12, 10, 7, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(PLANET_X + 8, PLANET_Y + 6, PLANET_R * 0.95, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawShip(ship: ShipRuntime): void {
    const { ctx } = this;
    const def = SHIPS[ship.shipId];
    const cloaked = ship.cloak > 0.05;
    const alpha = cloaked ? 0.18 + ship.cloak * 0.15 : 1;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.globalAlpha = alpha;

    if (ship.thrustTime > 0 || ship.afterburn > 0 || ship.panic > 0) {
      const flicker = 0.7 + Math.random() * 0.3;
      const len = 14 + (ship.afterburn > 0 ? 18 : 0) + (ship.panic > 0 ? 10 : 0);
      const g = ctx.createLinearGradient(-def.radius, 0, -def.radius - len, 0);
      g.addColorStop(
        0,
        ship.afterburn > 0
          ? `rgba(255,120,40,${flicker})`
          : `rgba(120,200,255,${flicker})`,
      );
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-def.radius + 2, -5);
      ctx.lineTo(-def.radius - len, 0);
      ctx.lineTo(-def.radius + 2, 5);
      ctx.closePath();
      ctx.fill();
    }

    if (ship.shield > 0) {
      ctx.strokeStyle = `rgba(255, 220, 100, ${0.35 + 0.35 * Math.sin(this.t * 10)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, def.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.beginPath();
    const hull = def.hull;
    ctx.moveTo(hull[0].x, hull[0].y);
    for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
    ctx.closePath();
    ctx.fillStyle = ship.flash > 0 ? '#ffffff' : def.color;
    ctx.fill();
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = def.accent;
    ctx.beginPath();
    ctx.arc(6, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    if (ship.cone > 0) {
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 200, -0.55, 0.55);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

    if (ship.tractor > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(232, 121, 249, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, 300, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (ship.limpets > 0) {
      ctx.save();
      ctx.fillStyle = '#e879f9';
      for (let i = 0; i < ship.limpets; i++) {
        const a = this.t * 2 + (i / ship.limpets) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(
          ship.x + Math.cos(a) * (def.radius + 6),
          ship.y + Math.sin(a) * (def.radius + 6),
          3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawProjectiles(state: SimState): void {
    const { ctx } = this;
    for (const p of state.projectiles) {
      ctx.save();
      const ang = Math.atan2(p.vy, p.vx);
      ctx.translate(p.x, p.y);
      ctx.rotate(ang);
      switch (p.kind) {
        case 'nuke':
          ctx.fillStyle = '#ff6b2d';
          ctx.shadowColor = '#ff6b2d';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffe08a';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'flame':
          ctx.fillStyle = `rgba(255, ${100 + Math.random() * 80}, 40, 0.85)`;
          ctx.beginPath();
          ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'spore':
          ctx.fillStyle = '#84cc16';
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'limpet':
          ctx.fillStyle = '#e879f9';
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'butt':
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-8, -3, 14, 6);
          break;
        case 'crystal':
        case 'shard':
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.moveTo(8, 0);
          ctx.lineTo(-4, 4);
          ctx.lineTo(-4, -4);
          ctx.closePath();
          ctx.fill();
          break;
        case 'heavy':
          ctx.fillStyle = '#4aa3ff';
          ctx.shadowColor = '#4aa3ff';
          ctx.shadowBlur = 8;
          ctx.fillRect(-6, -2.5, 14, 5);
          break;
        default:
          ctx.fillStyle = '#e8f0ff';
          ctx.shadowColor = '#7cf5c8';
          ctx.shadowBlur = 6;
          ctx.fillRect(-5, -1.5, 12, 3);
      }
      ctx.restore();
    }
  }

  private drawDrones(state: SimState): void {
    const { ctx } = this;
    for (const d of state.drones) {
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.fillStyle = '#a3e635';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, 5);
      ctx.lineTo(-6, -5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawAsteroids(state: SimState): void {
    const { ctx } = this;
    const colors: Record<string, string> = {
      rock: '#9a8468',
      heal: '#4ade80',
      energy: '#38bdf8',
      power: '#f97316',
      haste: '#c084fc',
      shield: '#fbbf24',
    };
    for (const a of state.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.spin);
      ctx.fillStyle = colors[a.kind] ?? '#9a8468';
      if (a.kind === 'rock') {
        ctx.beginPath();
        const n = 7;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          const r = a.radius * (0.75 + ((i * 37) % 5) * 0.06);
          if (i === 0) ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r);
          else ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, a.radius * 1.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(0, -a.radius);
        ctx.lineTo(a.radius * 0.7, 0);
        ctx.lineTo(0, a.radius);
        ctx.lineTo(-a.radius * 0.7, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawEffects(state: SimState): void {
    const { ctx } = this;
    for (const e of state.effects) {
      const t = 1 - e.life / e.maxLife;
      const a = 1 - t;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = e.color;
      ctx.fillStyle = e.color;
      ctx.lineWidth = 2;
      const r = e.radius * (0.4 + t * 1.2);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      if (e.kind === 'explosion' || e.kind === 'nova') {
        ctx.globalAlpha = a * 0.35;
        ctx.fill();
        ctx.globalAlpha = a;
        ctx.stroke();
      } else {
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawHud(state: SimState, opts: DrawOpts): void {
    const labels = opts.labels;
    const ladder = opts.ladder;
    this.drawPlayerHud(state.ships[0], 24, 20, labels?.[0] ?? 'P1', true, ladder, 0);
    this.drawPlayerHud(
      state.ships[1],
      ARENA_W - 264,
      20,
      labels?.[1] ?? 'P2',
      false,
      ladder,
      1,
    );

    if (ladder) {
      const { ctx } = this;
      ctx.save();
      ctx.font = '12px Nunito, sans-serif';
      ctx.fillStyle = '#6a7a94';
      ctx.textAlign = 'center';
      const grav =
        state.gravityTier === 0
          ? '#7cf5c8'
          : state.gravityTier === 2
            ? '#f43f5e'
            : '#8ab4d8';
      ctx.fillText(
        `FIGHT ${ladder.fight}  ·  ${shipsRemaining(ladder, 0)} vs ${shipsRemaining(ladder, 1)} ships left`,
        ARENA_W / 2,
        18,
      );
      ctx.fillStyle = grav;
      ctx.fillText(gravityLabel(state.gravityTier), ARENA_W / 2, 36);
      if (opts.credits !== undefined) {
        ctx.fillStyle = '#ffe08a';
        ctx.font = '12px Nunito, sans-serif';
        const purse = opts.boutPurse ?? 0;
        ctx.fillText(
          purse > 0
            ? `$${opts.credits}  ·  purse $${purse}`
            : `$${opts.credits}`,
          ARENA_W / 2,
          54,
        );
      }
      ctx.restore();
    }

    // Style / combo meter - quiet so HULL/JUICE stay primary
    if (!opts.seriesOver && !opts.intermission && !opts.killCam && (opts.style ?? 0) > 25) {
      const { ctx } = this;
      const style = opts.style ?? 0;
      const combo = opts.combo ?? 0;
      const bx = ARENA_W / 2 - 90;
      const by = ARENA_H - 36;
      ctx.save();
      ctx.fillStyle = 'rgba(8,14,24,0.7)';
      ctx.fillRect(bx - 8, by - 14, 196, 28);
      this.bar(bx, by, 180, 8, style / 100, style > 80 ? '#ffe08a' : '#3ee0c4', '#152030');
      ctx.font = '10px Nunito, sans-serif';
      ctx.fillStyle = '#8ab4d8';
      ctx.textAlign = 'center';
      ctx.fillText(
        combo > 1 ? `HYPE  ·  COMBO x${combo}` : 'HYPE',
        ARENA_W / 2,
        by - 4,
      );
      ctx.restore();
    }

    // Floating damage pops
    if (opts.floats) {
      const { ctx } = this;
      for (const f of opts.floats) {
        const t = 1 - f.life / f.maxLife;
        ctx.save();
        ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
        ctx.font = `700 ${14 + Math.min(10, f.text.length > 3 ? 4 : 8)}px Bungee, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = f.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 3;
        const y = f.y - t * 36;
        ctx.strokeText(f.text, f.x, y);
        ctx.fillText(f.text, f.x, y);
        ctx.restore();
      }
    }

    // Low HP red vignette
    const danger = opts.danger ?? 0;
    if (danger > 0.05) {
      const { ctx } = this;
      ctx.save();
      const g = ctx.createRadialGradient(
        ARENA_W / 2,
        ARENA_H / 2,
        ARENA_H * 0.25,
        ARENA_W / 2,
        ARENA_H / 2,
        ARENA_H * 0.75,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(180, 20, 40, ${0.15 + danger * 0.45})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
      ctx.restore();
    }

    if (opts.countdown) {
      const { ctx } = this;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.font = '900 72px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = opts.countdown === 'YEET' ? '#7cffb2' : '#ffe566';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 8;
      ctx.strokeText(opts.countdown, ARENA_W / 2, ARENA_H / 2 + 20);
      ctx.fillText(opts.countdown, ARENA_W / 2, ARENA_H / 2 + 20);
      ctx.restore();
    }

    if (opts.killCam) {
      const { ctx } = this;
      const p = opts.killCam.progress;
      const bar = 52 + Math.sin(p * Math.PI) * 18;
      ctx.save();
      ctx.fillStyle = '#02040a';
      ctx.globalAlpha = 0.92;
      ctx.fillRect(0, 0, ARENA_W, bar);
      ctx.fillRect(0, ARENA_H - bar, ARENA_W, bar);
      // Radial speed lines
      ctx.globalAlpha = 0.18 + p * 0.25;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      const cx = opts.killCam.focusX;
      const cy = opts.killCam.focusY;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2 + p * 3;
        const r0 = 40 + (i % 4) * 10;
        const r1 = 220 + (i % 5) * 60;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, 0.35 + p * 1.4);
      ctx.font = '700 15px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8ab4d8';
      ctx.fillText('MATCH REPLAY', ARENA_W / 2, 22);
      ctx.font = '900 28px Bungee, sans-serif';
      ctx.fillStyle = p > 0.7 ? '#ffe08a' : '#e8f0ff';
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 5;
      const label = opts.killCam.line ?? (p > 0.72 ? 'BOOM' : 'REWIND THE CHAOS');
      ctx.strokeText(label, ARENA_W / 2, bar - 12);
      ctx.fillText(label, ARENA_W / 2, bar - 12);
      ctx.restore();
    }

    if (opts.callout && (opts.calloutLife ?? 1) > 0) {
      const { ctx } = this;
      const life = opts.calloutLife ?? 1;
      const hot = /FIRE|UNHINGED|UNSTOPPABLE|HAT|STREAK|VICTORY|FIRST|CLUTCH|COMBO|OVERCHARGE|BOOST|AEGIS|REPAIR|CAPACITOR|GOAL|STRIKE|FINISH|CROWD|WILD|YEET|BYE|OOF|CHAOS|MENACE|WRECKED|MEME|VIBES|REPLAY/.test(opts.callout);
      ctx.save();
      ctx.globalAlpha = Math.min(1, life * 2);
      const scale = 1 + (1 - Math.min(1, life)) * 0.15;
      ctx.font = `900 ${Math.round(40 * scale)}px Bungee, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hot ? '#ffe08a' : '#e8f0ff';
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 6;
      const y = ARENA_H * 0.28 - (1 - life) * 40;
      ctx.strokeText(opts.callout, ARENA_W / 2, y);
      ctx.fillText(opts.callout, ARENA_W / 2, y);
      ctx.restore();
    }

    if (opts.intermission) {
      const { ctx } = this;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, ARENA_H / 2 - 60, ARENA_W, 120);
      ctx.font = '700 28px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8f0ff';
      ctx.fillText(opts.intermission, ARENA_W / 2, ARENA_H / 2 + 4);
      ctx.font = '14px Nunito, sans-serif';
      ctx.fillStyle = '#8aa0c0';
      ctx.fillText('Winner stays wounded - no repairs', ARENA_W / 2, ARENA_H / 2 + 36);
      ctx.restore();
      return;
    }

    if (opts.seriesOver && ladder?.seriesWinner !== null && ladder) {
      const { ctx } = this;
      const w = ladder.seriesWinner;
      const name = labels?.[w] ?? `P${w + 1}`;
      const stats = opts.seriesStats;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, ARENA_H / 2 - 100, ARENA_W, stats ? 200 : 120);
      ctx.font = '700 32px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(
        name === 'YOU' ? 'YOU WIN THE SERIES' : `${name} WINS THE SERIES`,
        ARENA_W / 2,
        ARENA_H / 2 - 40,
      );
      if (stats) {
        ctx.font = '14px Nunito, sans-serif';
        ctx.fillStyle = '#c8e0f5';
        ctx.fillText(
          `Kills ${stats.kills}  ·  Damage ${Math.round(stats.damage)}  ·  Best combo x${stats.bestCombo}  ·  Streak ${stats.streak}`,
          ARENA_W / 2,
          ARENA_H / 2 + 4,
        );
      }
      ctx.font = '16px Nunito, sans-serif';
      ctx.fillStyle = '#8aa0c0';
      ctx.fillText('Press Enter for rematch  ·  Esc for menu', ARENA_W / 2, ARENA_H / 2 + 48);
      ctx.restore();
      return;
    }

    if (state.winner !== null && !opts.intermission && !opts.seriesOver && !opts.callout && !opts.killCam) {
      const { ctx } = this;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, ARENA_H / 2 - 40, ARENA_W, 80);
      ctx.font = '700 28px Bungee, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8f0ff';
      const text =
        state.winner === -1
          ? 'DOUBLE KILL'
          : (() => {
              const name = labels?.[state.winner] ?? `P${state.winner + 1}`;
              return name === 'YOU' ? 'YOU WIN THE BOUT' : `${name} WINS THE BOUT`;
            })();
      ctx.fillText(text, ARENA_W / 2, ARENA_H / 2 + 8);
      ctx.restore();
    }
  }

  private drawPlayerHud(
    ship: ShipRuntime,
    x: number,
    y: number,
    label: string,
    left: boolean,
    ladder: LadderState | null | undefined,
    side: 0 | 1,
  ): void {
    const { ctx } = this;
    const def = SHIPS[ship.shipId];
    ctx.save();
    ctx.font = '12px Nunito, sans-serif';
    ctx.fillStyle = def.color;
    ctx.textAlign = left ? 'left' : 'right';

    // Race portrait plate (SC2 sidebar identity)
    const px = left ? x : x + 240 - 36;
    this.drawPortrait(px, y - 2, 36, 36, def.color, def.accent, ship.shipId);

    const nameX = left ? x + 44 : x + 196;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(`${label}  ${def.name}`, nameX, y + 10);
    ctx.font = '10px Nunito, sans-serif';
    ctx.fillStyle = '#6a7a94';
    ctx.fillText(def.specialName, nameX, y + 24);

    // HULL / JUICE segmented meters
    const crewSegs = Math.max(8, Math.min(20, Math.round(ship.maxHp / 8)));
    const battSegs = Math.max(8, Math.min(16, Math.round(ship.maxEnergy / 10)));
    ctx.font = '9px Nunito, sans-serif';
    ctx.fillStyle = '#5a6a80';
    ctx.textAlign = 'left';
    ctx.fillText('HULL', x, y + 42);
    ctx.fillText('JUICE', x, y + 60);
    this.segmentBar(x + 36, y + 34, 204, 10, ship.hp / ship.maxHp, '#3ee070', '#1a2a1a', crewSegs);
    this.segmentBar(
      x + 36,
      y + 52,
      204,
      10,
      ship.energy / ship.maxEnergy,
      def.color,
      '#152030',
      battSegs,
    );

    const chips: { t: string; c: string }[] = [];
    if (ship.powerBoost > 0) chips.push({ t: 'PWR', c: '#f97316' });
    if (ship.hasteBoost > 0) chips.push({ t: 'SPD', c: '#c084fc' });
    if (ship.shield > 0) chips.push({ t: 'SHD', c: '#fbbf24' });
    if (ship.trailHeat > 0.35) chips.push({ t: 'WHIP', c: '#7cf5c8' });
    let chipY = y + 68;
    if (chips.length) {
      ctx.font = '700 10px Nunito, sans-serif';
      let cx = left ? x : x + 240;
      for (const chip of chips) {
        const w = 34;
        if (!left) cx -= w + 4;
        ctx.fillStyle = 'rgba(8,14,24,0.75)';
        ctx.fillRect(cx, chipY, w, 12);
        ctx.fillStyle = chip.c;
        ctx.textAlign = 'center';
        ctx.fillText(chip.t, cx + w / 2, chipY + 9);
        if (left) cx += w + 4;
      }
      chipY += 16;
    }

    if (ladder) {
      const fleet = ladder.fleets[side];
      const pipY = chipY + 8;
      ctx.textAlign = left ? 'left' : 'right';
      for (let i = 0; i < fleet.length; i++) {
        const s = fleet[i];
        const ppx = left ? x + i * 18 : x + 240 - 12 - i * 18;
        const col = SHIPS[s.shipId].color;
        ctx.fillStyle = s.eliminated ? '#2a3344' : col;
        ctx.globalAlpha = s.eliminated ? 0.35 : i === ladder.active[side] ? 1 : 0.7;
        ctx.beginPath();
        ctx.arc(ppx, pipY, 5, 0, Math.PI * 2);
        ctx.fill();
        if (i === ladder.active[side] && !s.eliminated) {
          ctx.strokeStyle = '#e8f0ff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawPortrait(
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    accent: string,
    seed: string,
  ): void {
    const { ctx } = this;
    let hsh = 0;
    for (let i = 0; i < seed.length; i++) hsh = (hsh * 31 + seed.charCodeAt(i)) | 0;
    ctx.fillStyle = '#0a1220';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // Abstract alien face from seed
    ctx.fillStyle = color;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 10 + (hsh & 3), 11 + ((hsh >> 2) & 3), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = accent;
    const eyeY = cy - 2;
    const eyeGap = 5 + ((hsh >> 4) & 3);
    ctx.beginPath();
    ctx.arc(cx - eyeGap, eyeY, 2.2, 0, Math.PI * 2);
    ctx.arc(cx + eyeGap, eyeY, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a1220';
    ctx.fillRect(cx - 4, cy + 6, 8, 2 + ((hsh >> 6) & 2));
  }

  private segmentBar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    fill: string,
    bg: string,
    segments: number,
  ): void {
    const { ctx } = this;
    const n = Math.max(4, segments);
    const gap = 1.5;
    const sw = (w - (n - 1) * gap) / n;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    const filled = Math.ceil(Math.max(0, Math.min(1, ratio)) * n);
    for (let i = 0; i < filled; i++) {
      ctx.fillStyle = fill;
      ctx.fillRect(x + i * (sw + gap), y, sw, h);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.strokeRect(x, y, w, h);
  }

  private bar(
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
    fill: string,
    bg: string,
  ): void {
    const { ctx } = this;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(x, y, w, h);
  }
}
