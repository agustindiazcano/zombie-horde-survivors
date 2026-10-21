import * as THREE from 'three';
import type { GlassKind, Obstacle } from '../sim';

/** Panes of glass in a metal frame, in several tints. Shared materials, transparent, no files. */

const frameMaterial = new THREE.MeshStandardMaterial({
  color: 0x2b2f36,
  metalness: 0.7,
  roughness: 0.4,
});
const FRAME = 0.1;
const PANE_THICKNESS = 0.05;

/** A frosted look: an uneven alpha so the pane is milky and a little blotchy. */
function frostedAlpha(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 150 + Math.random() * 70;
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  return tex;
}

/** White cracks radiating from an impact, on a transparent background. */
function crackedMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = 'rgba(235,245,255,0.9)';
  ctx.lineCap = 'round';
  const cx = 300;
  const cy = 170;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 16; i++) {
    let a = (i / 16) * Math.PI * 2 + rnd() * 0.3;
    let x = cx;
    let y = cy;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 9; s++) {
      a += (rnd() - 0.5) * 0.7;
      x += Math.cos(a) * (28 + rnd() * 30);
      y += Math.sin(a) * (28 + rnd() * 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Rings round the impact.
  ctx.lineWidth = 1.2;
  for (const r of [26, 58, 96]) {
    ctx.beginPath();
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rr = r * (0.85 + rnd() * 0.3);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const tint = (color: number, opacity: number, roughness = 0.05): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color,
    opacity,
    roughness,
    metalness: 0.15,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

const paneMaterials = new Map<GlassKind, THREE.Material>();

function paneMaterial(kind: GlassKind): THREE.Material {
  const cached = paneMaterials.get(kind);
  if (cached) return cached;
  let material: THREE.MeshStandardMaterial;
  switch (kind) {
    case 'clear':
      material = tint(0xd6ecff, 0.2);
      break;
    case 'blue':
      material = tint(0x3a86e0, 0.4);
      break;
    case 'green':
      material = tint(0x3bb36e, 0.4);
      break;
    case 'smoke':
      material = tint(0x14161b, 0.65);
      break;
    case 'frosted':
      material = tint(0xf2f6fa, 0.8, 0.9);
      material.alphaMap = frostedAlpha();
      break;
    case 'cracked':
      material = tint(0xd6ecff, 0.22);
      material.map = crackedMap();
      break;
  }
  paneMaterials.set(kind, material);
  return material;
}

/** A pane in a frame, standing on the ground; it runs along the longer side of the collider. */
export function buildGlass(kind: GlassKind, o: Obstacle): THREE.Group {
  const group = new THREE.Group();
  const alongX = o.halfW >= o.halfD;
  const length = Math.max(o.halfW, o.halfD) * 2;
  const height = o.height ?? 2.6;
  const pane = new THREE.Mesh(
    new THREE.BoxGeometry(length - FRAME, height - FRAME, PANE_THICKNESS),
    paneMaterial(kind),
  );
  pane.position.y = height / 2;
  pane.renderOrder = 2;
  group.add(pane);
  // Width, height, x and y of each bar of the frame (the last one is the mullion in the middle).
  const bars: [number, number, number, number][] = [
    [length, FRAME, 0, FRAME / 2],
    [length, FRAME, 0, height - FRAME / 2],
    [FRAME, height, -length / 2 + FRAME / 2, height / 2],
    [FRAME, height, length / 2 - FRAME / 2, height / 2],
    [FRAME * 0.6, height, 0, height / 2],
  ];
  for (const [w, h, x, y] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, PANE_THICKNESS * 2), frameMaterial);
    bar.position.set(x, y, 0);
    bar.castShadow = true;
    group.add(bar);
  }
  // The model lies along x; a pane whose collider is longer in z turns a quarter.
  if (!alongX) group.rotation.y = Math.PI / 2;
  group.position.set(o.x, 0, o.z);
  return group;
}
