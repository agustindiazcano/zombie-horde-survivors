import * as THREE from 'three';

const MAX_PARTICLES = 800;
const MAX_SPLATS = 24;
const GRAVITY = 22;
const SETTLE_LIFE = 8;
const SETTLE_FADE = 2;
const SPLAT_LIFE = 14;
const SPLAT_FADE = 5;

const DROPLETS = 30;
const CHUNKS = 9;
const SPURT_DROPLETS = 8;
const HEAD_DROPLETS = 22;
const HEAD_CHUNKS = 5;

type Mode = 0 | 1 | 2; // inactive, flying, settled on the ground

/** Blood and gibs thrown by exploding enemies, plus fading puddles on the ground. */
export class Gore {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(MAX_PARTICLES * 3);
  private readonly vel = new Float32Array(MAX_PARTICLES * 3);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly mode = new Uint8Array(MAX_PARTICLES) as unknown as Mode[];
  private next = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  private readonly splats: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; life: number }[] =
    [];
  private nextSplat = 0;

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      MAX_PARTICLES,
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setHex(0x8a0a0a));
    }
    this.group.add(this.mesh);

    const disc = new THREE.CircleGeometry(1, 20);
    for (let i = 0; i < MAX_SPLATS; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x5a0808,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(disc, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.visible = false;
      this.group.add(mesh);
      this.splats.push({ mesh, material, life: 0 });
    }
  }

  /** An enemy bursts at (x, z): droplets, chunks and a puddle. `scale` grows with enemy size. */
  burst(x: number, z: number, scale = 1): void {
    for (let i = 0; i < DROPLETS + CHUNKS; i++) {
      const chunk = i >= DROPLETS;
      const k = this.next;
      this.next = (this.next + 1) % MAX_PARTICLES;

      const angle = Math.random() * Math.PI * 2;
      const speed = (chunk ? 2 + Math.random() * 3 : 2.5 + Math.random() * 6) * scale;
      this.pos.set([x, 0.9, z], k * 3);
      this.vel.set(
        [Math.cos(angle) * speed, (chunk ? 3 : 3.5) + Math.random() * 6, Math.sin(angle) * speed],
        k * 3,
      );
      this.size[k] = (chunk ? 0.2 + Math.random() * 0.12 : 0.06 + Math.random() * 0.08) * scale;
      this.mode[k] = 1;
      this.life[k] = 0;
      this.color.setHex(chunk ? 0x4a0707 : 0xb01010).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
      this.mesh.setColorAt(k, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    const splat = this.splats[this.nextSplat]!;
    this.nextSplat = (this.nextSplat + 1) % MAX_SPLATS;
    splat.mesh.position.set(x, 0.02, z);
    splat.mesh.scale.setScalar((0.7 + Math.random() * 0.5) * scale);
    splat.mesh.visible = true;
    splat.life = SPLAT_LIFE;
    splat.material.opacity = 0.85;
  }

  /** A head bursts at (x, y, z): a spray of droplets and a few chunks, no puddle. */
  headBurst(x: number, y: number, z: number, scale = 1): void {
    for (let i = 0; i < HEAD_DROPLETS + HEAD_CHUNKS; i++) {
      const chunk = i >= HEAD_DROPLETS;
      const k = this.next;
      this.next = (this.next + 1) % MAX_PARTICLES;
      const angle = Math.random() * Math.PI * 2;
      const speed = (chunk ? 1.5 + Math.random() * 2.5 : 2 + Math.random() * 5) * scale;
      this.pos.set([x, y, z], k * 3);
      this.vel.set(
        [Math.cos(angle) * speed, 2 + Math.random() * 5, Math.sin(angle) * speed],
        k * 3,
      );
      this.size[k] = (chunk ? 0.14 + Math.random() * 0.1 : 0.05 + Math.random() * 0.07) * scale;
      this.mode[k] = 1;
      this.life[k] = 0;
      this.color.setHex(chunk ? 0x5a0a0a : 0xb01010).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
      this.mesh.setColorAt(k, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** A short jet of blood from a wound at (x, y, z), leaning along `facing`; `scale` is the enemy's size. */
  spurt(x: number, y: number, z: number, facing: number, scale = 1): void {
    for (let i = 0; i < SPURT_DROPLETS; i++) {
      const k = this.next;
      this.next = (this.next + 1) % MAX_PARTICLES;
      const angle = facing + (Math.random() - 0.5) * 1.6;
      const speed = (1.5 + Math.random() * 2.5) * scale;
      this.pos.set([x, y, z], k * 3);
      this.vel.set(
        [Math.sin(angle) * speed, 1.5 + Math.random() * 2.5, Math.cos(angle) * speed],
        k * 3,
      );
      this.size[k] = (0.05 + Math.random() * 0.05) * scale;
      this.mode[k] = 1;
      this.life[k] = 0;
      this.color.setHex(0xb01010).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
      this.mesh.setColorAt(k, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    const d = this.dummy;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mode = this.mode[i];
      if (mode === 0) continue;
      const p = i * 3;

      if (mode === 1) {
        this.vel[p + 1]! -= GRAVITY * dt;
        this.pos[p]! += this.vel[p]! * dt;
        this.pos[p + 1]! += this.vel[p + 1]! * dt;
        this.pos[p + 2]! += this.vel[p + 2]! * dt;
        if (this.pos[p + 1]! <= 0.04) {
          this.pos[p + 1] = 0.03;
          this.mode[i] = 2;
          this.life[i] = SETTLE_LIFE;
        }
        d.position.set(this.pos[p]!, this.pos[p + 1]!, this.pos[p + 2]!);
        d.scale.setScalar(this.size[i]!);
      } else {
        this.life[i]! -= dt;
        if (this.life[i]! <= 0) {
          this.mode[i] = 0;
          d.scale.setScalar(0);
        } else {
          // Splatter lies flat and shrinks away at the end of its life.
          const fade = Math.min(this.life[i]! / SETTLE_FADE, 1);
          const s = this.size[i]! * fade;
          d.position.set(this.pos[p]!, 0.03, this.pos[p + 2]!);
          d.scale.set(s * 1.8, s * 0.2, s * 1.8);
        }
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (const s of this.splats) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) s.mesh.visible = false;
      else s.material.opacity = 0.85 * Math.min(s.life / SPLAT_FADE, 1);
    }
  }
}
