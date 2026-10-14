/** A small frames-per-second readout in the corner, toggled with F3. */
export class FpsCounter {
  private readonly node = document.createElement('div');
  private visible = false;
  private frames = 0;
  private elapsed = 0;

  constructor(parent: HTMLElement) {
    Object.assign(this.node.style, {
      position: 'fixed',
      right: '8px',
      bottom: '8px',
      padding: '2px 6px',
      font: '12px monospace',
      color: '#9f9',
      background: 'rgba(0, 0, 0, 0.6)',
      borderRadius: '4px',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '40',
    });
    parent.appendChild(this.node);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.node.style.display = this.visible ? 'block' : 'none';
  }

  /** Call once per rendered frame with the frame time in seconds. */
  tick(dt: number): void {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 0.5) return;
    if (this.visible) this.node.textContent = `${Math.round(this.frames / this.elapsed)} FPS`;
    this.frames = 0;
    this.elapsed = 0;
  }
}
