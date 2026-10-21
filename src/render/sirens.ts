import * as THREE from 'three';

/**
 * Police light bars: a red and a blue half that flash in turn, each with a glow sprite and a real
 * point light that paints the walls around. The lights exist only while the map has a siren.
 */

const RED = 0xff1a1a;
const BLUE = 0x1a44ff;
const LIGHT_INTENSITY = 40;
const LIGHT_RANGE = 26;
const PERIOD = 1.0;

/** A soft round glow, shared by all the flares. */
function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

type Beacon = {
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  light: THREE.PointLight;
  /** Seconds into each period at which this colour starts its two flashes. */
  phase: number;
};

export class Sirens {
  private readonly group = new THREE.Group();
  private readonly glowMap = glowTexture();
  private beacons: Beacon[] = [];
  private clock = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  /** The sirens of the map: x, z and the height of the bar. */
  set(sirens: { x: number; y: number; z: number }[]): void {
    for (const b of this.beacons) {
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
      (b.glow.material as THREE.Material).dispose();
    }
    this.group.clear();
    this.beacons = [];
    for (const s of sirens) {
      for (const [side, color, phase] of [
        [-1, RED, 0],
        [1, BLUE, 0.5],
      ] as const) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.42, 0.14, 0.2),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0 }),
        );
        mesh.position.set(s.x + side * 0.22, s.y, s.z);
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.glowMap,
            color,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
          }),
        );
        glow.scale.setScalar(3);
        glow.position.copy(mesh.position);
        glow.position.y += 0.1;
        const light = new THREE.PointLight(color, 0, LIGHT_RANGE, 2);
        light.position.copy(mesh.position);
        light.position.y += 0.4;
        this.group.add(mesh, glow, light);
        this.beacons.push({ mesh, glow, light, phase });
      }
    }
  }

  update(dt: number): void {
    if (this.beacons.length === 0) return;
    this.clock += dt;
    const t = this.clock % PERIOD;
    for (const b of this.beacons) {
      // Two quick flashes per colour, then the other colour.
      const local = (t - b.phase + PERIOD) % PERIOD;
      const on = local < 0.1 || (local > 0.2 && local < 0.3) ? 1 : 0;
      (b.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = on * 3 + 0.15;
      b.light.intensity = on * LIGHT_INTENSITY;
      (b.glow.material as THREE.SpriteMaterial).opacity = on;
    }
  }
}
