import * as THREE from 'three';

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uResolution;
uniform float uTime;
uniform float uRain;   // 0 to 1
uniform float uDetail; // 1 beads only, 2 beads and running drops
varying vec2 vUv;

float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

// Beads: a drop sits in a cell, swells, holds, then dries up. Returns the lens normal (xy) and the mask (z).
vec3 beads(vec2 uv, float scale, float seed, float t) {
  vec2 g = uv * scale;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float n = h21(id + seed);
  float n2 = h21(id * 1.7 + seed + 4.2);
  float n3 = h21(id * 2.9 + seed + 9.1);
  if (n > 0.12 + 0.55 * uRain) return vec3(0.0);
  float age = fract(t * (0.04 + 0.05 * n3) + n2 * 7.0);
  float life = smoothstep(0.0, 0.12, age) * smoothstep(1.0, 0.7, age);
  vec2 centre = 0.25 + 0.5 * vec2(n2, n3);
  float r = (0.16 + 0.22 * n) * life;
  vec2 d = (f - centre);
  d.y *= 1.0 + 0.25 * n3; // drops hang a little tall
  float dist = length(d);
  float mask = smoothstep(r, r * 0.55, dist);
  return vec3(d / max(r, 0.001) * mask, mask);
}

// Running drops: one per column, sliding down in jerks with a thin wet trail above it.
vec3 runners(vec2 uv, float cols, float seed, float t, float aspect) {
  float colId = floor(uv.x * cols);
  float n = h11(colId + seed);
  if (n > 0.15 + 0.7 * uRain) return vec3(0.0);
  float speed = 0.06 + 0.1 * h11(colId * 3.1 + seed);
  float y = 1.0 - fract(t * speed + n * 13.0);
  float px = (colId + 0.5 + (h11(colId * 7.7 + seed) - 0.5) * 0.5) / cols + sin(t * (1.5 + 2.0 * n) + n * 20.0) * 0.0015;
  // Distance in units of one fourteenth of the screen height, so the drop is round on any screen.
  vec2 d = vec2((uv.x - px) * aspect * 14.0, (uv.y - y) * 14.0);
  float head = smoothstep(0.55, 0.2, length(d * vec2(1.0, 0.6)));
  float above = uv.y - y;
  float trailLen = 0.18 + 0.2 * n;
  float trail = step(0.0, above) * smoothstep(trailLen, 0.0, above) * smoothstep(0.12, 0.0, abs(d.x)) * 0.35;
  return vec3(d * head * 1.6, max(head, trail));
}

void main() {
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 uv = vUv * asp;
  vec3 a = beads(uv, 7.0, 0.0, uTime);
  vec3 b = beads(uv, 13.0, 31.0, uTime * 1.3);
  vec3 c = beads(uv + 0.37, 24.0, 77.0, uTime * 1.7);
  vec3 drop = a;
  if (b.z > drop.z) drop = b;
  if (c.z > drop.z) drop = c;
  if (uDetail > 1.5) {
    vec3 r = runners(vUv, 16.0, 5.0, uTime, asp.x);
    if (r.z > drop.z) drop = r;
  }
  if (drop.z < 0.01) discard;
  // The drop is a little lens: the picture inside is turned over and shifted by the normal.
  vec2 offset = -drop.xy * 0.07 * vec2(1.0 / asp.x, 1.0);
  vec3 col = texture2D(tScene, clamp(vUv + offset, 0.001, 0.999)).rgb;
  float rim = smoothstep(0.55, 1.0, length(drop.xy));
  col *= 1.0 - 0.4 * rim;
  col += vec3(1.0) * smoothstep(0.55, 0.95, dot(normalize(drop.xy + 0.0001), vec2(-0.55, 0.83)) * length(drop.xy)) * 0.3;
  gl_FragColor = vec4(col, clamp(drop.z * 1.4, 0.0, 1.0));
}
`;

/**
 * Rain on the camera lens (a graphics option): small drops that swell, hold and dry up, and, at the
 * higher detail, drops that run down leaving a trail. Each drop is a lens: it shows the picture
 * turned over and shifted. Needs a copy of the finished frame (`copyFramebufferToTexture`), drawn
 * as a full-screen overlay after the scene. Costs one framebuffer copy and a light fragment pass
 * (about a dozen noise lookups per pixel); nothing is drawn while it is not raining.
 */
export class LensDrops {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private frame: THREE.FramebufferTexture | null = null;
  private readonly size = new THREE.Vector2();
  private detail = 2;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uRain: { value: 0 },
        uDetail: { value: 2 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: FRAGMENT,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** 1 beads only, 2 beads and running drops. */
  setDetail(detail: number): void {
    this.detail = detail;
    this.material.uniforms.uDetail!.value = detail;
  }

  /** Draws the drops over the frame the renderer just finished. `rain` is 0 to 1; time in seconds. */
  render(renderer: THREE.WebGLRenderer, rain: number, time: number): void {
    if (rain < 0.03) return;
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const h = Math.max(1, Math.floor(this.size.y));
    if (!this.frame || this.frame.image.width !== w || this.frame.image.height !== h) {
      this.frame?.dispose();
      this.frame = new THREE.FramebufferTexture(w, h);
      this.material.uniforms.tScene!.value = this.frame;
    }
    renderer.copyFramebufferToTexture(this.frame);
    const u = this.material.uniforms;
    u.uResolution!.value.set(w, h);
    u.uTime!.value = time;
    u.uRain!.value = rain;
    u.uDetail!.value = this.detail;
    const before = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = before;
  }

  dispose(): void {
    this.frame?.dispose();
    this.material.dispose();
    (this.scene.children[0] as THREE.Mesh).geometry.dispose();
  }
}
