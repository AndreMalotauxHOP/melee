import * as THREE from 'three';
import type { ShipId } from '../game/types';
import { SHIPS } from '../game/ships';

type TexStyle = 'panels' | 'plated' | 'organic' | 'crystal' | 'carbon' | 'bio' | 'neon';

const texCache = new Map<string, THREE.CanvasTexture>();

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Procedural hull albedo - anime panel lines + neon stripe. */
function makeHullTexture(
  baseHex: string,
  accentHex: string,
  seed: number,
  style: TexStyle,
): THREE.CanvasTexture {
  const key = `v2|${baseHex}|${accentHex}|${seed}|${style}`;
  const hit = texCache.get(key);
  if (hit) return hit;

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2200; i++) {
    const x = hash(seed + i * 3.1) * size;
    const y = hash(seed + i * 7.7) * size;
    const a = 0.03 + hash(seed + i) * 0.08;
    ctx.fillStyle = `rgba(255,255,255,${a * 0.35})`;
    ctx.fillRect(x, y, 1 + hash(seed + i * 2) * 2, 1);
  }

  if (style === 'panels' || style === 'plated' || style === 'carbon' || style === 'neon') {
    const cell = style === 'plated' ? 26 : style === 'carbon' ? 14 : 30;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.2;
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
    ctx.strokeStyle = `rgba(255,255,255,0.12)`;
    for (let i = 0; i < 8; i++) {
      const y = hash(seed + i * 41) * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (hash(seed + i) - 0.5) * 20);
      ctx.stroke();
    }
  }

  if (style === 'organic' || style === 'bio') {
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const y0 = hash(seed + i * 9) * size;
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= size; x += 16) {
        ctx.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 12);
      }
      ctx.stroke();
    }
  }

  if (style === 'crystal' || style === 'neon') {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 22; i++) {
      const x0 = hash(seed + i) * size;
      const y0 = hash(seed + i * 3) * size;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(
        x0 + 30 + hash(seed + i * 5) * 70,
        y0 + 10 + hash(seed + i * 7) * 55,
      );
      ctx.stroke();
    }
  }

  // Neon accent bands
  ctx.fillStyle = accentHex;
  ctx.globalAlpha = 0.75;
  ctx.fillRect(0, size * 0.38, size, size * 0.08);
  ctx.globalAlpha = 0.45;
  ctx.fillRect(size * 0.72, 0, size * 0.06, size);
  ctx.globalAlpha = 0.35;
  ctx.fillRect(0, size * 0.78, size, size * 0.035);
  ctx.globalAlpha = 1;

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, 'rgba(255,255,255,0.28)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.25)');
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
  const key = `rough-v2-${seed}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = 70 + hash(seed + x * 0.7 + y * 1.3) * 120;
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
  metal = 0.88,
  rough = 0.24,
): THREE.MeshStandardMaterial {
  const map = makeHullTexture(color, accent, seed, style);
  map.repeat.set(2.2, 2.2);
  const emissiveMap = makeHullTexture(accent, '#ffffff', seed + 17, 'neon');
  emissiveMap.repeat.set(2.2, 2.2);
  return new THREE.MeshStandardMaterial({
    map,
    color: '#ffffff',
    metalness: metal,
    roughness: rough,
    roughnessMap: makeRoughMap(seed),
    emissive: accent,
    emissiveMap,
    emissiveIntensity: 0.42,
  });
}

function glowMat(color: string, intensity = 2.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.2,
    roughness: 0.14,
  });
}

function chromeMat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 1,
    roughness: 0.08,
    emissive: color,
    emissiveIntensity: 0.28,
  });
}

function darkMat(seed: number): THREE.MeshStandardMaterial {
  return hullMat('#0b1220', '#3d5a80', seed + 99, 'carbon', 0.92, 0.32);
}

function glassMat(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.05,
    roughness: 0.04,
    transmission: 0.72,
    thickness: 0.55,
    transparent: true,
    opacity: 0.9,
    emissive: color,
    emissiveIntensity: 0.65,
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

function addFin(
  g: THREE.Group,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  len: number,
  tall: number,
  thick: number,
  sweep = 0.35,
): void {
  const fin = add(g, new THREE.BoxGeometry(len, tall, thick), mat, x, y, z, 0, 0, sweep);
  fin.scale.set(1, 1, 1);
}

function addWing(
  g: THREE.Group,
  body: THREE.Material,
  glow: THREE.Material,
  z: number,
  span: number,
  chord: number,
): void {
  const wing = add(g, new THREE.BoxGeometry(chord, 0.06, span), body, 0.05, 0.02, z * 0.55, 0, 0, z > 0 ? 0.25 : -0.25);
  wing.scale.set(1, 1, 1);
  add(g, new THREE.BoxGeometry(chord * 0.7, 0.03, span * 0.15), glow, -0.1, 0.06, z * 0.7);
  add(g, new THREE.BoxGeometry(0.35, 0.04, span * 0.35), glow, chord * 0.15, 0.05, z * 0.85, 0, 0, z > 0 ? 0.5 : -0.5);
}

function addThrusterCluster(
  g: THREE.Group,
  glow: THREE.Material,
  dark: THREE.Material,
  x: number,
  spread: number,
  count = 2,
): void {
  for (let i = 0; i < count; i++) {
    for (const side of [-1, 1] as const) {
      const zz = side * (spread + i * 0.18);
      const yy = (i - (count - 1) / 2) * 0.16;
      add(g, new THREE.CylinderGeometry(0.1, 0.16, 0.42, 12), dark, x, yy, zz, 0, 0, Math.PI / 2);
      add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10), glow, x - 0.22, yy, zz, 0, 0, Math.PI / 2);
      add(g, new THREE.SphereGeometry(0.09, 10, 8), glow, x - 0.32, yy, zz);
    }
  }
}

/** Sleek anime cockpit visor instead of cartoon eyes. */
function addAnimeCockpit(
  g: THREE.Group,
  glass: THREE.Material,
  glow: THREE.Material,
  chrome: THREE.Material,
  x: number,
  y: number,
  wide: number,
): void {
  add(g, new THREE.SphereGeometry(wide * 0.55, 16, 12), glass, x, y, 0);
  const canopy = add(g, new THREE.SphereGeometry(wide * 0.58, 16, 12), chrome, x - 0.05, y - 0.02, 0);
  canopy.scale.set(1.05, 0.55, 1.15);
  add(g, new THREE.BoxGeometry(wide * 0.9, 0.04, wide * 1.3), glow, x - 0.05, y + wide * 0.25, 0);
  add(g, new THREE.BoxGeometry(0.08, 0.06, wide * 1.1), glow, x + wide * 0.15, y, 0);
}

function addEnergyCore(g: THREE.Group, glow: THREE.Material, x: number, y: number, r = 0.22): void {
  add(g, new THREE.SphereGeometry(r, 14, 12), glow, x, y, 0);
  add(g, new THREE.TorusGeometry(r * 1.35, 0.035, 8, 24), glow, x, y, 0, Math.PI / 2);
  add(g, new THREE.TorusGeometry(r * 1.35, 0.03, 8, 24), glow, x, y, 0, 0, 0, Math.PI / 2);
}

/** Build a flashy anime sci-fi ship. Nose points +X. */
export function buildShipMesh(id: ShipId): THREE.Group {
  const def = SHIPS[id];
  const g = new THREE.Group();
  g.name = id;
  const seed = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const body = hullMat(def.color, def.accent, seed, styleFor(id));
  const accent = glowMat(def.accent, 2.4);
  const neon = glowMat(def.color, 1.8);
  const dark = darkMat(seed);
  const glass = glassMat(def.accent);
  const chrome = chromeMat(def.accent);

  switch (id) {
    case 'solhammer': {
      // Heavy anime battleship - hammer prow + tower bridge
      add(g, new THREE.BoxGeometry(2.4, 0.7, 1.15), body, -0.1);
      add(g, new THREE.BoxGeometry(1.5, 0.45, 1.45), dark, -0.35, 0.35);
      add(g, new THREE.BoxGeometry(0.9, 0.9, 0.7), body, 0.2, 0.55);
      add(g, new THREE.BoxGeometry(1.1, 0.35, 1.6), neon, 0.9, 0.15);
      add(g, new THREE.ConeGeometry(0.55, 1.5, 6), chrome, 1.7, 0, 0, 0, 0, -Math.PI / 2);
      addFin(g, dark, -0.6, 0.55, 0.7, 0.9, 0.7, 0.08, 0.4);
      addFin(g, dark, -0.6, 0.55, -0.7, 0.9, 0.7, 0.08, -0.4);
      addAnimeCockpit(g, glass, accent, chrome, 0.55, 0.72, 0.42);
      addEnergyCore(g, accent, 0.15, 0.85, 0.16);
      addThrusterCluster(g, accent, dark, -1.55, 0.38, 2);
      break;
    }
    case 'zephyr': {
      // Needle interceptor - long blade + translucent canards
      add(g, new THREE.ConeGeometry(0.28, 2.8, 7), body, 0.1, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.CylinderGeometry(0.12, 0.22, 1.6, 8), chrome, -0.2, 0, 0, 0, 0, Math.PI / 2);
      addWing(g, body, neon, 1, 1.5, 1.1);
      addWing(g, body, neon, -1, 1.5, 1.1);
      add(g, new THREE.BoxGeometry(0.7, 0.04, 0.9), accent, -0.85, 0.12);
      addAnimeCockpit(g, glass, accent, chrome, 0.75, 0.12, 0.28);
      addThrusterCluster(g, accent, dark, -1.35, 0.2, 1);
      break;
    }
    case 'bulwark': {
      // Flying fortress - thick armor plates + glowing shield rim
      add(g, new THREE.BoxGeometry(2.0, 1.15, 1.8), body);
      add(g, new THREE.BoxGeometry(1.5, 0.35, 2.15), dark, -0.15, 0.45);
      add(g, new THREE.BoxGeometry(1.1, 0.7, 1.1), body, 1.2, 0.1);
      add(g, new THREE.TorusGeometry(1.05, 0.07, 10, 36), neon, 0.1, 0.1, 0, 0, Math.PI / 2);
      add(g, new THREE.CylinderGeometry(0.32, 0.4, 0.5, 12), accent, 0.4, 0.85);
      addFin(g, dark, -0.95, 0.2, 0.95, 0.7, 0.9, 0.1, 0.2);
      addFin(g, dark, -0.95, 0.2, -0.95, 0.7, 0.9, 0.1, -0.2);
      addAnimeCockpit(g, glass, accent, chrome, 0.85, 0.55, 0.4);
      addThrusterCluster(g, accent, dark, -1.25, 0.5, 2);
      break;
    }
    case 'shade': {
      // Assassin dart - razor diamond + cloak fins
      add(g, new THREE.ConeGeometry(0.22, 2.6, 4), body, 0.05, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.OctahedronGeometry(0.45, 0), chrome, 0.2, 0.05);
      add(g, new THREE.BoxGeometry(1.2, 0.05, 1.15), dark, -0.35, 0, 0, 0, Math.PI / 4);
      add(g, new THREE.BoxGeometry(0.9, 0.04, 0.9), neon, -0.55, 0.08, 0, 0, Math.PI / 5);
      add(g, new THREE.SphereGeometry(0.16, 12, 10), accent, 0.7, 0.1);
      addAnimeCockpit(g, glass, accent, chrome, 0.55, 0.14, 0.22);
      addThrusterCluster(g, accent, dark, -1.3, 0.14, 1);
      break;
    }
    case 'prism': {
      // Crystal gunship - stacked gem hull + light wings
      const gem = add(g, new THREE.OctahedronGeometry(0.85, 0), body);
      gem.scale.set(2.1, 0.5, 1.1);
      gem.rotation.z = Math.PI / 2;
      add(g, new THREE.OctahedronGeometry(0.35, 0), accent, 1.35);
      add(g, new THREE.OctahedronGeometry(0.22, 0), glass, 0.3, 0.4);
      add(g, new THREE.OctahedronGeometry(0.18, 0), neon, -0.4, -0.25, 0.35);
      addWing(g, chrome, accent, 1, 1.2, 0.9);
      addWing(g, chrome, accent, -1, 1.2, 0.9);
      addEnergyCore(g, accent, 0.1, 0.35, 0.18);
      addThrusterCluster(g, accent, dark, -1.25, 0.25, 1);
      break;
    }
    case 'brood': {
      // Bio-carrier - segmented abdomen + glowing pods
      const abdomen = add(g, new THREE.SphereGeometry(0.8, 18, 14), body);
      abdomen.scale.set(1.55, 0.7, 1.2);
      add(g, new THREE.ConeGeometry(0.42, 1.1, 8), dark, 1.15, 0, 0, 0, 0, -Math.PI / 2);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(
          g,
          new THREE.SphereGeometry(0.16, 10, 8),
          accent,
          -0.2 + Math.cos(a) * 0.15,
          0.25,
          Math.sin(a) * 0.85,
        );
      }
      add(g, new THREE.TorusGeometry(0.5, 0.06, 8, 20), neon, 0.55, 0.05, 0, 0, Math.PI / 2);
      addAnimeCockpit(g, glass, accent, chrome, 0.85, 0.28, 0.32);
      addThrusterCluster(g, accent, dark, -1.3, 0.32, 2);
      break;
    }
    case 'cinder': {
      // Flame racer - arrow body + swept fire wings
      add(g, new THREE.CylinderGeometry(0.18, 0.36, 2.2, 10), body, 0, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.2, 1.0, 10), accent, 1.4, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(1.2, 0.06, 0.45), neon, -0.1, 0, 0.55, 0, 0, 0.45);
      add(g, new THREE.BoxGeometry(1.2, 0.06, 0.45), neon, -0.1, 0, -0.55, 0, 0, -0.45);
      add(g, new THREE.BoxGeometry(0.7, 0.5, 0.06), dark, -0.95, 0.2);
      addEnergyCore(g, accent, -1.2, 0, 0.18);
      addAnimeCockpit(g, glass, accent, chrome, 0.45, 0.2, 0.26);
      addThrusterCluster(g, accent, dark, -1.4, 0.22, 1);
      break;
    }
    case 'grappler': {
      // Mecha clawship - arms forward + hip thrusters
      add(g, new THREE.BoxGeometry(1.5, 0.55, 0.95), body);
      add(g, new THREE.BoxGeometry(0.85, 0.4, 0.7), dark, -0.55, 0.28);
      for (const side of [-1, 1] as const) {
        add(g, new THREE.BoxGeometry(1.55, 0.16, 0.18), chrome, 0.55, 0.05, side * 0.85, 0, side * 0.55);
        add(g, new THREE.ConeGeometry(0.14, 0.55, 5), accent, 1.4, 0, side * 1.15, 0, 0, -Math.PI / 2);
        add(g, new THREE.BoxGeometry(0.35, 0.35, 0.2), neon, 0.9, 0.15, side * 0.55);
      }
      addAnimeCockpit(g, glass, accent, chrome, 0.35, 0.4, 0.3);
      addThrusterCluster(g, accent, dark, -1.05, 0.32, 2);
      break;
    }
    case 'scuttle': {
      // Cute bug mecha - round shell + antenna + back boosters
      const shell = add(g, new THREE.SphereGeometry(0.55, 16, 12), body);
      shell.scale.set(1.65, 0.68, 1.15);
      add(g, new THREE.ConeGeometry(0.2, 0.9, 6), dark, -1.05, 0.05, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.SphereGeometry(0.14, 10, 8), accent, 0.55, 0.22, 0.28);
      add(g, new THREE.SphereGeometry(0.14, 10, 8), accent, 0.55, 0.22, -0.28);
      add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), chrome, 0.75, 0.45, 0.2, 0.6);
      add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), chrome, 0.75, 0.45, -0.2, -0.6);
      for (let i = 0; i < 3; i++) {
        add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), dark, -0.15 - i * 0.22, -0.22, 0.4, 0.7);
        add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), dark, -0.15 - i * 0.22, -0.22, -0.4, -0.7);
      }
      addAnimeCockpit(g, glass, accent, chrome, 0.35, 0.28, 0.28);
      addThrusterCluster(g, accent, dark, -1.25, 0.16, 1);
      break;
    }
    case 'nullpoint': {
      // Void ringship - dual halo + core
      add(g, new THREE.TorusGeometry(0.72, 0.13, 14, 40), body, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.5, 0.06, 10, 32), neon, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.95, 0.04, 8, 40), accent, 0, 0, 0, 0.4, Math.PI / 2);
      addEnergyCore(g, accent, 0, 0, 0.28);
      add(g, new THREE.ConeGeometry(0.14, 1.2, 6), chrome, 1.15, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.7, 5), dark, -1.0, 0.25, 0.25, 0.5, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.7, 5), dark, -1.0, -0.25, -0.25, -0.5, 0, Math.PI / 2);
      addThrusterCluster(g, accent, dark, -0.75, 0.4, 1);
      break;
    }
    case 'stormlance': {
      // Lightning lance - ultra long rail + wing sparkers
      add(g, new THREE.CylinderGeometry(0.12, 0.2, 2.9, 8), body, 0.1, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.2, 1.0, 5), accent, 1.7, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(0.9, 0.05, 1.55), dark, -0.2);
      add(g, new THREE.BoxGeometry(0.35, 0.55, 0.06), neon, -0.55, 0.2);
      add(g, new THREE.BoxGeometry(0.35, 0.55, 0.06), neon, -0.55, 0.2, 0);
      addWing(g, body, accent, 1, 1.35, 0.85);
      addWing(g, body, accent, -1, 1.35, 0.85);
      addAnimeCockpit(g, glass, accent, chrome, 0.35, 0.18, 0.24);
      addThrusterCluster(g, accent, dark, -1.4, 0.22, 1);
      break;
    }
    case 'mirage': {
      // Illusion blade - mirrored tetra + ghost trail fins
      const blade = add(g, new THREE.TetrahedronGeometry(0.7, 0), body);
      blade.scale.set(2.5, 0.42, 1.05);
      blade.rotation.z = Math.PI / 2;
      add(g, new THREE.TetrahedronGeometry(0.3, 0), neon, 1.05, 0.12);
      add(g, new THREE.TetrahedronGeometry(0.22, 0), glass, -0.4, 0.2, 0.35);
      add(g, new THREE.BoxGeometry(0.8, 0.04, 1.0), chrome, -0.7);
      addAnimeCockpit(g, glass, accent, chrome, 0.35, 0.2, 0.24);
      addThrusterCluster(g, accent, dark, -1.2, 0.2, 1);
      break;
    }
    case 'harrier': {
      // Dive bomber - swept gull wings + belly racks
      add(g, new THREE.BoxGeometry(2.2, 0.38, 0.7), body);
      add(g, new THREE.ConeGeometry(0.28, 1.0, 6), body, 1.45, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.BoxGeometry(1.1, 0.07, 2.3), dark, 0.05, 0.05);
      add(g, new THREE.BoxGeometry(0.9, 0.06, 0.35), neon, 0.1, 0.1, 0.95, 0, 0, 0.35);
      add(g, new THREE.BoxGeometry(0.9, 0.06, 0.35), neon, 0.1, 0.1, -0.95, 0, 0, -0.35);
      add(g, new THREE.SphereGeometry(0.2, 10, 8), accent, 0.3, -0.28);
      add(g, new THREE.SphereGeometry(0.15, 8, 8), accent, -0.15, -0.28);
      addAnimeCockpit(g, glass, accent, chrome, 0.55, 0.28, 0.28);
      addThrusterCluster(g, accent, dark, -1.25, 0.28, 2);
      break;
    }
    case 'minewright': {
      // Industrial minelayer - cargo bay + orbit pods
      add(g, new THREE.BoxGeometry(1.85, 0.85, 1.45), body);
      add(g, new THREE.BoxGeometry(1.25, 0.3, 1.65), dark, -0.1, 0.45);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.2;
        add(
          g,
          new THREE.SphereGeometry(0.14, 8, 8),
          accent,
          Math.cos(a) * 0.7,
          0.3,
          Math.sin(a) * 0.8,
        );
      }
      add(g, new THREE.TorusGeometry(0.75, 0.05, 8, 28), neon, 0, 0.2, 0, Math.PI / 2);
      addAnimeCockpit(g, glass, accent, chrome, 0.6, 0.5, 0.32);
      addThrusterCluster(g, accent, dark, -1.15, 0.42, 2);
      break;
    }
    case 'razorwing': {
      // Variable fighter - X-wing vibes + face blades
      add(g, new THREE.ConeGeometry(0.26, 2.15, 5), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      for (const side of [-1, 1] as const) {
        add(g, new THREE.BoxGeometry(1.35, 0.05, 0.42), neon, 0.1, side * 0.12, side * 0.65, side * 0.35, 0, side * 0.55);
        add(g, new THREE.BoxGeometry(0.9, 0.04, 0.28), chrome, -0.35, side * 0.2, side * 0.95, 0, 0, side * 0.4);
      }
      add(g, new THREE.BoxGeometry(0.5, 0.35, 0.08), dark, -0.9, 0.2);
      addAnimeCockpit(g, glass, accent, chrome, 0.55, 0.16, 0.24);
      addThrusterCluster(g, accent, dark, -1.2, 0.22, 1);
      break;
    }
    case 'glacier': {
      // Ice dreadnought - crystal prow + thick flanks
      add(g, new THREE.BoxGeometry(2.0, 1.05, 1.65), body);
      add(g, new THREE.OctahedronGeometry(0.55, 0), accent, 1.15, 0.35);
      add(g, new THREE.OctahedronGeometry(0.3, 0), glass, 0.45, 0.65, 0.4);
      add(g, new THREE.BoxGeometry(1.4, 0.3, 0.6), dark, -0.2, -0.5);
      add(g, new THREE.BoxGeometry(0.35, 0.9, 1.8), dark, -0.95);
      add(g, new THREE.TorusGeometry(0.85, 0.05, 8, 28), neon, 0.2, 0.15, 0, 0, Math.PI / 2);
      addAnimeCockpit(g, glass, accent, chrome, 0.55, 0.55, 0.38);
      addThrusterCluster(g, accent, dark, -1.25, 0.45, 2);
      break;
    }
    case 'swarmlord': {
      // Hive mothership - honeycomb core + drone rails
      const nest = add(g, new THREE.SphereGeometry(0.75, 16, 14), body);
      nest.scale.set(1.4, 0.72, 1.2);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(
          g,
          new THREE.SphereGeometry(0.1, 8, 6),
          accent,
          Math.cos(a) * 0.85,
          0.25,
          Math.sin(a) * 0.65,
        );
      }
      add(g, new THREE.ConeGeometry(0.32, 0.85, 7), dark, 1.1, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.55, 0.05, 8, 24), neon, 0.15, 0.2, 0, 0.45);
      addAnimeCockpit(g, glass, accent, chrome, 0.55, 0.32, 0.3);
      addThrusterCluster(g, accent, dark, -1.2, 0.3, 2);
      break;
    }
    case 'pulsejet': {
      // Pulse fighter - ring intakes + fat engine
      add(g, new THREE.CylinderGeometry(0.36, 0.48, 1.9, 14), body, 0, 0, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.52, 0.1, 12, 28), neon, 0.35, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.TorusGeometry(0.42, 0.06, 10, 24), accent, -0.25, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.3, 0.9, 10), chrome, 1.35, 0, 0, 0, 0, -Math.PI / 2);
      addEnergyCore(g, accent, -1.15, 0, 0.2);
      addAnimeCockpit(g, glass, accent, chrome, 0.4, 0.38, 0.3);
      addThrusterCluster(g, accent, dark, -1.35, 0.28, 1);
      break;
    }
    case 'railfox': {
      // Sniper rifleship - absurd barrel + tiny cockpit
      add(g, new THREE.BoxGeometry(2.9, 0.26, 0.38), body);
      add(g, new THREE.CylinderGeometry(0.08, 0.12, 2.0, 10), neon, 0.6, 0.18, 0, 0, 0, Math.PI / 2);
      add(g, new THREE.CylinderGeometry(0.05, 0.08, 1.5, 8), chrome, 0.85, -0.12, 0.14, 0, 0, Math.PI / 2);
      add(g, new THREE.BoxGeometry(0.6, 0.5, 0.1), dark, -1.05, 0.22);
      add(g, new THREE.BoxGeometry(0.4, 0.18, 0.6), body, -0.35, 0.22);
      addAnimeCockpit(g, glass, accent, chrome, 0.1, 0.32, 0.22);
      addThrusterCluster(g, accent, dark, -1.5, 0.14, 1);
      break;
    }
    case 'sanguine': {
      // Vampire interceptor - fang nose + blood core
      add(g, new THREE.ConeGeometry(0.38, 2.0, 5), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.7, 5), accent, 1.15, 0, 0.32, 0, 0, -Math.PI / 2);
      add(g, new THREE.ConeGeometry(0.1, 0.7, 5), accent, 1.15, 0, -0.32, 0, 0, -Math.PI / 2);
      add(g, new THREE.SphereGeometry(0.36, 14, 12), dark, -0.6);
      addEnergyCore(g, accent, -0.55, 0.12, 0.16);
      add(g, new THREE.BoxGeometry(0.6, 0.05, 0.85), neon, -0.2, 0.18);
      addAnimeCockpit(g, glass, accent, chrome, 0.4, 0.2, 0.26);
      addThrusterCluster(g, accent, dark, -1.25, 0.22, 1);
      break;
    }
    default: {
      add(g, new THREE.ConeGeometry(0.38, 2.0, 6), body, 0, 0, 0, 0, 0, -Math.PI / 2);
      addThrusterCluster(g, accent, dark, -1.1, 0.22, 1);
      break;
    }
  }

  const exhaust = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshBasicMaterial({ color: def.accent }),
  );
  exhaust.name = 'exhaust';
  exhaust.position.set(-1.25 * (def.scale > 1 ? 1.15 : 0.95), 0, 0);
  exhaust.scale.set(0.01, 0.01, 0.01);
  g.add(exhaust);

  // Soft identity halo under the hull
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.035, 8, 36),
    new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.75,
    }),
  );
  ring.name = 'identity';
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.15;
  g.add(ring);
  const badge = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: def.accent }),
  );
  badge.name = 'identityBadge';
  badge.position.set(0.2, 0.95, 0);
  g.add(badge);

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
    case 'railfox':
      return 'neon';
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
  const body = hullMat('#84cc16', '#d9f99d', 42, 'bio', 0.55, 0.3);
  const glow = glowMat('#d9f99d', 2.0);
  add(g, new THREE.ConeGeometry(0.2, 0.85, 6), body, 0, 0, 0, 0, 0, -Math.PI / 2);
  add(g, new THREE.SphereGeometry(0.12, 10, 8), glow, 0.2, 0.08);
  add(g, new THREE.TorusGeometry(0.22, 0.03, 8, 16), glow, -0.05, 0, 0, 0, Math.PI / 2);
  add(g, new THREE.BoxGeometry(0.28, 0.04, 0.5), body, -0.15);
  g.scale.setScalar(9);
  g.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return g;
}
