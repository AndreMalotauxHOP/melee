import * as THREE from 'three';
import type { ShipRuntime } from '../../game/types';
import { SHIPS } from '../../game/ships';

type HudPair = {
  root: THREE.Group;
  hpFill: THREE.Mesh;
  enFill: THREE.Mesh;
  frame: THREE.Mesh;
};

/**
 * Tiny holographic HP / energy bars that ride above each ship in world space.
 */
export class WorldHud {
  private bars: HudPair[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.ensureSlots(2);
  }

  ensureSlots(n: number): void {
    while (this.bars.length < n) {
      this.bars.push(this.make());
    }
  }

  private make(): HudPair {
    const root = new THREE.Group();
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 5.5),
      new THREE.MeshBasicMaterial({
        color: 0x102038,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    frame.position.y = 0;
    root.add(frame);

    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 1.6),
      new THREE.MeshBasicMaterial({
        color: 0x1a1018,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    hpBg.position.set(0, 1.1, 0.05);
    root.add(hpBg);

    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 1.4),
      new THREE.MeshBasicMaterial({
        color: 0x7cffb2,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    hpFill.position.set(0, 1.1, 0.1);
    root.add(hpFill);

    const enBg = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 1.1),
      new THREE.MeshBasicMaterial({
        color: 0x101828,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    enBg.position.set(0, -1.0, 0.05);
    root.add(enBg);

    const enFill = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 0.95),
      new THREE.MeshBasicMaterial({
        color: 0x66b0ff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    enFill.position.set(0, -1.0, 0.1);
    root.add(enFill);

    root.visible = false;
    this.scene.add(root);
    return { root, hpFill, enFill, frame };
  }

  update(
    slot: number,
    ship: ShipRuntime,
    wx: number,
    wy: number,
    wz: number,
    cam: THREE.Camera,
    show: boolean,
  ): void {
    this.ensureSlots(slot + 1);
    const h = this.bars[slot];
    if (!h) return;
    if (!show || !ship.alive) {
      h.root.visible = false;
      return;
    }
    h.root.visible = true;
    const r = SHIPS[ship.shipId].radius;
    h.root.position.set(wx, wy + r + 18, wz);
    h.root.quaternion.copy(cam.quaternion);

    const hp = Math.max(0, Math.min(1, ship.hp / Math.max(1, ship.maxHp)));
    const en = Math.max(0, Math.min(1, ship.energy / Math.max(1, ship.maxEnergy)));
    h.hpFill.scale.x = Math.max(0.02, hp);
    h.hpFill.position.x = -12 * (1 - hp);
    (h.hpFill.material as THREE.MeshBasicMaterial).color.set(
      hp < 0.3 ? 0xff5a6a : hp < 0.55 ? 0xffe566 : 0x7cffb2,
    );
    h.enFill.scale.x = Math.max(0.02, en);
    h.enFill.position.x = -12 * (1 - en);

    if (ship.hitRead > 0) {
      (h.frame.material as THREE.MeshBasicMaterial).opacity = 0.75;
    } else {
      (h.frame.material as THREE.MeshBasicMaterial).opacity = 0.45;
    }
  }

  dispose(): void {
    for (const h of this.bars) {
      this.scene.remove(h.root);
      h.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
    }
    this.bars = [];
  }
}
