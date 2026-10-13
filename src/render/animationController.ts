import * as THREE from 'three';
import type { CharacterSpec } from './characterConfig';

const FADE_SECONDS = 0.2;

/** Per-character animation state machine: simulation state name -> crossfaded clip. */
export class AnimationController {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private state = '';

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], spec: CharacterSpec) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [state, clipName] of Object.entries(spec.clips)) {
      const clip = THREE.AnimationClip.findByName(clips, clipName);
      if (!clip) {
        console.warn(`Clip "${clipName}" (state "${state}") not found in model`);
        continue;
      }
      const action = this.mixer.clipAction(clip);
      if (spec.once.includes(state)) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(state, action);
    }
  }

  setState(next: string): void {
    if (next === this.state) return;
    this.state = next;
    const action = this.actions.get(next);
    if (!action) return;
    action.reset().play();
    this.current?.crossFadeTo(action, FADE_SECONDS, false);
    this.current = action;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
