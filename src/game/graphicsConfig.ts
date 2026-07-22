/** Graphics quality toggles + FPS sampling for post-match advice. */

export type EffectId =
  | 'postFx'
  | 'bloom'
  | 'chromatic'
  | 'grain'
  | 'ribbons'
  | 'worldHud'
  | 'signatureFx'
  | 'combatLights'
  | 'fireworks'
  | 'postPunch';

export type GraphicsConfig = Record<EffectId, boolean>;

export const EFFECT_LABELS: Record<EffectId, string> = {
  postFx: 'Post stack',
  bloom: 'Bloom',
  chromatic: 'Chromatic',
  grain: 'Film grain',
  ribbons: 'Trail ribbons',
  worldHud: 'World HP bars',
  signatureFx: 'Signature FX',
  combatLights: 'Combat lights',
  fireworks: 'Fireworks',
  postPunch: 'Hit punch',
};

/** Cost weight for recommendation priority (higher = drop first when struggling). */
const EFFECT_COST: Record<EffectId, number> = {
  postFx: 10,
  bloom: 9,
  grain: 5,
  chromatic: 4,
  signatureFx: 4,
  combatLights: 3,
  ribbons: 3,
  fireworks: 2,
  worldHud: 2,
  postPunch: 1,
};

const STORAGE = 'scrap-rumble-gfx-v1';

export const DEFAULT_GRAPHICS: GraphicsConfig = {
  postFx: true,
  bloom: true,
  chromatic: true,
  grain: true,
  ribbons: true,
  worldHud: true,
  signatureFx: true,
  combatLights: true,
  fireworks: true,
  postPunch: true,
};

export type FpsSnapshot = {
  samples: number;
  current: number;
  avg: number;
  min: number;
  max: number;
};

export type EffectAdvice = {
  id: EffectId;
  label: string;
  action: 'keep' | 'enable' | 'disable';
  reason: string;
};

export type PerfAdvice = {
  snapshot: FpsSnapshot;
  preset: 'ultra' | 'high' | 'medium' | 'low' | 'potato';
  summary: string;
  advice: EffectAdvice[];
  suggested: GraphicsConfig;
  changed: EffectId[];
};

export function loadGraphicsConfig(): GraphicsConfig {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { ...DEFAULT_GRAPHICS };
    const parsed = JSON.parse(raw) as Partial<GraphicsConfig>;
    return { ...DEFAULT_GRAPHICS, ...parsed };
  } catch {
    return { ...DEFAULT_GRAPHICS };
  }
}

export function saveGraphicsConfig(cfg: GraphicsConfig): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export class FpsMonitor {
  private samples = 0;
  private sum = 0;
  private min = Infinity;
  private max = 0;
  /** EMA for stable HUD readout */
  private smooth = 60;

  reset(): void {
    this.samples = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = 0;
    this.smooth = 60;
  }

  /** Call once per rendered frame with frame delta seconds. */
  sample(dt: number): void {
    if (dt <= 0 || dt > 0.5) return;
    const fps = 1 / dt;
    this.smooth += (fps - this.smooth) * 0.12;
    this.samples += 1;
    this.sum += fps;
    if (fps < this.min) this.min = fps;
    if (fps > this.max) this.max = fps;
  }

  snapshot(): FpsSnapshot {
    const avg = this.samples > 0 ? this.sum / this.samples : this.smooth;
    return {
      samples: this.samples,
      current: this.smooth,
      avg,
      min: this.samples > 0 ? this.min : this.smooth,
      max: this.samples > 0 ? this.max : this.smooth,
    };
  }
}

function cloneCfg(c: GraphicsConfig): GraphicsConfig {
  return { ...c };
}

function disableInOrder(
  cfg: GraphicsConfig,
  ids: EffectId[],
  reason: string,
  advice: EffectAdvice[],
): void {
  const sorted = [...ids].sort((a, b) => EFFECT_COST[b] - EFFECT_COST[a]);
  for (const id of sorted) {
    if (!cfg[id]) continue;
    // postFx off implies children are moot; still mark bloom/etc if post stays on
    if (id !== 'postFx' && !cfg.postFx) continue;
    cfg[id] = false;
    advice.push({
      id,
      label: EFFECT_LABELS[id],
      action: 'disable',
      reason,
    });
  }
}

function enableInOrder(
  cfg: GraphicsConfig,
  ids: EffectId[],
  reason: string,
  advice: EffectAdvice[],
): void {
  for (const id of ids) {
    if (cfg[id]) continue;
    const needsPost =
      id === 'bloom' || id === 'grain' || id === 'chromatic' || id === 'postPunch';
    if (needsPost && !cfg.postFx) {
      cfg.postFx = true;
      advice.push({
        id: 'postFx',
        label: EFFECT_LABELS.postFx,
        action: 'enable',
        reason,
      });
    }
    cfg[id] = true;
    advice.push({
      id,
      label: EFFECT_LABELS[id],
      action: 'enable',
      reason,
    });
  }
}

/**
 * Build effect recommendations from a finished bout's FPS profile.
 */
export function buildPerfAdvice(
  snap: FpsSnapshot,
  current: GraphicsConfig,
): PerfAdvice {
  const suggested = cloneCfg(current);
  const advice: EffectAdvice[] = [];
  const avg = snap.avg;
  const min = snap.min;

  let preset: PerfAdvice['preset'] = 'high';
  let summary = '';

  if (snap.samples < 30) {
    return {
      snapshot: snap,
      preset: 'high',
      summary: 'Not enough frame samples yet - keep current effects.',
      advice: [],
      suggested: current,
      changed: [],
    };
  }

  if (avg >= 55 && min >= 48) {
    preset = 'ultra';
    summary = `Smooth run (avg ${avg.toFixed(0)} · min ${min.toFixed(0)}). Safe to turn juice back on.`;
    enableInOrder(
      suggested,
      ['postFx', 'bloom', 'chromatic', 'grain', 'ribbons', 'signatureFx', 'combatLights', 'fireworks', 'worldHud', 'postPunch'],
      'FPS headroom',
      advice,
    );
  } else if (avg >= 48 && min >= 38) {
    preset = 'high';
    summary = `Solid (avg ${avg.toFixed(0)} · min ${min.toFixed(0)}). Keep the stack; drop grain if dips annoy you.`;
    if (min < 42 && suggested.grain) {
      disableInOrder(suggested, ['grain'], 'Protect the floor FPS', advice);
    }
  } else if (avg >= 36 && min >= 28) {
    preset = 'medium';
    summary = `Playable but taxed (avg ${avg.toFixed(0)} · min ${min.toFixed(0)}). Trim expensive post.`;
    disableInOrder(
      suggested,
      ['grain', 'fireworks', 'chromatic', 'postPunch'],
      'Recover frame time',
      advice,
    );
  } else if (avg >= 24) {
    preset = 'low';
    summary = `Heavy hitching (avg ${avg.toFixed(0)} · min ${min.toFixed(0)}). Cut bloom and sparkle FX.`;
    disableInOrder(
      suggested,
      ['bloom', 'grain', 'chromatic', 'signatureFx', 'combatLights', 'fireworks', 'ribbons', 'postPunch'],
      'Stabilize combat',
      advice,
    );
  } else {
    preset = 'potato';
    summary = `Struggling (avg ${avg.toFixed(0)} · min ${min.toFixed(0)}). Kill the post stack.`;
    disableInOrder(
      suggested,
      [
        'postFx',
        'bloom',
        'grain',
        'chromatic',
        'signatureFx',
        'combatLights',
        'ribbons',
        'fireworks',
        'worldHud',
        'postPunch',
      ],
      'Emergency FPS',
      advice,
    );
  }

  // Deduplicate advice by id (last wins)
  const byId = new Map<EffectId, EffectAdvice>();
  for (const a of advice) byId.set(a.id, a);
  const deduped = [...byId.values()];

  const changed = (Object.keys(suggested) as EffectId[]).filter(
    (id) => suggested[id] !== current[id],
  );

  return {
    snapshot: snap,
    preset,
    summary,
    advice: deduped.filter((a) => a.action !== 'keep'),
    suggested,
    changed,
  };
}

export function adviceLines(perf: PerfAdvice, max = 4): string[] {
  const lines: string[] = [
    `FPS ${perf.snapshot.avg.toFixed(0)} avg · ${perf.snapshot.min.toFixed(0)} low · ${perf.snapshot.max.toFixed(0)} high`,
  ];
  if (perf.changed.length === 0) {
    lines.push(perf.summary);
    return lines.slice(0, max);
  }
  const offs = perf.advice.filter((a) => a.action === 'disable').map((a) => a.label);
  const ons = perf.advice.filter((a) => a.action === 'enable').map((a) => a.label);
  if (offs.length) lines.push(`OFF · ${offs.slice(0, 4).join(', ')}`);
  if (ons.length) lines.push(`ON · ${ons.slice(0, 4).join(', ')}`);
  lines.push(perf.summary);
  return lines.slice(0, max);
}
