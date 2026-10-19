import * as THREE from 'three';
import { WEAPON_POSES, createWeaponModel } from './weaponModels';

/** The field of view of the weapon's own camera: fixed, so zooming the world never resizes the gun. */
const VIEW_FOV = 62;
/** Rates (1/s) of raising the sights and of recoil fading. */
const AIM_RATE = 14;
const KICK_RATE = 11;
/** How far a full kick pushes the gun back and tilts it up. */
const KICK_BACK = 0.07;
const KICK_PITCH = 0.12;
/** The gun dips and tilts while reloading. */
const RELOAD_DIP = 0.16;
/** Walking sway: amplitude (metres) and phase speed (rad per metre walked at full speed). */
const BOB_AMOUNT = 0.012;
const BOB_SPEED = 9;

const GLOVE = new THREE.MeshStandardMaterial({ color: 0x2f3328, roughness: 0.9 });
const SLEEVE = new THREE.MeshStandardMaterial({ color: 0x4a5340, roughness: 0.95 });

/** A box stretched between two points (view space). */
function limb(from: THREE.Vector3, to: THREE.Vector3, width: number, material: THREE.Material) {
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, width, length), material);
  mesh.position.copy(from).lerp(to, 0.5);
  mesh.lookAt(to);
  return mesh;
}

/**
 * The weapon you see in first person, drawn in its own pass on top of the world (so it never
 * clips into walls): held at the hip, raised to the sights when aiming, kicking back when it
 * fires, dipping when it reloads and swaying as you walk. Hands and sleeves are plain boxes.
 * The positions of each weapon are in `WEAPON_POSES`.
 */
export class ViewModel {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(VIEW_FOV, 1, 0.02, 4);
  private readonly rig = new THREE.Group();
  private item: string | null = null;
  private aim = 0;
  private kickAmount = 0;
  private reload = 0;
  private bob = 0;
  private active = false;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x555a60, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-0.5, 1, 0.6);
    this.scene.add(sun, this.rig);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** A shot was fired: kick the gun back (1 is a normal rifle shot). */
  kick(amount = 1): void {
    this.kickAmount = Math.min(this.kickAmount + amount, 1.6);
  }

  private build(item: string | null): void {
    this.item = item;
    this.rig.clear();
    const pose = item === null ? undefined : WEAPON_POSES[item];
    const weapon = item === null ? null : createWeaponModel(item);
    if (!pose || !weapon) return;
    // Models point their barrel along +Z; the view looks down -Z.
    const flip = new THREE.Group();
    flip.rotation.y = Math.PI;
    flip.add(weapon);
    this.rig.add(flip);
    // Hands in view space: weapon-local (x, y, z) becomes (-x, y, -z).
    const grip = new THREE.Vector3(0, -0.04, 0);
    this.rig.add(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.1), GLOVE));
    this.rig.children[1]!.position.copy(grip);
    this.rig.add(limb(grip, new THREE.Vector3(0.2, -0.38, 0.4), 0.085, SLEEVE));
    if (pose.foregrip) {
      const [x, y, z] = pose.foregrip;
      const fore = new THREE.Vector3(-x, y - 0.015, -z);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.11), GLOVE);
      hand.position.copy(fore);
      this.rig.add(hand, limb(fore, new THREE.Vector3(-0.26, -0.42, 0.3), 0.085, SLEEVE));
    }
  }

  /**
   * Moves the gun for this frame. `speed` is the walking speed from 0 to 1, `show` hides it in
   * the other views or while the soldier is down or driving.
   */
  update(
    dt: number,
    show: boolean,
    item: string | null,
    aiming: boolean,
    reloading: boolean,
    speed: number,
  ): void {
    this.active = show && item !== null && WEAPON_POSES[item] !== undefined;
    if (!this.active) {
      this.kickAmount = 0;
      return;
    }
    if (item !== this.item) this.build(item);
    const pose = WEAPON_POSES[item!]!;
    this.aim += ((aiming && !reloading ? 1 : 0) - this.aim) * Math.min(1, AIM_RATE * dt);
    this.reload += ((reloading ? 1 : 0) - this.reload) * Math.min(1, 8 * dt);
    this.kickAmount *= Math.exp(-KICK_RATE * dt);
    this.bob += speed * BOB_SPEED * dt;
    const sway = speed * (1 - this.aim * 0.85);
    const [hx, hy, hz] = pose.hip;
    const [ax, ay, az] = pose.ads;
    this.rig.position.set(
      hx + (ax - hx) * this.aim + Math.sin(this.bob) * BOB_AMOUNT * sway,
      hy + (ay - hy) * this.aim + Math.abs(Math.cos(this.bob)) * BOB_AMOUNT * sway,
      hz + (az - hz) * this.aim + this.kickAmount * KICK_BACK,
    );
    this.rig.position.y -= RELOAD_DIP * this.reload;
    this.rig.rotation.set(this.kickAmount * KICK_PITCH - 0.5 * this.reload, 0, 0.35 * this.reload);
  }

  /** Draws the gun over what the main camera drew. */
  render(renderer: THREE.WebGLRenderer): void {
    if (!this.active) return;
    const clear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = clear;
  }
}
