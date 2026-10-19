import * as THREE from 'three';
import { localPlayer, type GameState, type Vec2 } from '../sim';

const RING_Y = 0.04;
const PULSE_LIFE = 0.6;
const PULSE_POOL = 8;

const SELECTED_COLOR = 0x5cff7a;
const CONTROLLED_COLOR = 0xffd24a;
const ORDER_COLOR = 0x6ad0ff;

interface Pulse {
  mesh: THREE.Mesh;
  life: number;
}

const flatRing = (inner: number, outer: number, color: number, opacity = 0.9) => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 32),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = RING_Y;
  mesh.visible = false;
  return mesh;
};

/** RTS overlays on the ground: selection rings, destination markers and click pulses. */
export class SelectionMarkers {
  readonly group = new THREE.Group();
  private readonly rings = new Map<number, THREE.Mesh>();
  private readonly destinations = new Map<number, THREE.Mesh>();
  private readonly pulses: Pulse[] = [];
  private nextPulse = 0;

  constructor() {
    for (let i = 0; i < PULSE_POOL; i++) {
      const mesh = flatRing(0.2, 0.3, ORDER_COLOR);
      this.group.add(mesh);
      this.pulses.push({ mesh, life: 0 });
    }
  }

  /** Expanding ring where the player just clicked an order. */
  pulse(at: Vec2): void {
    const p = this.pulses[this.nextPulse]!;
    this.nextPulse = (this.nextPulse + 1) % PULSE_POOL;
    p.mesh.position.set(at.x, RING_Y, at.z);
    p.mesh.visible = true;
    p.life = PULSE_LIFE;
  }

  update(state: GameState, selected: ReadonlySet<number>, alpha: number, dt: number): void {
    for (const s of state.soldiers) {
      let ring = this.rings.get(s.id);
      if (!ring) {
        ring = flatRing(0.6, 0.75, SELECTED_COLOR);
        this.rings.set(s.id, ring);
        this.group.add(ring);
      }
      const controlled = s.id === localPlayer(state).controlledId;
      const show = !s.dead && (controlled || selected.has(s.id));
      ring.visible = show;
      if (show) {
        ring.position.set(
          s.prev.x + (s.pos.x - s.prev.x) * alpha,
          RING_Y,
          s.prev.z + (s.pos.z - s.prev.z) * alpha,
        );
        (ring.material as THREE.MeshBasicMaterial).color.setHex(
          controlled ? CONTROLLED_COLOR : SELECTED_COLOR,
        );
      }

      // Show where selected soldiers are heading.
      let dest = this.destinations.get(s.id);
      if (!dest) {
        dest = flatRing(0.12, 0.22, ORDER_COLOR, 0.8);
        this.destinations.set(s.id, dest);
        this.group.add(dest);
      }
      const showDest = !s.dead && selected.has(s.id) && s.order.type === 'move';
      dest.visible = showDest;
      if (showDest && s.order.type === 'move') dest.position.set(s.order.x, RING_Y, s.order.z);
    }

    for (const p of this.pulses) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const k = 1 - p.life / PULSE_LIFE;
      p.mesh.scale.setScalar(1 + k * 2.5);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    }
  }
}
