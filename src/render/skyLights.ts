import * as THREE from 'three';
import type { GameConfig, GameState } from '../sim';

/** Size (m) of a light's glow: far away it is a point, over the houses a big soft ball. */
const GLOW_SIZE = 3;
const TWINKLE = 0.25;

/** The blue lights of the sky show, drawn as soft additive glows. */
export class SkyLightViews {
  readonly group = new THREE.Group();
  private readonly sprites = new Map<number, THREE.Sprite>();
  private readonly phones = new Map<number, THREE.Sprite>();
  private readonly texture: THREE.CanvasTexture;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(235,245,255,1)');
    grad.addColorStop(0.18, 'rgba(120,180,255,0.95)');
    grad.addColorStop(0.5, 'rgba(60,120,255,0.3)');
    grad.addColorStop(1, 'rgba(40,90,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.texture = new THREE.CanvasTexture(canvas);
  }

  update(state: GameState, alpha: number, time: number): void {
    for (const light of state.skyLights) {
      let sprite = this.sprites.get(light.id);
      if (!sprite) {
        sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false,
          }),
        );
        sprite.frustumCulled = false;
        this.sprites.set(light.id, sprite);
        this.group.add(sprite);
      }
      sprite.position.set(
        light.prev.x + (light.pos.x - light.prev.x) * alpha,
        light.prev.y + (light.pos.y - light.prev.y) * alpha,
        light.prev.z + (light.pos.z - light.prev.z) * alpha,
      );
      const twinkle = 1 + Math.sin(time * 3 + light.id * 1.7) * TWINKLE;
      sprite.scale.setScalar(GLOW_SIZE * twinkle * (light.role === 'formation' ? 1.5 : 1));
    }
  }

  /** A cold white glow in the hand of every third neighbour once the phones come out. */
  updatePhones(state: GameState, config: GameConfig, alpha: number): void {
    const out = config.skyShowOn && state.time >= config.skyShow.phonesAt;
    const live = new Set<number>();
    if (out) {
      for (const a of state.animals) {
        if (a.id % 3 !== 0) continue;
        live.add(a.id);
        let glow = this.phones.get(a.id);
        if (!glow) {
          glow = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: this.texture,
              color: 0xe8f2ff,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              fog: false,
            }),
          );
          glow.scale.setScalar(0.7);
          this.phones.set(a.id, glow);
          this.group.add(glow);
        }
        // Held in front of the chest, a little forward of where they face.
        glow.position.set(
          a.prev.x + (a.pos.x - a.prev.x) * alpha + Math.sin(a.facing) * 0.35,
          1.25 + a.lift,
          a.prev.z + (a.pos.z - a.prev.z) * alpha + Math.cos(a.facing) * 0.35,
        );
      }
    }
    for (const [id, glow] of this.phones) {
      if (live.has(id)) continue;
      this.group.remove(glow);
      glow.material.dispose();
      this.phones.delete(id);
    }
  }

  /** Drops the sprites for a new run. */
  clear(): void {
    for (const sprite of this.sprites.values()) {
      this.group.remove(sprite);
      sprite.material.dispose();
    }
    this.sprites.clear();
    for (const glow of this.phones.values()) {
      this.group.remove(glow);
      glow.material.dispose();
    }
    this.phones.clear();
  }
}
