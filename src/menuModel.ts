import * as THREE from 'three';
import type { CharacterFactory } from './render/characters';

/** Seconds per full turn of the model, and how high and fast it bobs. */
const TURN_SPEED = 0.55;
const BOB_HEIGHT = 0.07;
const BOB_SPEED = 1.6;

/**
 * A small 3D viewer for the main menu: one character floating and turning slowly on its own
 * transparent canvas, playing its idle animation. It owns a separate WebGL renderer, which is
 * released by `stop()` when the game starts.
 */
export class MenuModel {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private readonly pivot = new THREE.Group();
  private readonly view: ReturnType<CharacterFactory>;
  private readonly observer: ResizeObserver;
  private frame = 0;
  private last = performance.now();
  private time = 0;
  private running = true;

  constructor(
    private readonly container: HTMLElement,
    factory: CharacterFactory,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'menu__canvas';
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x30343a, 1.4));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight(0xff3a2a, 1.6);
    rim.position.set(-4, 3, -3);
    this.scene.add(key, rim);

    // A faint red disc under the feet, so the model reads as hovering above something.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 40),
      new THREE.MeshBasicMaterial({ color: 0xff3322, transparent: true, opacity: 0.22 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.12;
    this.scene.add(disc);

    this.view = factory();
    this.view.setState('idle');
    this.pivot.add(this.view.object);
    this.scene.add(this.pivot);

    this.camera.position.set(0, 1.25, 6.2);
    this.camera.lookAt(0, 0.95, 0);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Stops drawing and frees the WebGL context. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.time += dt;
    this.view.update(dt);
    this.pivot.rotation.y += TURN_SPEED * dt;
    this.pivot.position.y = Math.sin(this.time * BOB_SPEED) * BOB_HEIGHT + BOB_HEIGHT;
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
}
