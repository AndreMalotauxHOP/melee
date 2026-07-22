/** Compact shareable kill-cam clip vault. */

export type ReplayClip = {
  id: string;
  createdAt: number;
  killer: string;
  victim: string;
  subtitle: string;
  signature: string;
  /** Compressed hull samples 0-1 for sparkline */
  victimHp: number[];
  durationSec: number;
};

const STORAGE = 'scrap-rumble-clips-v1';
const MAX = 12;

export function loadClips(): ReplayClip[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReplayClip[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveClip(clip: Omit<ReplayClip, 'id' | 'createdAt'>): ReplayClip {
  const full: ReplayClip = {
    ...clip,
    id: `clip-${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  const all = [full, ...loadClips()].slice(0, MAX);
  try {
    localStorage.setItem(STORAGE, JSON.stringify(all));
  } catch {
    /* quota */
  }
  return full;
}

export function clipShareText(c: ReplayClip): string {
  return [
    `SCRAP RUMBLE CLIP`,
    `${c.killer} finished ${c.victim}`,
    c.signature,
    c.subtitle,
    `Yard clip · ${new Date(c.createdAt).toLocaleString()}`,
  ].join('\n');
}

export async function copyClip(c: ReplayClip): Promise<boolean> {
  const text = clipShareText(c);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    console.log(text);
    return false;
  }
}
