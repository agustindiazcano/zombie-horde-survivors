import * as THREE from 'three';

/** Minimal scene so the scaffold shows something; replaced in the renderer task. */
export function createDemo(canvasParent: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  canvasParent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x222831);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 8, 8);
  camera.lookAt(0, 0, 0);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x3a4750 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground, new THREE.HemisphereLight(0xffffff, 0x444444, 2));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}
