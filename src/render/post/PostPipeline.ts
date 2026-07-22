import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Soft chromatic aberration + vignette punch for combat drama. */
const JuiceShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    amount: { value: 0.0012 },
    vignette: { value: 0.22 },
    punch: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float vignette;
    uniform float punch;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      float dist = length(dir);
      float aber = amount + punch * 0.004;
      vec2 off = normalize(dir + 1e-5) * aber * dist;
      float r = texture2D(tDiffuse, uv + off).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - off).b;
      vec3 col = vec3(r, g, b);
      col += punch * 0.18 * vec3(1.0, 0.85, 0.55);
      float vig = smoothstep(0.95, 0.25, dist);
      col *= mix(1.0 - vignette, 1.0, vig);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export type PostMood = {
  bloomStrength: number;
  bloomRadius: number;
  chromatic: number;
  vignette: number;
  grain: number;
};

const DEFAULT_MOOD: PostMood = {
  bloomStrength: 0.55,
  bloomRadius: 0.42,
  chromatic: 0.0011,
  vignette: 0.2,
  grain: 0.18,
};

/**
 * Neon arcade post stack: bloom, chromatic, grain, output color.
 */
export class PostPipeline {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private juice: ShaderPass;
  private film: FilmPass;
  private punch = 0;
  private mood: PostMood = { ...DEFAULT_MOOD };
  private enabled = {
    bloom: true,
    chromatic: true,
    grain: true,
    punch: true,
  };

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this.mood.bloomStrength,
      this.mood.bloomRadius,
      0.72,
    );
    this.composer.addPass(this.bloom);

    this.juice = new ShaderPass(JuiceShader);
    this.composer.addPass(this.juice);

    this.film = new FilmPass(this.mood.grain, false);
    this.composer.addPass(this.film);

    this.composer.addPass(new OutputPass());
    this.setSize(width, height);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  setEnabled(flags: {
    bloom?: boolean;
    chromatic?: boolean;
    grain?: boolean;
    punch?: boolean;
  }): void {
    this.enabled = { ...this.enabled, ...flags };
    this.applyEnabled();
  }

  private applyEnabled(): void {
    this.bloom.strength = this.enabled.bloom ? this.mood.bloomStrength : 0;
    this.bloom.radius = this.enabled.bloom ? this.mood.bloomRadius : 0;
    this.juice.uniforms.amount!.value = this.enabled.chromatic
      ? this.mood.chromatic
      : 0;
    const filmIntensity = (this.film.uniforms as { intensity?: { value: number } })
      .intensity;
    if (filmIntensity) {
      filmIntensity.value = this.enabled.grain ? this.mood.grain : 0;
    }
  }

  setMood(partial: Partial<PostMood>): void {
    this.mood = { ...this.mood, ...partial };
    this.applyEnabled();
    this.juice.uniforms.vignette!.value = this.mood.vignette;
  }

  /** Short bloom/chroma kick for hits and kill cam impact. */
  addPunch(amount = 0.8): void {
    if (!this.enabled.punch) return;
    this.punch = Math.min(1.6, this.punch + amount);
  }

  update(dt: number, opts?: { killCam?: boolean; danger?: number; impact?: boolean }): void {
    if (opts?.impact) this.addPunch(1.1);
    this.punch = Math.max(0, this.punch - dt * 2.4);

    let bloom = this.enabled.bloom ? this.mood.bloomStrength : 0;
    let chroma = this.enabled.chromatic ? this.mood.chromatic : 0;
    let vig = this.mood.vignette;
    if (opts?.killCam && this.enabled.bloom) {
      bloom *= 1.55;
      if (this.enabled.chromatic) chroma *= 2.2;
      vig = Math.max(vig, 0.38);
    }
    if (opts?.danger) {
      vig = Math.min(0.55, vig + opts.danger * 0.28);
      if (this.enabled.chromatic) chroma *= 1 + opts.danger * 0.8;
    }
    const punch = this.enabled.punch ? this.punch : 0;
    this.bloom.strength = bloom + punch * 0.55;
    this.juice.uniforms.amount!.value = chroma + punch * 0.002;
    this.juice.uniforms.vignette!.value = vig;
    this.juice.uniforms.punch!.value = punch;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
  }
}
