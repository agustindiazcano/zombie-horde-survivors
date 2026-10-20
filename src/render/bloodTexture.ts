import * as THREE from 'three';

/** A small seeded generator, so a variant gets the same stains on every load. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paints stains, splatter and drips of dried and fresh blood over a canvas. `amount` is 0 to 1. */
function paintBlood(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number): void {
  const rand = seeded(Math.round(amount * 1000) + w);
  const blots = Math.round(10 + amount * 60);
  for (let i = 0; i < blots; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.015 + rand() * 0.05) * w;
    const fresh = rand() < 0.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, fresh ? 'rgba(150,12,12,0.85)' : 'rgba(70,10,8,0.8)');
    grad.addColorStop(0.7, fresh ? 'rgba(110,8,8,0.6)' : 'rgba(55,8,6,0.55)');
    grad.addColorStop(1, 'rgba(60,5,5,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Splatter: small drops around the blot.
    for (let d = 0; d < 6; d++) {
      const a = rand() * Math.PI * 2;
      const dist = r * (1.1 + rand() * 1.6);
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, r * (0.08 + rand() * 0.12), 0, 7);
      ctx.fill();
    }
    // A drip running down from some blots.
    if (rand() < 0.4) {
      const len = r * (2 + rand() * 4);
      ctx.fillStyle = fresh ? 'rgba(130,10,10,0.75)' : 'rgba(65,9,7,0.7)';
      ctx.fillRect(x - r * 0.12, y, r * 0.24, len);
      ctx.beginPath();
      ctx.arc(x, y + len, r * 0.18, 0, 7);
      ctx.fill();
    }
  }
}

/**
 * For every colour map in a loaded model, a copy with procedural blood painted over it
 * (the original image is drawn first, then the stains). No image asset is needed.
 */
export function stainTextures(
  scene: THREE.Object3D,
  amount: number,
): Map<THREE.Texture, THREE.Texture> {
  const made = new Map<THREE.Texture, THREE.Texture>();
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const list: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of list) {
      const map = m instanceof THREE.MeshStandardMaterial ? m.map : null;
      if (!map || made.has(map)) continue;
      const image = map.image as CanvasImageSource & { width: number; height: number };
      if (!image || !image.width) continue;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(image, 0, 0);
      paintBlood(ctx, canvas.width, canvas.height, amount);
      const painted = new THREE.CanvasTexture(canvas);
      painted.colorSpace = map.colorSpace;
      painted.flipY = map.flipY;
      painted.wrapS = map.wrapS;
      painted.wrapT = map.wrapT;
      painted.anisotropy = map.anisotropy;
      made.set(map, painted);
    }
  });
  return made;
}
