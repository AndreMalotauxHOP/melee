import * as THREE from 'three';

type LightSlot = {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
};

const POOL = 12;

/** Short-lived point lights spawned by shots, hits, and explosions. */
export class CombatLights {
  private pool: LightSlot[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    for (let i = 0; i < POOL; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 180, 2);
      light.visible = false;
      scene.add(light);
      this.pool.push({ light, life: 0, maxLife: 0.2 });
    }
  }

  burst(
    x: number,
    y: number,
    z: number,
    color: string | number,
    intensity = 2.4,
    duration = 0.28,
    distance = 160,
  ): void {
    const slot = this.pool.find((s) => s.life <= 0) ?? this.pool[0]!;
    slot.light.color.set(color);
    slot.light.intensity = intensity;
    slot.light.distance = distance;
    slot.light.position.set(x, y, z);
    slot.light.visible = true;
    slot.life = duration;
    slot.maxLife = duration;
  }

  update(dt: number): void {
    for (const s of this.pool) {
      if (s.life <= 0) {
        s.light.visible = false;
        s.light.intensity = 0;
        continue;
      }
      s.life -= dt;
      const u = Math.max(0, s.life / s.maxLife);
      s.light.intensity = s.light.intensity * 0.0 + (2.8 * u * u);
      // keep color intensity via previous - re-scale from max
      s.light.intensity = 3.2 * u * u;
      if (s.life <= 0) s.light.visible = false;
    }
  }

  dispose(): void {
    for (const s of this.pool) {
      this.scene.remove(s.light);
      s.light.dispose();
    }
    this.pool = [];
  }
}
