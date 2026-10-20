import * as THREE from 'three';
import type { GameState } from '../sim';

/** Size (m) of a light's glow: far away it is a point, over the houses a big soft ball. */
const GLOW_SIZE = 3;
const TWINKLE = 0.25;

/** The blue lights of the sky show, drawn as soft additive glows. */
export class SkyLightViews {
  readonly group = new THREE.Group();
  private readonly sprites = new Map<number, THREE.Sprite>();
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

  /** Drops the sprites for a new run. */
  clear(): void {
    for (const sprite of this.sprites.values()) {
      this.group.remove(sprite);
      sprite.material.dispose();
    }
    this.sprites.clear();
  }
}
