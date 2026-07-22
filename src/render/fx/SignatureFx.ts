import * as THREE from 'three';
import type { ShipId } from '../../game/types';
import { SHIPS } from '../../game/ships';

type Burst = {
  root: THREE.Group;
  life: number;
  maxLife: number;
  kind: string;
};

/** Ship-signature combat bursts + shared impact grammar. */
export class SignatureFx {
  private scene: THREE.Scene;
  private bursts: Burst[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Readable hit flash + directional spark cone. */
  impact(
    x: number,
    y: number,
    z: number,
    angle: number,
    amount: number,
    color = '#ffb347',
  ): void {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const col = new THREE.Color(color);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 1.1, 32),
      new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(8 + amount * 0.35);
    root.add(ring);

    const n = 6 + Math.min(10, Math.floor(amount / 4));
    for (let i = 0; i < n; i++) {
      const bit = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 4 + Math.random() * 6),
        new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const a = angle + (Math.random() - 0.5) * 1.2;
      const d = 6 + Math.random() * 14;
      bit.position.set(Math.cos(a) * d, 2 + Math.random() * 4, Math.sin(a) * d);
      bit.lookAt(0, 2, 0);
      bit.userData.vx = Math.cos(a) * (40 + Math.random() * 50);
      bit.userData.vy = 10 + Math.random() * 30;
      bit.userData.vz = Math.sin(a) * (40 + Math.random() * 50);
      root.add(bit);
    }

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    flash.scale.setScalar(6 + amount * 0.2);
    root.add(flash);

    this.scene.add(root);
    this.bursts.push({ root, life: 0.35 + Math.min(0.35, amount * 0.01), maxLife: 0.4, kind: 'impact' });
  }

  /** Unique kill flourish per ship fantasy. */
  killSignature(
    shipId: ShipId,
    x: number,
    y: number,
    z: number,
  ): void {
    const def = SHIPS[shipId];
    const root = new THREE.Group();
    root.position.set(x, y, z);
    const accent = new THREE.Color(def.accent);
    const body = new THREE.Color(def.color);

    switch (shipId) {
      case 'solhammer': {
        for (let i = 0; i < 3; i++) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 1.0, 48),
            new THREE.MeshBasicMaterial({
              color: body,
              transparent: true,
              opacity: 0.8 - i * 0.2,
              side: THREE.DoubleSide,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.scale.setScalar(20 + i * 18);
          ring.userData.grow = 80 + i * 40;
          root.add(ring);
        }
        break;
      }
      case 'shade': {
        for (let i = 0; i < 14; i++) {
          const shard = new THREE.Mesh(
            new THREE.TetrahedronGeometry(2.2, 0),
            new THREE.MeshBasicMaterial({
              color: accent,
              transparent: true,
              opacity: 0.9,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          const a = (i / 14) * Math.PI * 2;
          shard.position.set(Math.cos(a) * 4, Math.random() * 6, Math.sin(a) * 4);
          shard.userData.vx = Math.cos(a) * 55;
          shard.userData.vy = 20 + Math.random() * 40;
          shard.userData.vz = Math.sin(a) * 55;
          root.add(shard);
        }
        break;
      }
      case 'cinder': {
        for (let i = 0; i < 10; i++) {
          const ribbon = new THREE.Mesh(
            new THREE.BoxGeometry(2, 1, 18),
            new THREE.MeshBasicMaterial({
              color: 0xff6a20,
              transparent: true,
              opacity: 0.75,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          const a = (i / 10) * Math.PI * 2;
          ribbon.position.set(Math.cos(a) * 8, 1, Math.sin(a) * 8);
          ribbon.rotation.y = -a;
          ribbon.userData.vy = 8;
          root.add(ribbon);
        }
        break;
      }
      case 'prism': {
        for (let i = 0; i < 8; i++) {
          const p = new THREE.Mesh(
            new THREE.OctahedronGeometry(3, 0),
            new THREE.MeshBasicMaterial({
              color: i % 2 ? accent : body,
              transparent: true,
              opacity: 0.85,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          const a = (i / 8) * Math.PI * 2;
          p.position.set(Math.cos(a) * 6, 4, Math.sin(a) * 6);
          p.userData.vx = Math.cos(a) * 35;
          p.userData.vy = 25;
          p.userData.vz = Math.sin(a) * 35;
          root.add(p);
        }
        break;
      }
      case 'railfox': {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(1.2, 0.2, 120, 8),
          new THREE.MeshBasicMaterial({
            color: accent,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        beam.rotation.z = Math.PI / 2;
        beam.userData.grow = 0;
        root.add(beam);
        break;
      }
      case 'zephyr': {
        for (let i = 0; i < 6; i++) {
          const ghost = new THREE.Mesh(
            new THREE.SphereGeometry(3, 10, 8),
            new THREE.MeshBasicMaterial({
              color: accent,
              transparent: true,
              opacity: 0.45,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          ghost.position.set((i - 2.5) * 8, 2, (i % 2) * 4);
          ghost.userData.vx = 40;
          root.add(ghost);
        }
        break;
      }
      default: {
        const nova = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 12),
          new THREE.MeshBasicMaterial({
            color: accent,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        nova.scale.setScalar(12);
        nova.userData.grow = 90;
        root.add(nova);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.5, 1.05, 40),
          new THREE.MeshBasicMaterial({
            color: body,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.scale.setScalar(16);
        ring.userData.grow = 70;
        root.add(ring);
      }
    }

    this.scene.add(root);
    this.bursts.push({ root, life: 0.85, maxLife: 0.85, kind: 'kill' });
  }

  update(dt: number): void {
    const next: Burst[] = [];
    for (const b of this.bursts) {
      b.life -= dt;
      const u = Math.max(0, b.life / b.maxLife);
      b.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.MeshBasicMaterial;
        if (mat?.opacity !== undefined) {
          mat.opacity = Math.min(mat.opacity, 0.15 + u * 0.85);
        }
        if (m.userData.grow) {
          const s = m.scale.x + m.userData.grow * dt;
          m.scale.setScalar(s);
        }
        if (m.userData.vx !== undefined) {
          m.position.x += m.userData.vx * dt;
          m.position.y += (m.userData.vy ?? 0) * dt;
          m.position.z += m.userData.vz * dt;
          m.rotation.x += dt * 4;
          m.rotation.y += dt * 5;
        }
      });
      if (b.life > 0) next.push(b);
      else {
        this.scene.remove(b.root);
        b.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
      }
    }
    this.bursts = next;
  }

  dispose(): void {
    for (const b of this.bursts) {
      this.scene.remove(b.root);
    }
    this.bursts = [];
  }
}
