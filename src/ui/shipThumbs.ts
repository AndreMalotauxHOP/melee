import * as THREE from 'three';
import type { ShipId } from '../game/types';
import { SHIP_LIST } from '../game/ships';
import { buildShipMesh } from '../render/shipMeshes';

const cache = new Map<ShipId, string>();
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let baking = false;
const waiters: Array<() => void> = [];

function ensureBakeScene(): void {
  if (renderer) return;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  renderer.setSize(256, 192, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x88aacc, 0.95));
  const key = new THREE.DirectionalLight(0xfff2dd, 1.8);
  key.position.set(40, 60, 30);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x66aaff, 1.1);
  rim.position.set(-50, 25, -35);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xff66aa, 0.35);
  fill.position.set(10, -20, 40);
  scene.add(fill);

  camera = new THREE.PerspectiveCamera(36, 256 / 192, 0.1, 200);
  camera.position.set(24, 16, 44);
  camera.lookAt(0, 2, 0);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else (mat as THREE.Material).dispose();
  });
}

function bakeOne(id: ShipId): string {
  ensureBakeScene();
  if (!renderer || !scene || !camera) return '';
  const mesh = buildShipMesh(id);
  mesh.scale.multiplyScalar(0.62);
  mesh.rotation.y = -0.55;
  mesh.rotation.x = 0.18;
  mesh.position.y = 2;
  scene.add(mesh);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(mesh);
  disposeObject(mesh);
  cache.set(id, url);
  return url;
}

/** Cached 3D portrait for hangar / pick cards. */
export function getShipThumb(id: ShipId): string | null {
  return cache.get(id) ?? null;
}

async function bakeAll(): Promise<void> {
  if (baking) {
    await new Promise<void>((resolve) => waiters.push(resolve));
    return;
  }
  baking = true;
  ensureBakeScene();
  for (const def of SHIP_LIST) {
    if (!cache.has(def.id)) {
      bakeOne(def.id);
      // Yield so the UI stays responsive while baking the roster
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  baking = false;
  while (waiters.length) waiters.shift()?.();
}

/** Fill any [data-ship-thumb] images under root with baked 3D portraits. */
export async function paintShipThumbs(root: ParentNode = document): Promise<void> {
  await bakeAll();
  const imgs = root.querySelectorAll<HTMLImageElement>('img[data-ship-thumb]');
  for (const img of imgs) {
    const id = img.dataset.shipThumb as ShipId | undefined;
    if (!id) continue;
    const url = cache.get(id);
    if (url) {
      img.src = url;
      img.classList.add('ready');
    }
  }
}
