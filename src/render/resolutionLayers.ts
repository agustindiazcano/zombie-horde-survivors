import * as THREE from 'three';

/**
 * Separate render resolutions for parts of the picture (the enemies, the other characters, the
 * water), the "Resolution" options of the graphics window.
 *
 * How it works: the world is drawn at the game's resolution into an offscreen target (with a depth
 * texture), minus the lowered parts. Each lowered part is drawn alone into a smaller target (colour
 * and depth, nearest-neighbour). One full-screen pass then puts the picture together: a block of a
 * lowered part shows where its depth is nearer than the world's, and it also does the tone mapping
 * and the colour encoding that the screen would have done. With every part at 100% none of this
 * runs and the scene is drawn straight to the screen as before.
 *
 * Tricks that keep it cheap and correct:
 * - A part lives on a three.js layer (bit). Lights are enabled on every bit, so the part is lit and
 *   shadowed like the rest, and the shadow map from the world pass is reused.
 * - Characters stay on layer 0 too, so they still cast shadows, but their materials are switched to
 *   write no colour and no depth during the world pass. The water is only on its own layer.
 */

export type LayerName = 'enemies' | 'allies' | 'water';

const BIT: Record<LayerName, number> = { enemies: 1, allies: 2, water: 3 };
const ORDER: LayerName[] = ['enemies', 'allies', 'water'];
/** How often (frames) the list of lights is rebuilt: a flashlight appears now and then. */
const LIGHT_SCAN = 20;

export interface LayerInput {
  /** Share of the game's resolution each part is drawn at (1 or more = not lowered). */
  scales: Record<LayerName, number>;
  /** The root objects of the enemies and of the other characters (soldiers, drone, animals). */
  enemies: Iterable<THREE.Object3D>;
  allies: Iterable<THREE.Object3D>;
  /** The ocean mesh, or null. */
  water: THREE.Object3D | null;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tMain;
uniform sampler2D tMainDepth;
uniform sampler2D tEnemies;
uniform sampler2D tEnemiesDepth;
uniform sampler2D tAllies;
uniform sampler2D tAlliesDepth;
uniform sampler2D tWater;
uniform sampler2D tWaterDepth;
uniform vec3 uOn; // enemies, allies, water
varying vec2 vUv;

void main() {
  vec3 rgb = texture2D(tMain, vUv).rgb;
  float mainDepth = texture2D(tMainDepth, vUv).x;
  float front = mainDepth;
  if (uOn.x > 0.5) {
    vec4 c = texture2D(tEnemies, vUv);
    float d = texture2D(tEnemiesDepth, vUv).x;
    if (c.a > 0.01 && d < front) { rgb = c.rgb; front = d; }
  }
  if (uOn.y > 0.5) {
    vec4 c = texture2D(tAllies, vUv);
    float d = texture2D(tAlliesDepth, vUv).x;
    if (c.a > 0.01 && d < front) { rgb = c.rgb; front = d; }
  }
  if (uOn.z > 0.5) {
    // The water is see-through: it goes over whatever is behind it, never over something nearer.
    vec4 w = texture2D(tWater, vUv);
    float d = texture2D(tWaterDepth, vUv).x;
    if (w.a > 0.001 && d < front) rgb = w.rgb + rgb * (1.0 - w.a);
  }
  gl_FragColor = vec4(rgb, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makeTarget(samples: number): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    generateMipmaps: false,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    samples,
  });
  target.depthTexture = new THREE.DepthTexture(2, 2);
  target.depthTexture.minFilter = THREE.NearestFilter;
  target.depthTexture.magFilter = THREE.NearestFilter;
  return target;
}

export class ResolutionLayers {
  private readonly main: THREE.WebGLRenderTarget;
  private readonly targets: Record<LayerName, THREE.WebGLRenderTarget>;
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly lights: THREE.Light[] = [];
  private readonly characterRoots = new Set<THREE.Object3D>();
  private frame = 0;
  private readonly size = new THREE.Vector2();
  private readonly clearColor = new THREE.Color();

  constructor(samples: number) {
    this.main = makeTarget(samples);
    this.targets = { enemies: makeTarget(0), allies: makeTarget(0), water: makeTarget(0) };
    const uniforms: Record<string, THREE.IUniform> = {
      tMain: { value: this.main.texture },
      tMainDepth: { value: this.main.depthTexture },
      uOn: { value: new THREE.Vector3() },
    };
    for (const name of ORDER) {
      const key = name[0]!.toUpperCase() + name.slice(1);
      uniforms[`t${key}`] = { value: this.targets[name].texture };
      uniforms[`t${key}Depth`] = { value: this.targets[name].depthTexture };
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quad = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** True when at least one part is drawn below the game's resolution. */
  static isActive(scales: Record<LayerName, number>): boolean {
    return ORDER.some((name) => scales[name] < 1);
  }

  /** Draws the whole picture to the screen, with the lowered parts at their own resolution. */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    input: LayerInput,
  ): void {
    this.frame++;
    const active = ORDER.filter((name) => input.scales[name] < 1);
    const materials = this.prepare(scene, input, active);

    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(2, this.size.x);
    const h = Math.max(2, this.size.y);
    this.fit(this.main, w, h);
    for (const name of active) {
      this.fit(
        this.targets[name],
        Math.max(2, Math.floor(w * input.scales[name])),
        Math.max(2, Math.floor(h * input.scales[name])),
      );
    }

    // The world, without the characters' colour or depth (they still cast their shadows).
    const previousTarget = renderer.getRenderTarget();
    const depthWas = new Map<THREE.Material, boolean>();
    for (const m of materials) {
      depthWas.set(m, m.depthWrite);
      m.colorWrite = false;
      m.depthWrite = false;
    }
    renderer.setRenderTarget(this.main);
    renderer.render(scene, camera);
    for (const [m, depth] of depthWas) {
      m.colorWrite = true;
      m.depthWrite = depth;
    }

    // Each lowered part alone, with the world's lights and its shadow map.
    const background = scene.background;
    const shadowAuto = renderer.shadowMap.autoUpdate;
    const mask = camera.layers.mask;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    const water = input.water instanceof THREE.Mesh ? input.water.material : null;
    const waterMaterial = Array.isArray(water) ? null : (water as THREE.Material | null);
    for (const name of active) {
      camera.layers.set(BIT[name]);
      // The sea does not write depth on screen; here it does, so the world can hide it.
      if (name === 'water' && waterMaterial) waterMaterial.depthWrite = true;
      renderer.setRenderTarget(this.targets[name]);
      renderer.render(scene, camera);
      if (name === 'water' && waterMaterial) waterMaterial.depthWrite = false;
    }
    camera.layers.mask = mask;
    scene.background = background;
    renderer.shadowMap.autoUpdate = shadowAuto;
    renderer.setClearColor(this.clearColor, alpha);

    // Put it together on the screen (tone mapping and colour encoding happen here).
    const on = (this.quad.material as THREE.ShaderMaterial).uniforms.uOn!.value as THREE.Vector3;
    on.set(
      active.includes('enemies') ? 1 : 0,
      active.includes('allies') ? 1 : 0,
      active.includes('water') ? 1 : 0,
    );
    renderer.setRenderTarget(previousTarget);
    renderer.render(this.quadScene, this.quadCamera);
  }

  /** Moves the parts onto their layers and gathers what the passes need. Returns the materials of the characters. */
  private prepare(scene: THREE.Scene, input: LayerInput, active: LayerName[]): Set<THREE.Material> {
    const materials = new Set<THREE.Material>();
    this.characterRoots.clear();
    for (const name of ['enemies', 'allies'] as const) {
      const bit = BIT[name];
      const lowered = active.includes(name);
      for (const root of input[name]) {
        this.characterRoots.add(root);
        if (!lowered) continue;
        root.traverse((o) => {
          o.layers.enable(bit);
          const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
          if (!m) return;
          if (Array.isArray(m)) for (const one of m) materials.add(one);
          else materials.add(m);
        });
      }
    }
    // The water is on its own layer while lowered and back on the main one otherwise.
    input.water?.traverse((o) => {
      if (o instanceof THREE.Light) return;
      if (active.includes('water')) o.layers.set(BIT.water);
      else o.layers.set(0);
    });
    if (this.frame % LIGHT_SCAN === 1) this.scanLights(scene);
    for (const light of this.lights) for (const name of active) light.layers.enable(BIT[name]);
    return materials;
  }

  private scanLights(scene: THREE.Scene): void {
    this.lights.length = 0;
    const visit = (o: THREE.Object3D): void => {
      if (this.characterRoots.has(o)) return;
      if (o instanceof THREE.Light) this.lights.push(o);
      for (const child of o.children) visit(child);
    };
    visit(scene);
  }

  private fit(target: THREE.WebGLRenderTarget, w: number, h: number): void {
    if (target.width === w && target.height === h) return;
    target.setSize(w, h);
  }

  dispose(): void {
    this.main.dispose();
    for (const name of ORDER) this.targets[name].dispose();
    this.quad.geometry.dispose();
    (this.quad.material as THREE.Material).dispose();
  }
}
