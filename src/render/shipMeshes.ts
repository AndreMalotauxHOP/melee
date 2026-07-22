import * as THREE from 'three';
import type { ShipId } from '../game/types';
import { SHIPS } from '../game/ships';

type TexStyle = 'panels' | 'plated' | 'organic' | 'crystal' | 'carbon' | 'bio';

const texCache = new Map<string, THREE.CanvasTexture>();

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Procedural hull albedo with panels, rivets, stripes, and wear. */
function makeHullTexture(
  baseHex: string,
  accentHex: string,
  seed: number,
  style: TexStyle,
): THREE.CanvasTexture {
  const key = `${baseHex}|${accentHex}|${seed}|${style}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle noise / wear
  for (let i = 0; i < 1800; i++) {
    const x = hash(seed + i * 3.1) * size;
    const y = hash(seed + i * 7.7) * size;
    const a = 0.04 + hash(seed + i) * 0.1;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1 + hash(seed + i * 2) * 2, 1);
  }

  if (style === 'panels' || style === 'plated' || style === 'carbon') {
    const cell = style === 'plated' ? 28 : style === 'carbon' ? 16 : 32;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= size; x += cell) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += cell) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(size, y + 0.5);
      ctx.stroke();
    }
    // Rivets
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    for (let x = cell; x < size; x += cell) {
      for (let y = cell; y < size; y += cell) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  if (style === 'organic' || style === 'bio') {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const y0 = hash(seed + i * 9) * size;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y0 + Math.sin(x * 0.04 + i) * 10);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = hash(seed + i * 11) * size;
      const y = hash(seed + i * 13) * size;
      const r = 4 + hash(seed + i * 17) * 14;
      ctx.fillStyle = `rgba(0,0,0,${0.08 + hash(seed + i) * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, hash(seed + i) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (style === 'crystal') {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      const x0 = hash(seed + i) * size;
      const y0 = hash(seed + i * 3) * size;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + 40 + hash(seed + i * 5) * 60, y0 + 20 + hash(seed + i * 7) * 50);
      ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const x = hash(seed + i * 19) * size;
      const y = hash(seed + i * 23) * size;
      ctx.fillStyle = `rgba(255,255,255,${0.08 + hash(seed + i) * 0.15})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y + 8);
      ctx.lineTo(x + 6, y + 22);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Accent stripe band
  ctx.fillStyle = accentHex;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, size * 0.42, size, size * 0.1);
  ctx.globalAlpha = 0.3;
  ctx.fillRect(size * 0.7, 0, size * 0.08, size);
  ctx.globalAlpha = 1;

  // Edge highlight
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function makeRoughMap(seed: number): THREE.CanvasTexture {
  const key = `rough-${seed}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = 90 + hash(seed + x * 0.7 + y * 1.3) * 100;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  texCache.set(key, tex);
  return tex;
}

function hullMat(
  color: string,
  accent: string,
  seed: number,
  style: TexStyle,
  metal = 0.7,
  rough = 0.38,
): THREE.MeshStandardMaterial {
  const map = makeHullTexture(color, accent, seed, style);
  map.repeat.set(2, 2);
  return new THREE.MeshStandardMaterial({
    map,
    color: '#ffffff',
    metalness: metal,
    roughness: rough,
    roughnessMap: makeRoughMap(seed),
    emissive: accent,
    emissiveIntensity: 0.12,
  });
}

function glowMat(color: string, intensity = 1.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.2,
    roughness: 0.25,
  });
}

function darkMat(seed: number): THREE.MeshStandardMaterial {
  return hullMat('#1a2233', '#334155', seed + 99, 'carbon', 0.85, 0.45);
}

function glassMat(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.1,
    roughness: 0.05,
    transmission: 0.55,
    thickness: 0.4,
    transparent: true,
    opacity: 0.85,
    emissive: color,
    emissiveIntensity: 0.35,
  });
}

function add(
  g: THREE.Group,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  g.add(m);
  return m;
}

function addGreebles(
  g: THREE.Group,
  mat: THREE.Material,
  cx: number,
  cy: number,
  cz: number,
  n: number,
  seed: number,
): void {
  for (let i = 0; i < n; i++) {
    const sx = 0.08 + hash(seed + i) * 0.18;
    const sy = 0.06 + hash(seed + i + 1) * 0.12;
    const sz = 0.08 + hash(seed + i + 2) * 0.16;
    const ox = (hash(seed + i + 3) - 0.5) * 0.9;
    const oy = (hash(seed + i + 4) - 0.5) * 0.35;
    const oz = (hash(seed + i + 5) - 0.5) * 0.7;
    add(g, new THREE.BoxGeometry(sx, sy, sz), mat, cx + ox, cy + oy, cz + oz);
  }
}

function addWindows(
  g: THREE.Group,
  glass: THREE.Material,
  x: number,
  y: number,
  z: number,
  count: number,
  spacing: number,
): void {
  for (let i = 0; i < count; i++) {
    add(g, new THREE.BoxGeometry(0.12, 0.08, 0.06), glass, x - i * spacing, y, z);
  }
}

function addThrusterPair(
  g: THREE.Group,
  glow: THREE.Material,
  dark: THREE.Material,
  x: number,
  spread: number,
): void {
  for (const side of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.12, 0.16, 0.35, 10), dark, x, 0, side * spread, 0, 0, Math.PI / 2);
    add(g, new THREE.SphereGeometry(0.1, 10, 8), glow, x - 0.12, 0, side * spread);
  }
}

/** Big silly eyes + smile so every hull looks like a cartoon menace. */
function addGoofFace(
  g: THREE.Group,
  _glass: THREE.Material,
  accent: THREE.Material,
  id: ShipId,
): void {
  const heavy = id === 'solhammer' || id === 'bulwark' || id === 'brood' || id === 'glacier';
  const tiny = id === 'zephyr' || id === 'shade' || id === 'scuttle';
  const eyeR = heavy ? 0.22 : tiny ? 0.11 : 0.16;
  const pupilR = eyeR * 0.42;
  const spread = heavy ? 0.38 : tiny ? 0.16 : 0.26;
  const noseX = heavy ? 0.85 : tiny ? 0.55 : 0.7;
  const eyeY = heavy ? 0.38 : tiny ? 0.14 : 0.22;

  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x12203a });
  for (const side of [-1, 1] as const) {
    add(g, new THREE.SphereGeometry(eyeR, 12, 10), white, noseX, eyeY, side * spread);
    add(
      g,
      new THREE.SphereGeometry(pupilR, 10, 8),
      pupil,
      noseX + eyeR * 0.35,
      eyeY - pupilR * 0.15,
      side * spread,
    );
  }
  // Little brow / blush for extra silly
  add(g, new THREE.BoxGeometry(eyeR * 1.6, 0.04, 0.06), accent, noseX - 0.05, eyeY + eyeR * 0.9, spread);
  add(g, new THREE.BoxGeometry(eyeR * 1.6, 0.04, 0.06), accent, noseX - 0.05, eyeY + eyeR * 0.9, -spread);
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(eyeR * 1.1, 0.035, 6, 16, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0xffe566 }),
  );
  smile.position.set(noseX + 0.05, eyeY - eyeR * 1.15, 0);
  smile.rotation.z = Math.PI;
  smile.rotation.y = Math.PI / 2;
  g.add(smile);
}

/** Build a detailed textured 3D ship. Nose points +X (angle 0). */
export function buildShipMesh(id: ShipId): THREE.Group {
  const def = SHIPS[id];
  const g = new THREE.Group();
  g.name = id;
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const body = hullMat(def.color, def.accent, seed, styleFor(id));
  const accent = glowMat(def.accent, 1.15);
  const dark = darkMat(seed);
  const glass = glassMat(def.accent);

  switch (id) {
    case 'solhammer': {
      add(g, new THREE.BoxGeometry(2.6, 0.65, 1.2), body, -0.05);
      add(g, new THREE.BoxGeometry(1.4, 0.35, 1.35), dark, -0.3, 0.28);
      add(g, new THREE.ConeGeometry(0.5, 1.35, 7), body, 1.55, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(1.4, 0.14, 0.65), dark, -0.55, 0, 0.85);
      add(g, new THREE.BoxGeometry(1.4, 0.14, 0.65), dark, -0.55, 0, -0.85);
      add(g, new THREE.BoxGeometry(0.7, 0.45, 0.5), accent, 0.15, 0.45);
      add(g, new THREE.BoxGeometry(0.35, 0.2, 0.35), glass, 0.35, 0.62);
      addGreebles(g, dark, -0.4, 0.2, 0, 8, seed);
      addWindows(g, glass, 0.8, 0.15, 0.55, 4, 0.22);
      addThrusterPair(g, accent, dark, -1.45, 0.35);
      add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8), dark, 0.9, 0.55, 0.3);
      break;
    }
    case 'zephyr': {
      add(g, new THREE.ConeGeometry(0.32, 2.3, 8), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(0.85, 0.05, 1.7), accent, -0.15);
      add(g, new THREE.BoxGeometry(0.5, 0.04, 0.9), dark, -0.7, 0.08);
      add(g, new THREE.SphereGeometry(0.1, 8, 8), glass, 0.7, 0.08);
      add(g, new THREE.BoxGeometry(0.35, 0.5, 0.05), dark, -0.9, 0.15);
      addThrusterPair(g, accent, dark, -1.15, 0.18);
      addGreebles(g, dark, -0.2, 0.05, 0, 4, seed);
      break;
    }
    case 'bulwark': {
      add(g, new THREE.BoxGeometry(2.1, 1.0, 1.7), body);
      add(g, new THREE.BoxGeometry(1.6, 0.4, 2.1), dark, -0.1, 0.25);
      add(g, new THREE.BoxGeometry(0.95, 0.55, 1.0), body, 1.25);
      add(g, new THREE.CylinderGeometry(0.28, 0.34, 0.45, 10), accent, 0.55, 0.7);
      add(g, new THREE.BoxGeometry(0.55, 0.12, 0.12), dark, 0.95, 0.75);
      add(g, new THREE.BoxGeometry(0.2, 0.7, 1.9), dark, -0.9, 0);
      addWindows(g, glass, 0.6, 0.35, 0.75, 3, 0.25);
      addGreebles(g, dark, -0.2, 0.1, 0.6, 10, seed);
      addThrusterPair(g, accent, dark, -1.2, 0.45);
      break;
    }
    case 'shade': {
      add(g, new THREE.ConeGeometry(0.26, 2.4, 4), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(1.0, 0.06, 1.0), dark, -0.25, 0, 0, 0, Math.PI / 4);
      add(g, new THREE.BoxGeometry(0.7, 0.04, 0.7), accent, -0.5, 0.06, 0, 0, Math.PI / 5);
      add(g, new THREE.SphereGeometry(0.14, 10, 10), accent, 0.55, 0.12);
      add(g, new THREE.SphereGeometry(0.07, 8, 8), glass, 0.85, 0.05, 0.12);
      add(g, new THREE.SphereGeometry(0.07, 8, 8), glass, 0.85, 0.05, -0.12);
      addThrusterPair(g, accent, dark, -1.2, 0.15);
      break;
    }
    case 'prism': {
      const crystal = add(g, new THREE.OctahedronGeometry(0.75, 0), body);
      crystal.scale.set(1.9, 0.55, 1.05);
      crystal.rotation.z = Math.PI / 2;
      add(g, new THREE.OctahedronGeometry(0.28, 0), accent, 1.2);
      add(g, new THREE.OctahedronGeometry(0.18, 0), glass, 0.2, 0.35);
      add(g, new THREE.OctahedronGeometry(0.14, 0), glass, -0.3, -0.25, 0.3);
      add(g, new THREE.BoxGeometry(0.4, 0.08, 0.9), dark, -0.8);
      addThrusterPair(g, accent, dark, -1.15, 0.22);
      break;
    }
    case 'brood': {
      const bodyM = add(g, new THREE.SphereGeometry(0.75, 16, 12), body);
      bodyM.scale.set(1.45, 0.72, 1.15);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(
          g,
          new THREE.SphereGeometry(0.2, 10, 8),
          accent,
          -0.25 + Math.cos(a) * 0.2,
          0.2,
          Math.sin(a) * 0.75,
        );
      }
      add(g, new THREE.ConeGeometry(0.4, 0.9, 8), dark, 1.0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.35, 0.06, 8, 16), accent, 0.5, 0, 0, 0, Math.PI / 2);
      addGreebles(g, dark, -0.5, 0.1, 0, 6, seed);
      addThrusterPair(g, accent, dark, -1.2, 0.3);
      break;
    }
    case 'cinder': {
      add(g, new THREE.CylinderGeometry(0.22, 0.38, 2.0, 10), body, 0, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.22, 0.8, 10), accent, 1.25, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(1.0, 0.07, 0.4), dark, -0.15, 0, 0.5, 0, 0, 0.3);
      add(g, new THREE.BoxGeometry(1.0, 0.07, 0.4), dark, -0.15, 0, -0.5, 0, 0, -0.3);
      add(g, new THREE.BoxGeometry(0.5, 0.35, 0.08), dark, -0.85, 0.15);
      add(g, new THREE.SphereGeometry(0.12, 8, 8), glass, 0.5, 0.18);
      addGreebles(g, dark, -0.3, 0.1, 0, 5, seed);
      add(g, new THREE.SphereGeometry(0.16, 10, 8), accent, -1.15);
      break;
    }
    case 'grappler': {
      add(g, new THREE.BoxGeometry(1.65, 0.5, 1.0), body);
      add(g, new THREE.BoxGeometry(0.9, 0.3, 0.7), dark, -0.5, 0.25);
      add(g, new THREE.BoxGeometry(1.4, 0.14, 0.16), accent, 0.45, 0, 0.75, 0, 0.45);
      add(g, new THREE.BoxGeometry(1.4, 0.14, 0.16), accent, 0.45, 0, -0.75, 0, -0.45);
      add(g, new THREE.ConeGeometry(0.14, 0.45, 5), dark, 1.2, 0, 1.0, 0, 0, -Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.14, 0.45, 5), dark, 1.2, 0, -1.0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(0.25, 0.2, 0.25), glass, 0.5, 0.35);
      addGreebles(g, dark, 0, 0.15, 0, 7, seed);
      addThrusterPair(g, accent, dark, -1.0, 0.28);
      break;
    }
    case 'scuttle': {
      const bug = add(g, new THREE.SphereGeometry(0.5, 14, 10), body);
      bug.scale.set(1.55, 0.65, 1.05);
      add(g, new THREE.ConeGeometry(0.22, 1.0, 6), dark, -0.95, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.SphereGeometry(0.13, 8, 8), accent, 0.5, 0.18, 0.22);
      add(g, new THREE.SphereGeometry(0.13, 8, 8), accent, 0.5, 0.18, -0.22);
      add(g, new THREE.SphereGeometry(0.06, 6, 6), glass, 0.58, 0.2, 0.22);
      add(g, new THREE.SphereGeometry(0.06, 6, 6), glass, 0.58, 0.2, -0.22);
      for (let i = 0; i < 3; i++) {
        add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5), dark, -0.1 - i * 0.2, -0.2, 0.35, 0.6);
        add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.45, 5), dark, -0.1 - i * 0.2, -0.2, -0.35, -0.6);
      }
      addThrusterPair(g, accent, dark, -1.15, 0.12);
      break;
    }
    case 'nullpoint': {
      add(g, new THREE.TorusGeometry(0.6, 0.14, 12, 32), body, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.4, 0.06, 8, 24), accent, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.SphereGeometry(0.32, 16, 16), accent);
      add(g, new THREE.ConeGeometry(0.16, 1.15, 6), dark, 1.0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.6, 5), dark, -0.9, 0.2, 0.2, 0.4, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.6, 5), dark, -0.9, -0.2, -0.2, -0.4, 0, Math.PI / 2);
      addThrusterPair(g, accent, dark, -0.7, 0.35);
      break;
    }
    case 'stormlance': {
      add(g, new THREE.CylinderGeometry(0.14, 0.2, 2.4, 8), body, 0, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.22, 0.8, 5), accent, 1.45, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(0.7, 0.05, 1.25), dark, -0.15);
      add(g, new THREE.BoxGeometry(0.4, 0.4, 0.05), accent, -0.5, 0.15);
      add(g, new THREE.SphereGeometry(0.1, 8, 8), glass, 0.4, 0.15);
      addGreebles(g, dark, -0.4, 0.08, 0, 5, seed);
      addThrusterPair(g, accent, dark, -1.25, 0.2);
      break;
    }
    case 'mirage': {
      const blade = add(g, new THREE.TetrahedronGeometry(0.6, 0), body);
      blade.scale.set(2.3, 0.48, 0.95);
      blade.rotation.z = Math.PI / 2;
      add(g, new THREE.TetrahedronGeometry(0.25, 0), accent, 0.9, 0.1);
      add(g, new THREE.SphereGeometry(0.18, 10, 10), glass, 0.25, 0.18);
      add(g, new THREE.BoxGeometry(0.6, 0.04, 0.8), dark, -0.6);
      addThrusterPair(g, accent, dark, -1.1, 0.18);
      break;
    }
    case 'harrier': {
      add(g, new THREE.BoxGeometry(2.15, 0.42, 0.75), body);
      add(g, new THREE.BoxGeometry(1.0, 0.08, 2.0), dark, -0.05);
      add(g, new THREE.ConeGeometry(0.3, 0.9, 6), body, 1.4, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.SphereGeometry(0.22, 10, 8), accent, 0.25, -0.28);
      add(g, new THREE.SphereGeometry(0.16, 8, 8), accent, -0.15, -0.28);
      add(g, new THREE.BoxGeometry(0.35, 0.18, 0.3), glass, 0.5, 0.28);
      add(g, new THREE.BoxGeometry(0.45, 0.55, 0.06), dark, -0.95, 0.15);
      addGreebles(g, dark, -0.3, 0.1, 0, 6, seed);
      addThrusterPair(g, accent, dark, -1.2, 0.25);
      break;
    }
    case 'minewright': {
      add(g, new THREE.BoxGeometry(1.75, 0.75, 1.4), body);
      add(g, new THREE.BoxGeometry(1.2, 0.25, 1.55), dark, -0.1, 0.35);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        add(
          g,
          new THREE.SphereGeometry(0.16, 8, 8),
          accent,
          Math.cos(a) * 0.65,
          0.25,
          Math.sin(a) * 0.75,
        );
      }
      add(g, new THREE.BoxGeometry(0.4, 0.25, 0.35), glass, 0.55, 0.4);
      addGreebles(g, dark, -0.3, 0, 0, 9, seed);
      addThrusterPair(g, accent, dark, -1.05, 0.4);
      break;
    }
    case 'razorwing': {
      add(g, new THREE.ConeGeometry(0.28, 2.0, 4), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(1.15, 0.05, 0.4), accent, 0.05, 0, 0.6, 0, 0.55);
      add(g, new THREE.BoxGeometry(1.15, 0.05, 0.4), accent, 0.05, 0, -0.6, 0, -0.55);
      add(g, new THREE.BoxGeometry(0.7, 0.04, 0.25), dark, -0.4, 0, 0.85, 0, 0.3);
      add(g, new THREE.BoxGeometry(0.7, 0.04, 0.25), dark, -0.4, 0, -0.85, 0, -0.3);
      add(g, new THREE.SphereGeometry(0.09, 8, 8), glass, 0.6, 0.12);
      addThrusterPair(g, accent, dark, -1.1, 0.15);
      break;
    }
    case 'glacier': {
      add(g, new THREE.BoxGeometry(1.95, 0.95, 1.6), body);
      add(g, new THREE.OctahedronGeometry(0.5, 0), accent, 1.0, 0.4);
      add(g, new THREE.OctahedronGeometry(0.28, 0), glass, 0.4, 0.55, 0.4);
      add(g, new THREE.BoxGeometry(1.3, 0.28, 0.55), dark, -0.15, -0.45);
      add(g, new THREE.BoxGeometry(0.3, 0.8, 1.7), dark, -0.85);
      addWindows(g, glass, 0.5, 0.3, 0.7, 3, 0.28);
      addGreebles(g, dark, -0.2, 0.15, 0.5, 8, seed);
      addThrusterPair(g, accent, dark, -1.15, 0.4);
      break;
    }
    case 'swarmlord': {
      const nest = add(g, new THREE.SphereGeometry(0.7, 14, 12), body);
      nest.scale.set(1.35, 0.7, 1.15);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(
          g,
          new THREE.SphereGeometry(0.11, 8, 6),
          accent,
          Math.cos(a) * 0.75,
          0.22,
          Math.sin(a) * 0.6,
        );
      }
      add(g, new THREE.ConeGeometry(0.3, 0.7, 7), dark, 1.0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.45, 0.05, 8, 20), accent, 0.2, 0.15, 0, 0.4);
      addThrusterPair(g, accent, dark, -1.1, 0.28);
      break;
    }
    case 'pulsejet': {
      add(g, new THREE.CylinderGeometry(0.38, 0.48, 1.75, 12), body, 0, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.45, 0.09, 10, 24), accent, 0.25, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.38, 0.05, 8, 20), dark, -0.2, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.32, 0.8, 10), dark, 1.25, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(0.3, 0.2, 0.25), glass, 0.35, 0.35);
      addGreebles(g, dark, -0.4, 0.15, 0, 6, seed);
      add(g, new THREE.SphereGeometry(0.18, 10, 8), accent, -1.05);
      break;
    }
    case 'railfox': {
      add(g, new THREE.BoxGeometry(2.55, 0.28, 0.4), body);
      add(g, new THREE.CylinderGeometry(0.09, 0.12, 1.6, 8), accent, 0.5, 0.16, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6), dark, 0.7, -0.1, 0.12, 0, 0, Math.PI / 2);
      add(g, new THREE.BoxGeometry(0.55, 0.45, 0.08), dark, -0.9, 0.18);
      add(g, new THREE.BoxGeometry(0.35, 0.15, 0.55), body, -0.3, 0.2);
      add(g, new THREE.BoxGeometry(0.2, 0.12, 0.18), glass, 0.2, 0.28);
      addGreebles(g, dark, -0.2, 0.05, 0, 5, seed);
      addThrusterPair(g, accent, dark, -1.35, 0.12);
      break;
    }
    case 'sanguine': {
      add(g, new THREE.ConeGeometry(0.4, 1.8, 5), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.55, 5), accent, 1.0, 0, 0.28, 0, 0, -Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.55, 5), accent, 1.0, 0, -0.28, 0, 0, -Math.PI / 2);
      add(g, new THREE.SphereGeometry(0.32, 12, 10), dark, -0.55);
      add(g, new THREE.SphereGeometry(0.14, 8, 8), accent, -0.55, 0.15);
      add(g, new THREE.BoxGeometry(0.5, 0.06, 0.7), dark, -0.2, 0.15);
      add(g, new THREE.SphereGeometry(0.08, 8, 8), glass, 0.45, 0.15, 0.15);
      addThrusterPair(g, accent, dark, -1.15, 0.2);
      break;
    }
    default: {
      add(g, new THREE.ConeGeometry(0.38, 1.8, 6), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      addThrusterPair(g, accent, dark, -1.0, 0.2);
      break;
    }
  }

  const exhaust = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 10),
    new THREE.MeshBasicMaterial({ color: def.accent }),
  );
  exhaust.name = 'exhaust';
  exhaust.position.set(-1.15 * (def.scale > 1 ? 1.15 : 0.95), 0, 0);
  exhaust.scale.set(0.01, 0.01, 0.01);
  g.add(exhaust);

  // Googly cartoon face - every scrap heap needs eyes
  addGoofFace(g, glass, accent, id);

  const s = 18 * def.scale;
  g.scale.setScalar(s);
  g.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return g;
}

function styleFor(id: ShipId): TexStyle {
  switch (id) {
    case 'brood':
    case 'swarmlord':
    case 'sanguine':
    case 'scuttle':
      return 'bio';
    case 'prism':
    case 'glacier':
    case 'nullpoint':
    case 'mirage':
      return 'crystal';
    case 'shade':
    case 'zephyr':
    case 'razorwing':
      return 'carbon';
    case 'bulwark':
    case 'minewright':
    case 'solhammer':
      return 'plated';
    case 'cinder':
    case 'harrier':
    case 'pulsejet':
      return 'organic';
    default:
      return 'panels';
  }
}

export function buildDroneMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = hullMat('#84cc16', '#d9f99d', 42, 'bio', 0.45, 0.4);
  const glow = glowMat('#d9f99d', 1.2);
  add(g, new THREE.ConeGeometry(0.22, 0.75, 6), body, 0, 0, 0, 0, 0, -Math.PI / 2);
  add(g, new THREE.SphereGeometry(0.1, 8, 8), glow, 0.15, 0.08);
  add(g, new THREE.BoxGeometry(0.25, 0.04, 0.45), body, -0.1);
  g.scale.setScalar(9);
  g.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return g;
}
