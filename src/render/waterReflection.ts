import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
/** How far the clip plane sits under the water, so the edge of the shore does not show a seam. */
const CLIP_BIAS = 0.003;

/**
 * A planar mirror of the world for the water: the scene is drawn a second time from a camera
 * reflected across the water level, into a render target the ocean shader reads. The reflected
 * camera uses an **oblique near plane** on the water level, so nothing below the water (the sea
 * floor, the sand under the waves) is drawn into the mirror. It costs a second render of the scene,
 * so it is a graphics option (High and Ultra) and `scale` sets its size against the screen.
 */
export class WaterReflection {
  readonly target: THREE.WebGLRenderTarget;
  /** World position to mirror texture coordinates (with the perspective divide still to do). */
  readonly matrix = new THREE.Matrix4();
  private readonly cam = new THREE.PerspectiveCamera();
  private readonly rotation = new THREE.Matrix4();
  private readonly plane = new THREE.Plane();
  private readonly clip = new THREE.Vector4();
  private readonly q = new THREE.Vector4();
  private readonly cameraPos = new THREE.Vector3();
  private readonly waterPos = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();

  constructor(private readonly scale: number) {
    this.target = new THREE.WebGLRenderTarget(2, 2, { generateMipmaps: false });
  }

  /** Follows the size of the screen's drawing buffer (pixels). */
  resize(width: number, height: number): void {
    this.target.setSize(
      Math.max(2, Math.floor(width * this.scale)),
      Math.max(2, Math.floor(height * this.scale)),
    );
  }

  /**
   * Draws the mirror for this frame, with `hide` (the ocean itself) out of it. Returns false, and
   * draws nothing, when the camera is under the water level.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    level: number,
    hide: THREE.Object3D,
  ): boolean {
    this.cameraPos.setFromMatrixPosition(camera.matrixWorld);
    this.waterPos.set(0, level, 0);
    this.view.subVectors(this.waterPos, this.cameraPos);
    if (this.view.dot(UP) > 0) return false;

    // The camera mirrored across the water plane (the method of three.js's Reflector).
    this.view.reflect(UP).negate().add(this.waterPos);
    this.rotation.extractRotation(camera.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rotation).add(this.cameraPos);
    this.aim.subVectors(this.waterPos, this.lookAt).reflect(UP).negate().add(this.waterPos);
    this.cam.position.copy(this.view);
    this.cam.up.set(0, 1, 0).applyMatrix4(this.rotation).reflect(UP);
    this.cam.lookAt(this.aim);
    this.cam.near = camera.near;
    this.cam.far = camera.far;
    this.cam.updateMatrixWorld();
    this.cam.projectionMatrix.copy(camera.projectionMatrix);

    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.matrix.multiply(this.cam.projectionMatrix).multiply(this.cam.matrixWorldInverse);

    // Oblique near plane: the clip plane is the water plane itself, in the mirror camera's space.
    this.plane.setFromNormalAndCoplanarPoint(UP, this.waterPos);
    this.plane.applyMatrix4(this.cam.matrixWorldInverse);
    this.clip.set(
      this.plane.normal.x,
      this.plane.normal.y,
      this.plane.normal.z,
      this.plane.constant,
    );
    const p = this.cam.projectionMatrix.elements;
    this.q.set(
      (Math.sign(this.clip.x) + p[8]!) / p[0]!,
      (Math.sign(this.clip.y) + p[9]!) / p[5]!,
      -1,
      (1 + p[10]!) / p[14]!,
    );
    this.clip.multiplyScalar(2 / this.clip.dot(this.q));
    p[2] = this.clip.x;
    p[6] = this.clip.y;
    p[10] = this.clip.z + 1 - CLIP_BIAS;
    p[14] = this.clip.w;

    const previousTarget = renderer.getRenderTarget();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    hide.visible = false;
    // The shadows were drawn for the real camera: reuse them instead of drawing them again.
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.cam);
    renderer.setRenderTarget(previousTarget);
    renderer.shadowMap.autoUpdate = shadowAuto;
    hide.visible = true;
    return true;
  }

  dispose(): void {
    this.target.dispose();
  }
}
