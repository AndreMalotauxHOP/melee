import * as THREE from 'three';
import { SHIPS } from '../game/ships';
import {
  ARENA_H,
  ARENA_W,
  PLANET_R,
  PLANET_X,
  PLANET_Y,
  VIEW_H,
  VIEW_W,
  type SimState,
} from '../game/types';
import { clamp, lerp, nearestImage, nearestImageSticky, wrapMid } from '../game/math';
import { buildDroneMesh, buildShipMesh } from './shipMeshes';
import type { DrawOpts } from '../game/renderer';

type ProjObj = {
  mesh: THREE.Object3D;
  id: number;
  trail?: THREE.Points;
  kind: string;
};
type DroneObj = { mesh: THREE.Group; id: number };
type FxObj = { group: THREE.Group; id: number; kind: string };

type Volcano = {
  root: THREE.Group;
  glow: THREE.Mesh;
  light: THREE.PointLight;
  particles: THREE.Points;
  vel: Float32Array;
  life: Float32Array;
  cooldown: number;
  erupting: number;
};

type Firework = {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  maxLife: number;
  active: boolean;
  phase: 'rise' | 'burst';
  /** Unit outward from planet core */
  dirX: number;
  dirY: number;
  dirZ: number;
  color: number;
};

export class World3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ships: [THREE.Group, THREE.Group] | null = null;
  private shipIds: [string, string] = ['', ''];
  private exhaust: [THREE.Object3D | null, THREE.Object3D | null] = [null, null];
  private projectiles = new Map<number, ProjObj>();
  private drones = new Map<number, DroneObj>();
  private effects = new Map<number, FxObj>();
  private asteroids = new Map<number, { mesh: THREE.Group; id: number; kind: string }>();
  private shieldMeshes: [THREE.Mesh, THREE.Mesh];
  private tractorLine: THREE.Line;
  private coneMesh: THREE.Mesh;
  private clock = 0;
  private starLayers: THREE.Points[] = [];
  private nebulae: THREE.Points[] = [];
  private planetGroup: THREE.Group;
  private planetSpin: THREE.Group;
  private planetBody: THREE.Mesh;
  private planetAtmo: THREE.Mesh;
  private planetRing: THREE.Mesh;
  private arenaFloor: THREE.Group;
  private softPad: THREE.Mesh;
  private volcanoes: Volcano[] = [];
  private fireworks: Firework[] = [];
  private fireworkCd = 8;
  private planetLight: THREE.PointLight;
  private lastPlanetR = 0;
  private lastGravityTier: number = -1;
  private shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private shakeZ = 0;
  private killFocus = { x: PLANET_X, y: PLANET_Y, blend: 0 };
  private speedLines: THREE.LineSegments | null = null;
  /**
   * Continuous chase look-at (may leave [0, ARENA]).
   * Never wrapPos this - wrapping here is what caused the edge-exit shock.
   */
  private camLook = { x: PLANET_X, y: PLANET_Y };
  /** Planet drawn at this torus image (nearest to camLook, sticky) */
  private planetView = { x: PLANET_X, y: PLANET_Y };
  /** Per-ship sticky draw positions - prevents wrap seam teleports */
  private shipDraw: [{ x: number; y: number }, { x: number; y: number }] = [
    { x: PLANET_X, y: PLANET_Y },
    { x: PLANET_X, y: PLANET_Y },
  ];
  private shipDrawInit = false;
  /** Sticky draw cache for projectiles / drones / asteroids / fx */
  private drawCache = new Map<number, { x: number; y: number }>();
  /** 0 = ships close (zoomed in), 1 = ships far (zoomed out) */
  private camSep = 0.55;
  private _proj = new THREE.Vector3();

  /** Add camera punch - hits and kills */
  addShake(amount: number): void {
    this.shake = Math.min(22, this.shake + amount);
  }

  /** World point as the wrap image nearest the current camera look (sticky) */
  private viewPos(
    x: number,
    y: number,
    stick?: { x: number; y: number } | null,
  ): { x: number; y: number } {
    if (stick) {
      return nearestImageSticky(
        this.camLook.x,
        this.camLook.y,
        x,
        y,
        stick.x,
        stick.y,
        160,
      );
    }
    return nearestImage(this.camLook.x, this.camLook.y, x, y);
  }

  private cachedViewPos(id: number, x: number, y: number): { x: number; y: number } {
    const prev = this.drawCache.get(id);
    const next = this.viewPos(x, y, prev ?? null);
    this.drawCache.set(id, next);
    return next;
  }

  /** Project world arena coords onto the VIEW canvas for HUD floats */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const p = this.viewPos(x, y);
    this._proj.set(p.x, 10, p.y);
    this._proj.project(this.camera);
    return {
      x: (this._proj.x * 0.5 + 0.5) * VIEW_W,
      y: (-this._proj.y * 0.5 + 0.5) * VIEW_H,
    };
  }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(36, VIEW_W / VIEW_H, 1, 8000);
    this.camera.position.set(PLANET_X, 560, PLANET_Y + 480);
    this.camera.lookAt(PLANET_X, 0, PLANET_Y);

    this.scene.background = new THREE.Color('#0a1528');
    this.scene.fog = new THREE.FogExp2('#102038', 0.00022);

    // Lights
    const amb = new THREE.AmbientLight(0x334466, 0.55);
    this.scene.add(amb);
    const key = new THREE.DirectionalLight(0xfff0dd, 1.35);
    key.position.set(400, 900, 200);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1400;
    key.shadow.camera.right = 1400;
    key.shadow.camera.top = 1400;
    key.shadow.camera.bottom = -1400;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x4488ff, 0.55);
    rim.position.set(-300, 200, -400);
    this.scene.add(rim);
    this.planetLight = new THREE.PointLight(0x4aa3ff, 2.2, 1400, 1.5);
    this.planetLight.position.set(PLANET_X, 40, PLANET_Y);
    this.scene.add(this.planetLight);

    this.makeCosmos();
    this.arenaFloor = this.makeArenaFloor();
    this.scene.add(this.arenaFloor);
    const planet = this.makePlanet();
    this.planetGroup = planet.group;
    this.planetSpin = planet.spin;
    this.planetBody = planet.body;
    this.planetAtmo = planet.atmo;
    this.planetRing = planet.ring;
    this.volcanoes = planet.volcanoes;
    this.planetGroup.position.set(PLANET_X, 0, PLANET_Y);
    this.scene.add(this.planetGroup);
    this.initFireworks();

    // Soft vignette plane under ships for depth
    this.softPad = new THREE.Mesh(
      new THREE.CircleGeometry(720, 64),
      new THREE.MeshBasicMaterial({
        color: 0x0a1528,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    this.softPad.rotation.x = -Math.PI / 2;
    this.softPad.position.set(PLANET_X, -2, PLANET_Y);
    this.scene.add(this.softPad);

    this.shieldMeshes = [this.makeShield(), this.makeShield()];
    this.scene.add(this.shieldMeshes[0], this.shieldMeshes[1]);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    this.tractorLine = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xe879f9, transparent: true, opacity: 0.65 }),
    );
    this.tractorLine.visible = false;
    this.scene.add(this.tractorLine);

    this.coneMesh = new THREE.Mesh(
      new THREE.CircleGeometry(200, 32, -0.55, 1.1),
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.coneMesh.rotation.x = -Math.PI / 2;
    this.coneMesh.visible = false;
    this.scene.add(this.coneMesh);
  }

  private makeCosmos(): void {
    // Multi-layer drifting starfield - flying through space
    const layers: { n: number; size: number; color: number; span: number; ySpread: number }[] = [
      { n: 1800, size: 1.6, color: 0x9ec5ff, span: 5600, ySpread: 1800 },
      { n: 1100, size: 2.4, color: 0xdce9ff, span: 4400, ySpread: 1400 },
      { n: 500, size: 3.4, color: 0xffe6c0, span: 3600, ySpread: 1000 },
    ];
    for (const L of layers) {
      const pos = new Float32Array(L.n * 3);
      for (let i = 0; i < L.n; i++) {
        pos[i * 3] = PLANET_X + (Math.random() - 0.5) * L.span;
        pos[i * 3 + 1] = (Math.random() - 0.5) * L.ySpread;
        pos[i * 3 + 2] = PLANET_Y + (Math.random() - 0.5) * L.span;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: L.color,
          size: L.size,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      pts.userData.drift = 18 + Math.random() * 40;
      this.starLayers.push(pts);
      this.scene.add(pts);
    }

    // Soft nebula clouds
    const nebulaColors = [0x3a1a6a, 0x0a3a5a, 0x4a2040, 0x1a4060];
    for (let n = 0; n < 4; n++) {
      const count = 220;
      const pos = new Float32Array(count * 3);
      const cx = PLANET_X + (Math.random() - 0.5) * 1800;
      const cy = -80 + Math.random() * 200;
      const cz = PLANET_Y + (Math.random() - 0.5) * 1800;
      for (let i = 0; i < count; i++) {
        pos[i * 3] = cx + (Math.random() - 0.5) * 520;
        pos[i * 3 + 1] = cy + (Math.random() - 0.5) * 180;
        pos[i * 3 + 2] = cz + (Math.random() - 0.5) * 520;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: nebulaColors[n],
          size: 18 + Math.random() * 22,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.12,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      pts.userData.drift = 4 + Math.random() * 8;
      this.nebulae.push(pts);
      this.scene.add(pts);
    }
  }

  private makeArenaFloor(): THREE.Group {
    const g = new THREE.Group();
    const grid = new THREE.GridHelper(
      Math.max(ARENA_W, ARENA_H) * 1.15,
      40,
      0x152838,
      0x0a121c,
    );
    grid.position.set(0, -1, 0);
    const mats = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const m of mats) {
      m.transparent = true;
      m.opacity = 0.35;
    }
    g.add(grid);
    g.position.set(PLANET_X, 0, PLANET_Y);
    return g;
  }

  private makeVolcano(lat: number, lon: number): Volcano {
    const root = new THREE.Group();
    const phi = lat;
    const theta = lon;
    const nx = Math.sin(phi) * Math.cos(theta);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.sin(theta);
    root.userData.dir = new THREE.Vector3(nx, ny, nz);
    root.position.set(nx, ny, nz);
    root.lookAt(nx * 2, ny * 2, nz * 2);

    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.14, 8),
      new THREE.MeshStandardMaterial({
        color: '#3a2218',
        emissive: '#4a1808',
        emissiveIntensity: 0.4,
        roughness: 0.9,
      }),
    );
    cone.rotation.x = Math.PI;
    cone.position.z = 0.02;
    root.add(cone);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xff6a20,
        transparent: true,
        opacity: 0.85,
      }),
    );
    glow.position.z = 0.09;
    root.add(glow);

    const light = new THREE.PointLight(0xff5520, 0, 80, 2);
    light.position.z = 0.12;
    root.add(light);

    const count = 48;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    const life = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      life[i] = 0;
      pos[i * 3 + 1] = -10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xff7a30,
        size: 3.5,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    // Particles live in world space - parent to scene via planet group later
    root.add(particles);
    particles.position.set(0, 0, 0);

    return {
      root,
      glow,
      light,
      particles,
      vel,
      life,
      cooldown: 6 + Math.random() * 18,
      erupting: 0,
    };
  }

  private makePlanet(): {
    group: THREE.Group;
    spin: THREE.Group;
    body: THREE.Mesh;
    atmo: THREE.Mesh;
    ring: THREE.Mesh;
    volcanoes: Volcano[];
  } {
    const g = new THREE.Group();
    // Positioned each frame via planetView (nearest wrap image to camera)
    g.position.set(0, 0, 0);
    const spin = new THREE.Group();
    g.add(spin);

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshStandardMaterial({
        color: '#1a5a8c',
        emissive: '#0a2a44',
        emissiveIntensity: 0.35,
        metalness: 0.1,
        roughness: 0.75,
      }),
    );
    body.castShadow = true;
    body.receiveShadow = true;
    body.scale.setScalar(PLANET_R);
    spin.add(body);

    const volcanoes: Volcano[] = [];
    // Sparse vents - locals keep it quiet most of the time
    const vents = [
      [0.7, 2.1],
      [1.1, 4.8],
    ];
    for (const [lat, lon] of vents) {
      const v = this.makeVolcano(lat, lon);
      spin.add(v.root);
      volcanoes.push(v);
    }

    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 32),
      new THREE.MeshBasicMaterial({
        color: '#4aa3ff',
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    atmo.scale.setScalar(PLANET_R * 1.12);
    g.add(atmo);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.7, 64),
      new THREE.MeshBasicMaterial({
        color: '#6ec8ff',
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2.4;
    ring.scale.setScalar(PLANET_R);
    g.add(ring);
    return { group: g, spin, body, atmo, ring, volcanoes };
  }

  private initFireworks(): void {
    for (let i = 0; i < 8; i++) {
      const count = 90;
      const pos = new Float32Array(count * 3);
      const vel = new Float32Array(count * 3);
      for (let j = 0; j < count; j++) pos[j * 3 + 1] = -999;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const points = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 4.5,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          sizeAttenuation: true,
        }),
      );
      points.visible = false;
      this.scene.add(points);
      this.fireworks.push({
        points,
        vel,
        life: 0,
        maxLife: 1.6,
        active: false,
        phase: 'rise',
        dirX: 0,
        dirY: 1,
        dirZ: 0,
        color: 0xffffff,
      });
    }

    // Anime speed-line ring for kill cam (camera-local-ish plane)
    const linePos: number[] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const r0 = 80;
      const r1 = 420 + (i % 5) * 40;
      linePos.push(
        Math.cos(a) * r0,
        0,
        Math.sin(a) * r0,
        Math.cos(a) * r1,
        (i % 3) * 8 - 8,
        Math.sin(a) * r1,
      );
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    this.speedLines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.speedLines.visible = false;
    this.scene.add(this.speedLines);
  }

  /** Launch fireworks from the planet surface - locals celebrating. */
  private spawnFirework(planetR: number): void {
    const fw = this.fireworks.find((f) => !f.active);
    if (!fw) return;
    const colors = [0xff6b6b, 0xffe066, 0x69db7c, 0x74c0fc, 0xe599f7, 0xff922b, 0xffffff, 0xffa8a8];
    fw.color = colors[(Math.random() * colors.length) | 0];
    (fw.points.material as THREE.PointsMaterial).color.setHex(fw.color);

    // Surface point biased toward the camera-facing / upper hemisphere
    const theta = Math.random() * Math.PI * 2;
    const phi = 0.15 + Math.random() * 1.05;
    let dx = Math.sin(phi) * Math.cos(theta);
    let dy = Math.cos(phi);
    let dz = Math.sin(phi) * Math.sin(theta);
    // Bias toward camera (+Z from planet toward cam)
    dz = dz * 0.55 + 0.45;
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    fw.dirX = dx;
    fw.dirY = dy;
    fw.dirZ = dz;

    const r = planetR * 1.02;
    const ox = this.planetView.x + dx * r;
    const oy = dy * r;
    const oz = this.planetView.y + dz * r;

    const pos = fw.points.geometry.attributes.position as THREE.BufferAttribute;
    const count = pos.count;
    // Rise phase: tight rocket trail
    for (let i = 0; i < count; i++) {
      if (i < 12) {
        const jitter = 2.5;
        pos.setXYZ(
          i,
          ox + (Math.random() - 0.5) * jitter,
          oy + (Math.random() - 0.5) * jitter,
          oz + (Math.random() - 0.5) * jitter,
        );
        const sp = 95 + Math.random() * 70;
        fw.vel[i * 3] = dx * sp + (Math.random() - 0.5) * 12;
        fw.vel[i * 3 + 1] = dy * sp + (Math.random() - 0.5) * 12;
        fw.vel[i * 3 + 2] = dz * sp + (Math.random() - 0.5) * 12;
      } else {
        pos.setXYZ(i, 0, -999, 0);
        fw.vel[i * 3] = 0;
        fw.vel[i * 3 + 1] = 0;
        fw.vel[i * 3 + 2] = 0;
      }
    }
    pos.needsUpdate = true;
    fw.phase = 'rise';
    fw.maxLife = 0.45 + Math.random() * 0.35;
    fw.life = fw.maxLife;
    fw.active = true;
    fw.points.visible = true;
    (fw.points.material as THREE.PointsMaterial).opacity = 1;
    (fw.points.material as THREE.PointsMaterial).size = 5.5;
  }

  private burstFirework(fw: Firework, planetR: number): void {
    const pos = fw.points.geometry.attributes.position as THREE.BufferAttribute;
    // Burst where the lead spark is
    let bx = this.planetView.x + fw.dirX * (planetR * 1.35);
    let by = fw.dirY * (planetR * 1.35);
    let bz = this.planetView.y + fw.dirZ * (planetR * 1.35);
    for (let i = 0; i < Math.min(12, pos.count); i++) {
      if (pos.getY(i) > -500) {
        bx = pos.getX(i);
        by = pos.getY(i);
        bz = pos.getZ(i);
        break;
      }
    }
    const count = pos.count;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const sp = 35 + Math.random() * 110;
      // Shell expands mostly tangential / outward, less into the planet
      let vx = Math.sin(b) * Math.cos(a) * sp;
      let vy = Math.cos(b) * sp;
      let vz = Math.sin(b) * Math.sin(a) * sp;
      // Bias outward from planet
      vx += fw.dirX * 25;
      vy += fw.dirY * 25;
      vz += fw.dirZ * 25;
      fw.vel[i * 3] = vx;
      fw.vel[i * 3 + 1] = vy;
      fw.vel[i * 3 + 2] = vz;
      pos.setXYZ(i, bx, by, bz);
    }
    pos.needsUpdate = true;
    fw.phase = 'burst';
    fw.maxLife = 1.35 + Math.random() * 0.4;
    fw.life = fw.maxLife;
    (fw.points.material as THREE.PointsMaterial).size = 4.2;
  }

  private updateFireworks(dt: number, planetR: number): void {
    this.fireworkCd -= dt;
    if (this.fireworkCd <= 0) {
      this.spawnFirework(planetR);
      this.fireworkCd = 6 + Math.random() * 14;
      if (Math.random() > 0.95) {
        const r = planetR;
        setTimeout(() => this.spawnFirework(r), 200 + Math.random() * 400);
      }
    }
    for (const fw of this.fireworks) {
      if (!fw.active) continue;
      fw.life -= dt;
      const pos = fw.points.geometry.attributes.position as THREE.BufferAttribute;
      const t = fw.life / fw.maxLife;
      const mat = fw.points.material as THREE.PointsMaterial;

      if (fw.phase === 'rise') {
        for (let i = 0; i < 12; i++) {
          pos.setXYZ(
            i,
            pos.getX(i) + fw.vel[i * 3] * dt,
            pos.getY(i) + fw.vel[i * 3 + 1] * dt,
            pos.getZ(i) + fw.vel[i * 3 + 2] * dt,
          );
          // slight drag
          fw.vel[i * 3] *= 0.995;
          fw.vel[i * 3 + 1] *= 0.995;
          fw.vel[i * 3 + 2] *= 0.995;
        }
        pos.needsUpdate = true;
        mat.opacity = 0.85 + (1 - t) * 0.15;
        mat.size = 4 + (1 - t) * 3;
        if (fw.life <= 0) this.burstFirework(fw, planetR);
        continue;
      }

      for (let i = 0; i < pos.count; i++) {
        // Soft gravity back toward planet core
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const gx = this.planetView.x - px;
        const gy = 0 - py;
        const gz = this.planetView.y - pz;
        const gd = Math.hypot(gx, gy, gz) || 1;
        fw.vel[i * 3] += (gx / gd) * 28 * dt;
        fw.vel[i * 3 + 1] += (gy / gd) * 28 * dt - 18 * dt;
        fw.vel[i * 3 + 2] += (gz / gd) * 28 * dt;
        pos.setXYZ(
          i,
          px + fw.vel[i * 3] * dt,
          py + fw.vel[i * 3 + 1] * dt,
          pz + fw.vel[i * 3 + 2] * dt,
        );
        fw.vel[i * 3] *= 0.978;
        fw.vel[i * 3 + 1] *= 0.978;
        fw.vel[i * 3 + 2] *= 0.978;
      }
      pos.needsUpdate = true;
      mat.opacity = Math.max(0, t);
      mat.size = 2.8 + t * 3.5;
      if (fw.life <= 0) {
        fw.active = false;
        fw.points.visible = false;
      }
    }
  }

  private updateCosmos(dt: number): void {
    // Parallax: distant stars lag behind the chase camera so travel feels huge
    const px = (this.camLook.x - PLANET_X) * 0.04;
    const pz = (this.camLook.y - PLANET_Y) * 0.04;
    for (let li = 0; li < this.starLayers.length; li++) {
      const layer = this.starLayers[li]!;
      const drift = (layer.userData.drift as number) ?? 20;
      const depth = 0.35 + li * 0.25;
      layer.position.x = -px * depth - drift * (this.clock * 0.15 % 2.5);
      layer.position.z = -pz * depth - drift * (this.clock * 0.08 % 2.5);
      layer.rotation.y += dt * 0.01;
    }
    for (const neb of this.nebulae) {
      const drift = (neb.userData.drift as number) ?? 5;
      neb.position.x = -px * 0.2 - drift * (this.clock * 0.1 % 6);
      neb.rotation.y += dt * 0.008;
    }
  }

  private updateVolcanoes(dt: number, planetR: number): void {
    for (const v of this.volcanoes) {
      const dir = v.root.userData.dir as THREE.Vector3;
      v.root.position.copy(dir).multiplyScalar(planetR * 1.02);
      v.root.scale.setScalar(planetR);
      v.cooldown -= dt;
      if (v.cooldown <= 0 && v.erupting <= 0) {
        v.erupting = 0.55 + Math.random() * 0.7;
        v.cooldown = 10 + Math.random() * 16;
        // Burst seed particles along local +Z (outward from surface)
        const pos = v.particles.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          if (Math.random() > 0.55) continue;
          v.life[i] = 0.4 + Math.random() * 0.9;
          pos.setXYZ(i, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, 0.1);
          v.vel[i * 3] = (Math.random() - 0.5) * 0.35;
          v.vel[i * 3 + 1] = (Math.random() - 0.5) * 0.35;
          v.vel[i * 3 + 2] = 0.6 + Math.random() * 1.4;
        }
        pos.needsUpdate = true;
      }

      if (v.erupting > 0) {
        v.erupting -= dt;
        const pulse = 0.6 + Math.sin(this.clock * 20) * 0.4;
        v.light.intensity = 2.5 * pulse * Math.min(1, v.erupting * 2);
        (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.5;
        v.glow.scale.setScalar(1 + pulse * 0.8);
      } else {
        v.light.intensity *= 0.9;
        (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.25;
        v.glow.scale.setScalar(1);
      }

      const pos = v.particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        if (v.life[i] <= 0) {
          pos.setXYZ(i, 0, 0, -2);
          continue;
        }
        v.life[i] -= dt;
        // Local space: +Z is outward; mild falloff
        v.vel[i * 3 + 2] -= 0.8 * dt;
        pos.setXYZ(
          i,
          pos.getX(i) + v.vel[i * 3] * dt,
          pos.getY(i) + v.vel[i * 3 + 1] * dt,
          pos.getZ(i) + v.vel[i * 3 + 2] * dt,
        );
      }
      pos.needsUpdate = true;
      const mat = v.particles.material as THREE.PointsMaterial;
      mat.opacity = v.erupting > 0 ? 0.95 : 0.35;
      mat.size = 2.5 + Math.sin(this.clock * 8) * 0.8;
    }
  }

  private syncPlanet(state: SimState): void {
    if (state.planetR === this.lastPlanetR && state.gravityTier === this.lastGravityTier) {
      return;
    }
    this.lastPlanetR = state.planetR;
    this.lastGravityTier = state.gravityTier;
    const r = state.planetR;
    this.planetBody.scale.setScalar(r);
    this.planetAtmo.scale.setScalar(r * 1.12);
    this.planetRing.scale.setScalar(r);
    for (const v of this.volcanoes) {
      const dir = v.root.userData.dir as THREE.Vector3;
      v.root.position.copy(dir).multiplyScalar(r * 1.02);
      v.root.scale.setScalar(r);
    }

    const mat = this.planetBody.material as THREE.MeshStandardMaterial;
    const atmoMat = this.planetAtmo.material as THREE.MeshBasicMaterial;
    const ringMat = this.planetRing.material as THREE.MeshBasicMaterial;
    if (state.gravityTier === 0) {
      mat.color.set('#3a8a7a');
      mat.emissive.set('#0a3028');
      atmoMat.color.set('#7cf5c8');
      ringMat.color.set('#a8ffe0');
      ringMat.opacity = 0.08;
      this.planetLight.color.set(0x7cf5c8);
    } else if (state.gravityTier === 1) {
      mat.color.set('#1a5a8c');
      mat.emissive.set('#0a2a44');
      atmoMat.color.set('#4aa3ff');
      ringMat.color.set('#6ec8ff');
      ringMat.opacity = 0.12;
      this.planetLight.color.set(0x4aa3ff);
    } else {
      mat.color.set('#6a2040');
      mat.emissive.set('#2a0818');
      atmoMat.color.set('#f43f5e');
      ringMat.color.set('#ff8a9a');
      ringMat.opacity = 0.2;
      this.planetLight.color.set(0xf43f5e);
    }
  }

  private makeShield(): THREE.Mesh {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 16),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.25,
        wireframe: true,
        depthWrite: false,
      }),
    );
    m.visible = false;
    return m;
  }

  ensureShips(state: SimState): void {
    const ids: [string, string] = [state.ships[0].shipId, state.ships[1].shipId];
    if (this.ships && this.shipIds[0] === ids[0] && this.shipIds[1] === ids[1]) return;
    if (this.ships) {
      this.scene.remove(this.ships[0], this.ships[1]);
    }
    const a = buildShipMesh(state.ships[0].shipId);
    const b = buildShipMesh(state.ships[1].shipId);
    this.ships = [a, b];
    this.shipIds = ids;
    this.exhaust = [a.getObjectByName('exhaust') ?? null, b.getObjectByName('exhaust') ?? null];
    this.scene.add(a, b);
    this.resetTracking(state);
  }

  /** Call when a new bout starts so wrap tracking does not slide from the last fight. */
  resetTracking(state?: SimState): void {
    this.shipDrawInit = false;
    this.drawCache.clear();
    this.shake = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeZ = 0;
    if (state) {
      const a = state.ships[0];
      const b = state.ships[1];
      const mid = wrapMid(a.x, a.y, b.x, b.y);
      this.camLook.x = mid.x;
      this.camLook.y = mid.y;
      this.shipDraw[0] = nearestImage(this.camLook.x, this.camLook.y, a.x, a.y);
      this.shipDraw[1] = nearestImage(this.camLook.x, this.camLook.y, b.x, b.y);
      this.shipDrawInit = true;
      this.planetView = nearestImage(this.camLook.x, this.camLook.y, PLANET_X, PLANET_Y);
    } else {
      this.camLook.x = PLANET_X;
      this.camLook.y = PLANET_Y;
      this.planetView.x = PLANET_X;
      this.planetView.y = PLANET_Y;
    }
  }

  draw(state: SimState, opts: DrawOpts = {}): void {
    const dt = Math.min(0.05, Math.max(0.008, opts.dt ?? 1 / 60));
    this.clock += dt;
    this.syncPlanet(state);
    this.ensureShips(state);

    // Living cosmos
    this.planetSpin.rotation.y += dt * 0.18;
    this.planetAtmo.rotation.y += dt * 0.07;
    this.planetRing.rotation.z += dt * 0.04;
    this.updateCosmos(dt);
    this.updateVolcanoes(dt, state.planetR);
    this.updateFireworks(dt, state.planetR);

    // Pulse planet light with eruptions
    let eruptGlow = 0;
    for (const v of this.volcanoes) {
      if (v.erupting > 0) eruptGlow += v.erupting;
    }
    this.planetLight.intensity = 2.0 + Math.min(2.5, eruptGlow * 0.8);

    // Super Melee camera: center on ship midpoint, zoom by separation.
    // Sticky wrap images prevent seam flip-flop (ghost pops / planet teleports).
    this.shake *= Math.pow(0.9, dt * 60);
    if (this.shake < 0.12) this.shake = 0;
    // Smoothed shake - random per-frame shake read as ghosting
    const shakeTargetX = (Math.random() - 0.5) * this.shake;
    const shakeTargetY = (Math.random() - 0.5) * this.shake * 0.55;
    const shakeTargetZ = (Math.random() - 0.5) * this.shake;
    const shakeFollow = 1 - Math.pow(0.0008, dt);
    this.shakeX += (shakeTargetX - this.shakeX) * shakeFollow;
    this.shakeY += (shakeTargetY - this.shakeY) * shakeFollow;
    this.shakeZ += (shakeTargetZ - this.shakeZ) * shakeFollow;

    const danger = opts.danger ?? 0;
    const kill = opts.killCam ?? null;
    const focusSide: 0 | 1 = opts.focusSide ?? opts.localSlot ?? 0;

    const shipA = state.ships[0];
    const shipB = state.ships[1];

    // Seed sticky draws once ships exist
    if (!this.shipDrawInit) {
      this.shipDraw[0] = nearestImage(this.camLook.x, this.camLook.y, shipA.x, shipA.y);
      this.shipDraw[1] = nearestImage(this.camLook.x, this.camLook.y, shipB.x, shipB.y);
      this.shipDrawInit = true;
    }

    // Advance each ship along the continuous wrap path.
    // maxStickDist keeps draws from drifting onto an off-screen wrap tile.
    this.shipDraw[0] = nearestImageSticky(
      this.camLook.x,
      this.camLook.y,
      shipA.x,
      shipA.y,
      this.shipDraw[0].x,
      this.shipDraw[0].y,
      100,
      360,
    );
    this.shipDraw[1] = nearestImageSticky(
      this.camLook.x,
      this.camLook.y,
      shipB.x,
      shipB.y,
      this.shipDraw[1].x,
      this.shipDraw[1].y,
      100,
      360,
    );

    const focusShip = state.ships[focusSide];
    const focusDraw = this.shipDraw[focusSide];
    const otherSide: 0 | 1 = focusSide === 0 ? 1 : 0;

    let targetX = this.camLook.x;
    let targetY = this.camLook.y;
    let pairDist = 420;
    if (shipA.alive && shipB.alive) {
      const midX = (this.shipDraw[0].x + this.shipDraw[1].x) * 0.5;
      const midY = (this.shipDraw[0].y + this.shipDraw[1].y) * 0.5;
      // Bias frame toward the human ship so it never drifts off the edge
      const bias = focusShip.alive ? 0.38 : 0;
      targetX = lerp(midX, focusDraw.x, bias);
      targetY = lerp(midY, focusDraw.y, bias);
      pairDist = Math.hypot(
        this.shipDraw[0].x - this.shipDraw[1].x,
        this.shipDraw[0].y - this.shipDraw[1].y,
      );
    } else if (focusShip.alive) {
      targetX = focusDraw.x;
      targetY = focusDraw.y;
      pairDist = 180;
    } else if (shipA.alive) {
      targetX = this.shipDraw[0].x;
      targetY = this.shipDraw[0].y;
      pairDist = 220;
    } else if (shipB.alive) {
      targetX = this.shipDraw[1].x;
      targetY = this.shipDraw[1].y;
      pairDist = 220;
    }

    // Continuous chase - never wrapPos camLook.
    // Catch up hard if the focus ship is leaving the frame.
    {
      const focusDist = Math.hypot(focusDraw.x - this.camLook.x, focusDraw.y - this.camLook.y);
      const urgency = focusShip.alive ? clamp((focusDist - 160) / 280, 0, 1) : 0;
      const follow = (1 - Math.pow(0.001, dt)) * lerp(0.72, 1.35, urgency);
      this.camLook.x += (targetX - this.camLook.x) * Math.min(1, follow);
      this.camLook.y += (targetY - this.camLook.y) * Math.min(1, follow);
      // Hard snap if still way behind (warp / spawn / wrap pop)
      if (focusShip.alive && focusDist > 520) {
        this.camLook.x = lerp(this.camLook.x, focusDraw.x, 0.55);
        this.camLook.y = lerp(this.camLook.y, focusDraw.y, 0.55);
        this.shipDraw[focusSide] = nearestImage(
          this.camLook.x,
          this.camLook.y,
          focusShip.x,
          focusShip.y,
        );
      }
    }

    // After cam moved, re-anchor focus ship to camera-nearest image
    if (focusShip.alive) {
      this.shipDraw[focusSide] = nearestImage(
        this.camLook.x,
        this.camLook.y,
        focusShip.x,
        focusShip.y,
      );
    }
    if (state.ships[otherSide].alive) {
      this.shipDraw[otherSide] = nearestImageSticky(
        this.camLook.x,
        this.camLook.y,
        state.ships[otherSide].x,
        state.ships[otherSide].y,
        this.shipDraw[otherSide].x,
        this.shipDraw[otherSide].y,
        90,
        380,
      );
    }

    // Planet / floor stick to previous tile until cam is clearly closer
    const pv = nearestImageSticky(
      this.camLook.x,
      this.camLook.y,
      PLANET_X,
      PLANET_Y,
      this.planetView.x,
      this.planetView.y,
      220,
      900,
    );
    this.planetView.x = pv.x;
    this.planetView.y = pv.y;
    this.planetGroup.position.set(pv.x, 0, pv.y);
    this.planetLight.position.set(pv.x, 40, pv.y);
    this.arenaFloor.position.set(pv.x, 0, pv.y);
    this.softPad.position.set(pv.x, -2, pv.y);

    // Separation -> zoom. Pull out enough that both ships fit with margin.
    // Also factor focus-ship distance from look target so YOU stay framed.
    const focusNow = this.shipDraw[focusSide];
    const otherNow = this.shipDraw[otherSide];
    if (shipA.alive && shipB.alive) {
      pairDist = Math.hypot(focusNow.x - otherNow.x, focusNow.y - otherNow.y);
    }
    const focusFromLook = focusShip.alive
      ? Math.hypot(focusNow.x - this.camLook.x, focusNow.y - this.camLook.y)
      : 0;
    const fitDist = Math.max(pairDist, focusFromLook * 2.1);
    const sepT = clamp((fitDist - 60) / 780, 0, 1);
    this.camSep += (sepT - this.camSep) * Math.min(1, dt * 3.4);

    let lookX = this.camLook.x;
    let lookY = 4;
    let lookZ = this.camLook.y;
    // Wider max zoom-out so far separations still keep ships on screen
    let height = lerp(200, 1100, this.camSep);
    let pull = lerp(170, 900, this.camSep);
    let fov = lerp(30, 46, this.camSep);
    height *= 1 - danger * 0.06;
    pull *= 1 - danger * 0.05;

    if (kill) {
      const p = Math.max(0, Math.min(1, kill.progress));
      const punch =
        p < 0.15 ? p / 0.15 : p < 0.72 ? 1 : 1 - ((p - 0.72) / 0.28) * 0.35;
      const ease = punch * punch * (3 - 2 * punch);
      const kf = this.viewPos(kill.focusX, kill.focusY, this.planetView);
      this.killFocus.blend = ease;
      this.killFocus.x = kf.x;
      this.killFocus.y = kf.y;
      lookX = lerp(lookX, kf.x, ease);
      lookZ = lerp(lookZ, kf.y, ease);
      lookY = 6 + ease * 14;
      height = lerp(height, 220, ease);
      pull = lerp(pull, 180, ease);
      fov = lerp(fov, 28, ease);
      if (this.speedLines) {
        this.speedLines.visible = true;
        this.speedLines.position.set(lookX, lookY + 4, lookZ);
        this.speedLines.rotation.y = this.clock * 0.9;
        (this.speedLines.material as THREE.LineBasicMaterial).opacity =
          0.12 + ease * 0.4 * (0.6 + 0.4 * Math.sin(this.clock * 14));
      }
    } else {
      this.killFocus.blend = 0;
      if (this.speedLines) {
        this.speedLines.visible = false;
        (this.speedLines.material as THREE.LineBasicMaterial).opacity = 0;
      }
    }

    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    // Tiny idle bob only - no CSS canvas scale (that ghosted against the HUD)
    const bob = 1 + Math.sin(this.clock * 0.35) * 0.006;
    const camX =
      lookX +
      Math.sin(this.clock * 0.11) * 6 * (1 - this.killFocus.blend) +
      this.shakeX;
    const camY = height * bob + this.shakeY;
    const camZ =
      lookZ +
      pull * bob +
      Math.cos(this.clock * 0.09) * 5 * (1 - this.killFocus.blend) +
      this.shakeZ;
    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(lookX, lookY, lookZ);
    // Stable exposure - avoid flicker that reads as ghosting
    this.renderer.toneMappingExposure =
      1.12 + danger * 0.06 + this.killFocus.blend * 0.18;

    if (this.ships) {
      for (let i = 0; i < 2; i++) {
        const ship = state.ships[i];
        const mesh = this.ships[i];
        const killShow = !!opts.killCam && opts.killCam.progress > 0;
        mesh.visible = ship.alive || killShow;
        if (!ship.alive && !killShow) continue;
        const vp = this.shipDraw[i];
        mesh.position.set(vp.x, 10 + Math.sin(this.clock * 3 + i) * 1.2, vp.y);
        mesh.rotation.y = -ship.angle;
        // Bank while turning
        mesh.rotation.z = THREE.MathUtils.clamp(-ship.omega * 0.22, -0.5, 0.5);
        mesh.rotation.x = THREE.MathUtils.clamp(ship.omega * 0.1, -0.25, 0.25);
        if (!ship.alive && killShow) {
          // Wreck tumble in kill cam
          mesh.rotation.z += this.clock * 1.6;
          mesh.rotation.x += Math.sin(this.clock * 2.2) * 0.4;
          mesh.position.y = 8 + Math.sin(this.clock * 5 + i) * 2;
        }

        // Flash on hit
        if (ship.flash > 0) {
          mesh.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat?.emissive) mat.emissiveIntensity = 2.2;
          });
        } else {
          mesh.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            const mat = m.material as THREE.MeshStandardMaterial;
            if (mat?.emissive && mat.userData.baseEmissive === undefined) {
              mat.userData.baseEmissive = mat.emissiveIntensity;
            }
            if (mat?.userData.baseEmissive !== undefined) {
              mat.emissiveIntensity = mat.userData.baseEmissive;
            }
          });
        }

        const cloaked = ship.cloak > 0.05;
        mesh.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat && 'opacity' in mat) {
            mat.transparent = cloaked || ship.invuln > 0;
            mat.opacity = cloaked ? 0.22 : ship.invuln > 0 ? 0.7 : 1;
          }
        });

        const ex = this.exhaust[i];
        if (ex) {
          const whip = ship.trailHeat > 0.25;
          const on = ship.thrustTime > 0 || ship.afterburn > 0 || ship.panic > 0 || whip;
          const s = on
            ? 1.2 +
              Math.random() * 0.8 +
              (ship.afterburn > 0 ? 1.2 : 0) +
              ship.trailHeat * 1.6
            : 0.01;
          ex.scale.setScalar(s);
          (ex as THREE.Mesh).visible = on;
          if (whip) {
            const mat = (ex as THREE.Mesh).material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
            if (mat && 'color' in mat) mat.color.setHex(0x7cf5c8);
          }
        }

        const shield = this.shieldMeshes[i];
        if (ship.shield > 0 && ship.alive) {
          shield.visible = true;
          const r = SHIPS[ship.shipId].radius + 10;
          shield.scale.setScalar(r);
          shield.position.copy(mesh.position);
          shield.rotation.y = this.clock * 2;
          (shield.material as THREE.MeshBasicMaterial).opacity =
            0.2 + 0.15 * Math.sin(this.clock * 8);
        } else {
          shield.visible = false;
        }
      }

      // Tractor - thicker animated beam
      const tractorShip = state.ships.find((s) => s.tractor > 0 && s.alive);
      if (tractorShip) {
        const foe = state.ships[tractorShip.player === 0 ? 1 : 0];
        this.tractorLine.visible = foe.alive;
        const pos = this.tractorLine.geometry.attributes.position as THREE.BufferAttribute;
        const wobble = Math.sin(this.clock * 14) * 4;
        const ta = this.shipDraw[tractorShip.player];
        const tb = this.shipDraw[foe.player];
        pos.setXYZ(0, ta.x, 8 + wobble * 0.2, ta.y);
        pos.setXYZ(1, tb.x, 8 - wobble * 0.2, tb.y);
        pos.needsUpdate = true;
        const mat = this.tractorLine.material as THREE.LineBasicMaterial;
        mat.opacity = 0.55 + 0.25 * Math.sin(this.clock * 10);
      } else {
        this.tractorLine.visible = false;
      }

      // Drain cone - pulse
      const coneShip = state.ships.find((s) => s.cone > 0 && s.alive);
      if (coneShip) {
        this.coneMesh.visible = true;
        const cv = this.shipDraw[coneShip.player];
        this.coneMesh.position.set(cv.x, 2, cv.y);
        this.coneMesh.rotation.y = -coneShip.angle;
        const cm = this.coneMesh.material as THREE.MeshBasicMaterial;
        cm.opacity = 0.22 + 0.12 * Math.sin(this.clock * 12);
        this.coneMesh.scale.setScalar(1 + 0.06 * Math.sin(this.clock * 9));
      } else {
        this.coneMesh.visible = false;
      }
    }

    this.syncProjectiles(state);
    this.syncDrones(state);
    this.syncAsteroids(state);
    this.syncEffects(state);
    this.renderer.render(this.scene, this.camera);
  }

  private asteroidColor(kind: string): number {
    switch (kind) {
      case 'heal':
        return 0x4ade80;
      case 'energy':
        return 0x38bdf8;
      case 'power':
        return 0xf97316;
      case 'haste':
        return 0xc084fc;
      case 'shield':
        return 0xfbbf24;
      default:
        return 0x9a8468;
    }
  }

  private makeAsteroidMesh(kind: string, radius: number): THREE.Group {
    const g = new THREE.Group();
    const color = this.asteroidColor(kind);
    if (kind === 'rock') {
      const body = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius * 0.85, 0),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.92,
          metalness: 0.08,
          flatShading: true,
        }),
      );
      body.scale.set(1 + Math.random() * 0.2, 0.85 + Math.random() * 0.25, 1);
      const chunk = new THREE.Mesh(
        new THREE.TetrahedronGeometry(radius * 0.45, 0),
        new THREE.MeshStandardMaterial({
          color: 0x7a6550,
          roughness: 0.95,
          flatShading: true,
        }),
      );
      chunk.position.set(radius * 0.35, radius * 0.15, -radius * 0.2);
      g.add(body, chunk);
    } else {
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(radius * 0.75, 0),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.35,
          roughness: 0.25,
          metalness: 0.45,
          flatShading: true,
        }),
      );
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.15, 12, 10),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        }),
      );
      g.add(core, glow);
    }
    return g;
  }

  private syncAsteroids(state: SimState): void {
    const seen = new Set<number>();
    for (const a of state.asteroids) {
      seen.add(a.id);
      let obj = this.asteroids.get(a.id);
      if (!obj) {
        const mesh = this.makeAsteroidMesh(a.kind, a.radius);
        this.scene.add(mesh);
        obj = { mesh, id: a.id, kind: a.kind };
        this.asteroids.set(a.id, obj);
      }
      const av = this.cachedViewPos(a.id + 100000, a.x, a.y);
      obj.mesh.position.set(av.x, 10, av.y);
      obj.mesh.rotation.y = -a.spin;
      obj.mesh.rotation.x = a.spin * 0.4;
      if (a.kind !== 'rock') {
        const pulse = 1 + Math.sin(this.clock * 8 + a.id) * 0.1;
        obj.mesh.scale.setScalar(pulse);
      }
    }
    for (const [id, obj] of this.asteroids) {
      if (!seen.has(id)) {
        this.scene.remove(obj.mesh);
        obj.mesh.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
        this.asteroids.delete(id);
        this.drawCache.delete(id + 100000);
      }
    }
  }

  private syncProjectiles(state: SimState): void {
    const seen = new Set<number>();
    for (const p of state.projectiles) {
      seen.add(p.id);
      let obj = this.projectiles.get(p.id);
      if (!obj) {
        const color =
          p.kind === 'nuke'
            ? 0xff6b2d
            : p.kind === 'flame'
              ? 0xff7a20
              : p.kind === 'spore' || p.kind === 'drone_shot'
                ? 0x84cc16
                : p.kind === 'limpet'
                  ? 0xe879f9
                  : p.kind === 'crystal' || p.kind === 'shard'
                    ? 0x22d3ee
                    : p.kind === 'butt'
                      ? 0xfbbf24
                      : 0xe8f0ff;

        const root = new THREE.Group();
        let body: THREE.Mesh;
        if (p.kind === 'nuke') {
          body = new THREE.Mesh(
            new THREE.CapsuleGeometry(p.radius * 0.45, p.radius * 2.2, 6, 10),
            new THREE.MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 1.8,
              roughness: 0.35,
              metalness: 0.4,
            }),
          );
          body.rotation.z = Math.PI / 2;
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(p.radius * 1.4, 10, 10),
            new THREE.MeshBasicMaterial({
              color: 0xffaa55,
              transparent: true,
              opacity: 0.35,
              depthWrite: false,
            }),
          );
          root.add(body, glow);
        } else if (p.kind === 'butt') {
          body = new THREE.Mesh(
            new THREE.ConeGeometry(p.radius * 0.7, p.radius * 2.4, 8),
            new THREE.MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 1.4,
            }),
          );
          body.rotation.z = -Math.PI / 2;
          root.add(body);
        } else if (p.kind === 'crystal' || p.kind === 'shard') {
          body = new THREE.Mesh(
            new THREE.OctahedronGeometry(p.radius * 0.9, 0),
            new THREE.MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 1.2,
              flatShading: true,
            }),
          );
          root.add(body);
        } else {
          body = new THREE.Mesh(
            new THREE.SphereGeometry(p.radius * 0.55, 8, 8),
            new THREE.MeshBasicMaterial({ color }),
          );
          if (p.kind === 'heavy') body.scale.setScalar(1.6);
          root.add(body);
        }

        this.scene.add(root);
        obj = { mesh: root, id: p.id, kind: p.kind };
        this.projectiles.set(p.id, obj);
      }
      const pv = this.cachedViewPos(p.id + 200000, p.x, p.y);
      obj.mesh.position.set(pv.x, 8, pv.y);
      const ang = Math.atan2(p.vy, p.vx);
      obj.mesh.rotation.y = -ang;
      if (p.kind === 'nuke' || p.kind === 'flame') {
        const pulse = 1 + Math.sin(this.clock * 18 + p.id) * 0.08;
        obj.mesh.scale.setScalar(pulse);
      }
    }
    for (const [id, obj] of this.projectiles) {
      if (!seen.has(id)) {
        this.scene.remove(obj.mesh);
        obj.mesh.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
        this.projectiles.delete(id);
        this.drawCache.delete(id + 200000);
      }
    }
  }

  private syncDrones(state: SimState): void {
    const seen = new Set<number>();
    for (const d of state.drones) {
      seen.add(d.id);
      let obj = this.drones.get(d.id);
      if (!obj) {
        const mesh = buildDroneMesh();
        this.scene.add(mesh);
        obj = { mesh, id: d.id };
        this.drones.set(d.id, obj);
      }
      const dv = this.cachedViewPos(d.id + 300000, d.x, d.y);
      obj.mesh.position.set(dv.x, 8, dv.y);
      obj.mesh.rotation.y = -d.angle;
    }
    for (const [id, obj] of this.drones) {
      if (!seen.has(id)) {
        this.scene.remove(obj.mesh);
        this.drones.delete(id);
        this.drawCache.delete(id + 300000);
      }
    }
  }

  private makeFxGroup(kind: string, color: string): THREE.Group {
    const g = new THREE.Group();
    const col = new THREE.Color(color);

    if (kind === 'ring' || kind === 'nova' || kind === 'nuke_flash' || kind === 'phase') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 1.05, 48),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.name = 'ring';
      g.add(ring);
    }

    if (kind === 'nuke_flash' || kind === 'explosion' || kind === 'nova') {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 16, 12),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
      );
      core.name = 'core';
      g.add(core);
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 12, 10),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      halo.name = 'halo';
      g.add(halo);
    } else if (kind === 'spark' || kind === 'panic' || kind === 'wake' || kind === 'hive' || kind === 'pickup') {
      const n = kind === 'hive' ? 10 : kind === 'pickup' ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const bit = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 6, 6),
          new THREE.MeshBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          }),
        );
        const a = (i / n) * Math.PI * 2;
        bit.position.set(Math.cos(a) * 0.6, (i % 3) * 0.15, Math.sin(a) * 0.6);
        bit.name = `bit${i}`;
        g.add(bit);
      }
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 10, 8),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
      );
      core.name = 'core';
      g.add(core);
    } else if (kind === 'teleport' || kind === 'cloak_pop') {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.45, 1.6, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      pillar.name = 'pillar';
      g.add(pillar);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.85, 32),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.name = 'ring';
      g.add(ring);
    } else if (kind === 'shield_flash') {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.45,
          wireframe: true,
          depthWrite: false,
        }),
      );
      shell.name = 'shell';
      g.add(shell);
    } else {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
      core.name = 'core';
      g.add(core);
    }

    return g;
  }

  private syncEffects(state: SimState): void {
    const seen = new Set<number>();
    for (const e of state.effects) {
      seen.add(e.id);
      let obj = this.effects.get(e.id);
      if (!obj) {
        const group = this.makeFxGroup(e.kind, e.color);
        this.scene.add(group);
        obj = { group, id: e.id, kind: e.kind };
        this.effects.set(e.id, obj);
        if (e.kind === 'nuke_flash' || e.kind === 'explosion' || e.kind === 'nova') {
          this.addShake(e.kind === 'nuke_flash' ? 12 : 6);
        }
      }
      const t = 1 - e.life / e.maxLife;
      const ease = 1 - Math.pow(1 - t, 2);
      const r = e.radius * (0.25 + ease * 1.6);
      const ev = this.cachedViewPos(e.id + 400000, e.x, e.y);
      obj.group.position.set(ev.x, 10 + Math.sin(t * Math.PI) * 6, ev.y);
      obj.group.rotation.y = this.clock * 3;

      obj.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshBasicMaterial;
        if (!mat || !('opacity' in mat)) return;
        if (m.name === 'ring') {
          m.scale.setScalar(r);
          mat.opacity = (1 - t) * 0.85;
        } else if (m.name === 'halo') {
          m.scale.setScalar(r * 1.15);
          mat.opacity = (1 - t) * 0.4;
        } else if (m.name === 'core' || m.name === 'shell') {
          const s = e.kind === 'shield_flash' ? r : r * 0.55;
          m.scale.setScalar(s);
          mat.opacity = (1 - t) * (e.kind === 'nuke_flash' ? 0.9 : 0.6);
        } else if (m.name === 'pillar') {
          m.scale.set(1 + ease * 2, r * 0.08, 1 + ease * 2);
          mat.opacity = (1 - t) * 0.75;
        } else if (m.name.startsWith('bit')) {
          const idx = Number(m.name.slice(3)) || 0;
          const a = (idx / 8) * Math.PI * 2 + t * 4;
          const rad = 0.4 + ease * 1.4;
          m.position.set(Math.cos(a) * rad * r * 0.08, (idx % 3) * 0.2, Math.sin(a) * rad * r * 0.08);
          mat.opacity = (1 - t) * 0.9;
        }
      });
    }
    for (const [id, obj] of this.effects) {
      if (!seen.has(id)) {
        this.scene.remove(obj.group);
        obj.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
        this.effects.delete(id);
        this.drawCache.delete(id + 400000);
      }
    }
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
