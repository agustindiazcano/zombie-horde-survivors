import * as THREE from 'three';

const BAR_HEIGHT = 0.13;

interface Bar {
  group: THREE.Group;
  back: THREE.Mesh;
  fill: THREE.Mesh;
}

const plane = new THREE.PlaneGeometry(1, 1);
const mat = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
const materials = {
  back: mat(0x000000, 0.65),
  high: mat(0x4caf50),
  mid: mat(0xe0b030),
  low: mat(0xe0533d),
  enemy: mat(0xd62020),
};

/** Camera-facing health bars drawn over enemies (always visible, even behind others). */
export class HealthBars {
  readonly group = new THREE.Group();
  private readonly active = new Map<number, Bar>();
  private readonly free: Bar[] = [];

  private create(): Bar {
    const group = new THREE.Group();
    const back = new THREE.Mesh(plane, materials.back);
    const fill = new THREE.Mesh(plane, materials.high);
    back.renderOrder = 10;
    fill.renderOrder = 11;
    group.add(back, fill);
    this.group.add(group);
    return { group, back, fill };
  }

  /** Places (creating if needed) the bar for `id`; `ratio` is health / max health. */
  show(
    id: number,
    x: number,
    y: number,
    z: number,
    width: number,
    ratio: number,
    camera: THREE.Camera,
    red = false,
  ): void {
    let bar = this.active.get(id);
    if (!bar) {
      bar = this.free.pop() ?? this.create();
      this.active.set(id, bar);
    }
    const r = Math.min(Math.max(ratio, 0), 1);
    bar.group.visible = true;
    bar.group.position.set(x, y, z);
    bar.group.quaternion.copy(camera.quaternion);
    bar.back.scale.set(width, BAR_HEIGHT, 1);
    bar.fill.scale.set(Math.max(width * r, 0.001), BAR_HEIGHT * 0.7, 1);
    bar.fill.position.set(-width / 2 + (width * r) / 2, 0, 0.001);
    bar.fill.material = red
      ? materials.enemy
      : r > 0.6
        ? materials.high
        : r > 0.3
          ? materials.mid
          : materials.low;
  }

  hide(id: number): void {
    const bar = this.active.get(id);
    if (bar) bar.group.visible = false;
  }

  release(id: number): void {
    const bar = this.active.get(id);
    if (!bar) return;
    bar.group.visible = false;
    this.active.delete(id);
    this.free.push(bar);
  }
}
