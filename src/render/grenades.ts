import * as THREE from 'three';
import type { GameConfig, GameState, Vec2 } from '../sim';

const BLAST_LIFE = 0.45;
const BLAST_POOL = 6;
const ARC_POINTS = 28;
const RING_Y = 0.06;
const BALL_RADIUS = 0.13;

const AIM_COLOR = 0xff8a3a;
const CLAMPED_COLOR = 0xffd24a;

/** Where a throw would go, drawn in RTS mode while aiming. */
export interface GrenadePreview {
  from: Vec2;
  landing: Vec2;
  radius: number;
  /** The cursor is past the throw range, so the landing point was pulled in. */
  clamped: boolean;
  /** Height of the hand at release. */
  height: number;
  /** The world gravity now (m/s²). */
  gravity: number;
}

interface Blast {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  radius: number;
  life: number;
}

/** Grenades in flight, their blasts, and the arc and landing zone shown while aiming. */
export class GrenadeEffects {
  readonly group = new THREE.Group();
  private readonly balls = new Map<number, THREE.Mesh>();
  private readonly ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 10, 8);
  private readonly ballMaterial = new THREE.MeshLambertMaterial({ color: 0x3f5a2e });
  private readonly blasts: Blast[] = [];
  private nextBlast = 0;
  private readonly flashLight = new THREE.PointLight(0xffa040, 0, 14);
  private flashLife = 0;

  private readonly previewGroup = new THREE.Group();
  private readonly zone: THREE.Mesh;
  private readonly zoneMaterial: THREE.MeshBasicMaterial;
  private readonly arc: THREE.Line;
  private readonly arcMaterial: THREE.LineBasicMaterial;
  private readonly arcPositions = new Float32Array(ARC_POINTS * 3);

  constructor(
    private readonly groundAt: (x: number, z: number) => number,
    private readonly getConfig: () => GameConfig,
  ) {
    for (let i = 0; i < BLAST_POOL; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffb347,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
      mesh.visible = false;
      this.group.add(mesh);
      this.blasts.push({ mesh, material, radius: 1, life: 0 });
    }
    this.group.add(this.flashLight);

    this.zoneMaterial = new THREE.MeshBasicMaterial({
      color: AIM_COLOR,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.zone = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.zoneMaterial);
    this.zone.rotation.x = -Math.PI / 2;
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(0.94, 1, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.zone.add(edge);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.arcPositions, 3));
    this.arcMaterial = new THREE.LineBasicMaterial({ color: AIM_COLOR });
    this.arc = new THREE.Line(geometry, this.arcMaterial);
    this.arc.frustumCulled = false;
    this.previewGroup.add(this.zone, this.arc);
    this.previewGroup.visible = false;
    this.group.add(this.previewGroup);
  }

  /** A fireball that swells and fades where a grenade went off. */
  explode(at: Vec2, radius: number): void {
    const blast = this.blasts[this.nextBlast]!;
    this.nextBlast = (this.nextBlast + 1) % BLAST_POOL;
    const y = this.groundAt(at.x, at.z);
    blast.mesh.position.set(at.x, y + 0.4, at.z);
    blast.radius = radius;
    blast.life = BLAST_LIFE;
    blast.mesh.visible = true;
    this.flashLight.position.set(at.x, y + 2, at.z);
    this.flashLight.intensity = 90;
    this.flashLife = BLAST_LIFE;
  }

  /** Shows the aiming arc and landing zone, or hides them with null. */
  setPreview(p: GrenadePreview | null): void {
    this.previewGroup.visible = p !== null;
    if (!p) return;
    const g = this.getConfig().grenades;
    const color = p.clamped ? CLAMPED_COLOR : AIM_COLOR;
    this.zoneMaterial.color.setHex(color);
    this.arcMaterial.color.setHex(color);
    const ground = this.groundAt(p.landing.x, p.landing.z);
    this.zone.position.set(p.landing.x, ground + RING_Y, p.landing.z);
    this.zone.scale.set(p.radius, p.radius, 1);

    const startY = this.groundAt(p.from.x, p.from.z) + p.height;
    const d = Math.hypot(p.landing.x - p.from.x, p.landing.z - p.from.z);
    const flight = Math.max(0.25, d / g.throwSpeed);
    const vy = (ground - startY + 0.5 * p.gravity * flight * flight) / flight;
    for (let i = 0; i < ARC_POINTS; i++) {
      const t = i / (ARC_POINTS - 1);
      const s = t * flight;
      this.arcPositions[i * 3] = p.from.x + (p.landing.x - p.from.x) * t;
      this.arcPositions[i * 3 + 1] = Math.max(ground, startY + vy * s - 0.5 * p.gravity * s * s);
      this.arcPositions[i * 3 + 2] = p.from.z + (p.landing.z - p.from.z) * t;
    }
    this.arc.geometry.attributes.position!.needsUpdate = true;
  }

  /** Moves the balls in the air and ages the blasts. */
  update(state: GameState, dt: number): void {
    const seen = new Set<number>();
    for (const g of state.grenades) {
      seen.add(g.id);
      let ball = this.balls.get(g.id);
      if (!ball) {
        ball = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
        this.balls.set(g.id, ball);
        this.group.add(ball);
      }
      ball.position.set(g.pos.x, this.groundAt(g.pos.x, g.pos.z) + g.y + BALL_RADIUS, g.pos.z);
    }
    for (const [id, ball] of this.balls) {
      if (seen.has(id)) continue;
      this.group.remove(ball);
      this.balls.delete(id);
    }

    for (const b of this.blasts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      const t = 1 - b.life / BLAST_LIFE;
      b.mesh.scale.setScalar(b.radius * (0.25 + 0.75 * Math.sqrt(t)));
      b.material.opacity = 0.85 * (1 - t);
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flashLight.intensity = this.flashLife > 0 ? 90 * (this.flashLife / BLAST_LIFE) : 0;
    }
  }
}
