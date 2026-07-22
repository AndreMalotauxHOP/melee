import * as THREE from 'three';

type Ribbon = {
  mesh: THREE.Mesh;
  positions: Float32Array;
  head: number;
  active: boolean;
  color: THREE.Color;
};

const SEGMENTS = 28;

/**
 * Soft neon motion ribbons for thrusters / whip heat.
 */
export class RibbonTrails {
  private ribbons: Ribbon[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.ensureSlots(2);
  }

  ensureSlots(n: number): void {
    while (this.ribbons.length < n) {
      this.ribbons.push(this.makeRibbon('#7cf5c8'));
    }
  }

  private makeRibbon(hex: string): Ribbon {
    const positions = new Float32Array(SEGMENTS * 3);
    const indices: number[] = [];
    const halfW = 2.4;
    for (let i = 0; i < SEGMENTS - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    const ribbonPos = new Float32Array(SEGMENTS * 2 * 3);
    const meshGeo = new THREE.BufferGeometry();
    meshGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3));
    meshGeo.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(meshGeo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.scene.add(mesh);
    void halfW;
    return {
      mesh,
      positions,
      head: 0,
      active: false,
      color: new THREE.Color(hex),
    };
  }

  setColor(slot: number, hex: string): void {
    this.ensureSlots(slot + 1);
    const r = this.ribbons[slot];
    if (!r) return;
    r.color.set(hex);
    (r.mesh.material as THREE.MeshBasicMaterial).color.copy(r.color);
  }

  /**
   * Push a world-space sample (arena XZ mapped to Three XZ).
   * `on` enables emission; when false, ribbon fades out.
   */
  update(
    slot: number,
    x: number,
    y: number,
    z: number,
    on: boolean,
    heat = 0,
  ): void {
    this.ensureSlots(slot + 1);
    const r = this.ribbons[slot];
    if (!r) return;
    const mat = r.mesh.material as THREE.MeshBasicMaterial;
    if (on) {
      r.active = true;
      r.mesh.visible = true;
      for (let i = SEGMENTS - 1; i > 0; i--) {
        r.positions[i * 3] = r.positions[(i - 1) * 3]!;
        r.positions[i * 3 + 1] = r.positions[(i - 1) * 3 + 1]!;
        r.positions[i * 3 + 2] = r.positions[(i - 1) * 3 + 2]!;
      }
      r.positions[0] = x;
      r.positions[1] = y;
      r.positions[2] = z;
      mat.opacity = Math.min(0.85, 0.35 + heat * 0.5);
    } else if (r.active) {
      mat.opacity *= 0.9;
      if (mat.opacity < 0.04) {
        r.active = false;
        r.mesh.visible = false;
        return;
      }
    } else {
      r.mesh.visible = false;
      return;
    }

    const posAttr = r.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const halfW = 1.6 + heat * 2.2;
    for (let i = 0; i < SEGMENTS; i++) {
      const px = r.positions[i * 3]!;
      const py = r.positions[i * 3 + 1]!;
      const pz = r.positions[i * 3 + 2]!;
      let tx = 0;
      let tz = 1;
      if (i < SEGMENTS - 1) {
        tx = r.positions[(i + 1) * 3]! - px;
        tz = r.positions[(i + 1) * 3 + 2]! - pz;
      } else if (i > 0) {
        tx = px - r.positions[(i - 1) * 3]!;
        tz = pz - r.positions[(i - 1) * 3 + 2]!;
      }
      const len = Math.hypot(tx, tz) || 1;
      const nx = (-tz / len) * halfW * (1 - i / SEGMENTS);
      const nz = (tx / len) * halfW * (1 - i / SEGMENTS);
      const fadeY = py + (1 - i / SEGMENTS) * 0.4;
      posAttr.setXYZ(i * 2, px + nx, fadeY, pz + nz);
      posAttr.setXYZ(i * 2 + 1, px - nx, fadeY, pz - nz);
    }
    posAttr.needsUpdate = true;
    r.mesh.geometry.computeBoundingSphere();
  }

  dispose(): void {
    for (const r of this.ribbons) {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      (r.mesh.material as THREE.Material).dispose();
    }
    this.ribbons = [];
  }
}
