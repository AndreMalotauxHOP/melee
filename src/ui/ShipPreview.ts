import * as THREE from 'three';
import type { ShipId } from '../game/types';
import { buildShipMesh } from '../render/shipMeshes';

/** Spinning 3D ship viewer for draft / pick screens. */
export class ShipPreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private ship: THREE.Group | null = null;
  private shipId: ShipId | null = null;
  private raf = 0;
  private clock = 0;
  private disposed = false;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 28, 52);
    this.camera.lookAt(0, 0, 0);

    this.scene.fog = new THREE.FogExp2('#050814', 0.012);
    this.scene.add(new THREE.AmbientLight(0x6688aa, 0.7));
    const key = new THREE.DirectionalLight(0xfff0dd, 1.4);
    key.position.set(30, 50, 20);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x66aaff, 0.7);
    rim.position.set(-40, 20, -30);
    this.scene.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(22, 48),
      new THREE.MeshBasicMaterial({
        color: 0x102038,
        transparent: true,
        opacity: 0.45,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -8;
    this.scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(14, 16, 48),
      new THREE.MeshBasicMaterial({
        color: 0x3ee0c4,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -7.8;
    this.scene.add(ring);

    this.resize();
    this.tick();
  }

  setShip(id: ShipId): void {
    if (this.shipId === id && this.ship) return;
    this.shipId = id;
    if (this.ship) {
      this.scene.remove(this.ship);
      this.ship.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else (mat as THREE.Material).dispose();
      });
      this.ship = null;
    }
    const mesh = buildShipMesh(id);
    // Preview scale - ship meshes are already scaled for arena
    mesh.scale.multiplyScalar(0.55);
    this.ship = mesh;
    this.scene.add(mesh);
  }

  resize(): void {
    const w = this.canvas.clientWidth || 280;
    const h = this.canvas.clientHeight || 200;
    this.canvas.width = Math.floor(w * Math.min(window.devicePixelRatio, 2));
    this.canvas.height = Math.floor(h * Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private tick = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    this.clock += 0.016;
    if (this.ship) {
      this.ship.rotation.y = this.clock * 0.7;
      this.ship.rotation.x = Math.sin(this.clock * 0.5) * 0.12;
      this.ship.position.y = Math.sin(this.clock * 1.4) * 1.2;
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.ship) this.scene.remove(this.ship);
    this.renderer.dispose();
  }
}
