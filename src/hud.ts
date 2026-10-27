import './hud.css';
import {
  getSoldier,
  levelInfo,
  localPlayer,
  maxHealthOf,
  objectiveProgress,
  gunOf,
  ammoLabel,
  weaponDef,
  type GameConfig,
  type GameState,
  type Objective,
} from './sim';

const BANNER_MS = 1800;
/** How long the crosshair glows after the controlled soldier's shot lands. */
const HIT_MARKER_MS = 160;
const LOW_HEALTH = 0.3;
const BEST_KEY = 'zombie-horde-survivors.best-kills';
/** Key used before the game was renamed; still read so saved scores aren't lost. */
const LEGACY_BEST_KEY = 'zombie-shooter.best-kills';

function loadBest(): number {
  try {
    return (
      Number(localStorage.getItem(BEST_KEY)) || Number(localStorage.getItem(LEGACY_BEST_KEY)) || 0
    );
  } catch {
    return 0;
  }
}

function saveBest(kills: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(kills));
  } catch {
    // Storage can be unavailable (private mode); the best score is optional.
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** DOM overlay: health, wave, kills, wave banner and the game over screen. */
/** Crosshair size (px): the smallest, the cap, and pixels per radian of aim error. */
const CROSSHAIR_MIN = 12;
const CROSSHAIR_MAX = 120;
const CROSSHAIR_PX_PER_RAD = 700;

export class Hud {
  private readonly healthLabel: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly oxygen: HTMLElement;
  private readonly oxygenFill: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly kills: HTMLElement;
  private readonly casualties: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly root: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly level: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossFill: HTMLElement;
  private shownBoss = -1;
  private readonly banner: HTMLElement;
  private readonly damage: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly startWave: HTMLButtonElement;
  private readonly pause: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly crosshair: HTMLElement;
  private crosshairSize = 0;
  private hitTimer = 0;
  private readonly gameOver: HTMLElement;
  private readonly gameOverTitle: HTMLElement;
  private readonly objectives: HTMLElement;
  private readonly briefing: HTMLElement;
  private readonly summary: HTMLElement;
  private bannerTimer = 0;
  // Last rendered values, so the DOM is only touched when something changes.
  private shown = {
    downed: false,
    health: -1,
    wave: -1,
    kills: -1,
    casualties: -1,
    subtitle: '',
    over: false,
    objectives: '',
    countdown: '',
    focus: -1,
    weapon: '',
    gold: -1,
    xp: -1,
  };

  constructor(
    parent: HTMLElement,
    private readonly config: GameConfig,
    onRestart: () => void,
    private readonly onStartWave: () => void = () => undefined,
  ) {
    const root = el('div', 'hud', parent);
    this.root = root;

    const health = el('div', 'hud__health', root);
    this.healthLabel = el('div', 'hud__health-label', health);
    this.healthFill = el('div', 'hud__bar-fill', el('div', 'hud__bar', health));

    this.oxygen = el('div', 'hud__oxygen', root);
    el('div', 'hud__oxygen-label', this.oxygen, 'OXYGEN');
    this.oxygenFill = el('div', 'hud__bar-fill', el('div', 'hud__bar', this.oxygen));

    const stats = el('div', 'hud__stats', root);
    this.wave = el('span', '', stats);
    this.kills = el('span', '', stats);
    this.casualties = el('span', 'hud__casualties', stats);
    this.gold = el('span', 'hud__gold', stats);
    this.level = el('span', 'hud__level', stats);
    this.xpFill = el('div', 'hud__xp-fill', el('div', 'hud__xp', root));
    this.bossBar = el('div', 'hud__boss', root);
    this.bossFill = el('div', 'hud__boss-fill', this.bossBar);
    this.objectives = el('ul', 'hud__objectives', root);
    this.briefing = el('div', 'hud__briefing', root);
    this.briefing.addEventListener('click', () => this.showBriefing(''));
    this.banner = el('div', 'hud__banner', root);
    this.damage = el('div', 'hud__damage', root);
    this.countdown = el('div', 'hud__countdown', root);
    this.startWave = el('button', 'hud__start-wave', root, '▶ Start wave');
    this.startWave.hidden = true;
    this.startWave.addEventListener('click', () => this.onStartWave());
    this.hint = el('div', 'hud__hint', root);
    this.crosshair = el('div', 'hud__crosshair', root);
    this.subtitle = el('div', 'hud__subtitle', root);

    this.pause = el('div', 'hud__pause', root);
    el('h1', '', this.pause, 'PAUSED');
    el('p', '', this.pause, 'Press P, I or Esc to resume');

    this.gameOver = el('div', 'hud__gameover', root);
    this.gameOverTitle = el('h1', '', this.gameOver, 'GAME OVER');
    this.summary = el('p', '', this.gameOver);
    const button = el('button', '', this.gameOver, 'Restart (R)');
    button.addEventListener('click', onRestart);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyR' && this.shown.over) onRestart();
    });
  }

  /** Forces a full refresh on the next update (call after restarting). */
  reset(): void {
    this.shown = {
      downed: false,
      health: -1,
      wave: -1,
      kills: -1,
      casualties: -1,
      subtitle: '',
      over: false,
      objectives: '',
      countdown: '',
      focus: -1,
      weapon: '',
      gold: -1,
      xp: -1,
    };
    this.gameOver.classList.remove('hud__gameover--visible');
    this.showBriefing('');
    this.banner.classList.remove('hud__banner--visible');
  }

  /** Reacts to events from a simulation step (call after every step). */
  onStep(state: GameState): void {
    for (const e of state.events) {
      if (e.type === 'soldierHurt' && e.soldierId === localPlayer(state).controlledId)
        this.flashDamage();
      else if (
        (e.type === 'shot' && e.shooterId === localPlayer(state).controlledId && e.hit) ||
        (e.type === 'melee' && e.attackerId === localPlayer(state).controlledId && e.hit)
      )
        this.flashHit(e.hit!.kind);
      else if (e.type === 'levelUp') this.showBanner(`LEVEL UP! Lv ${e.level}`);
      else if (e.type === 'bossSpawned') this.showBanner('MINI BOSS!');
    }
  }

  /** A mission card over the game; a click closes it. An empty text hides it. */
  showBriefing(text: string): void {
    this.briefing.replaceChildren();
    this.briefing.classList.toggle('hud__briefing--visible', text !== '');
    if (text === '') return;
    el('h2', '', this.briefing, 'Mission briefing');
    el('p', '', this.briefing, text);
    el('small', '', this.briefing, 'Click to start');
  }

  setPaused(paused: boolean): void {
    this.pause.classList.toggle('hud__pause--visible', paused);
  }

  /** Makes the crosshair glow for a moment: white for a body hit, orange for a head, yellow for a crit. */
  private flashHit(kind: 'head' | 'crit' | 'body'): void {
    for (const k of ['head', 'crit', 'body']) {
      this.crosshair.classList.toggle(`hud__crosshair--hit-${k}`, k === kind);
    }
    window.clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => {
      for (const k of ['head', 'crit', 'body']) {
        this.crosshair.classList.remove(`hud__crosshair--hit-${k}`);
      }
    }, HIT_MARKER_MS);
  }

  setCrosshair(visible: boolean): void {
    this.crosshair.classList.toggle('hud__crosshair--visible', visible);
  }

  /** Widens the crosshair with the aim error (radians) of the controlled gun. */
  setCrosshairError(error: number): void {
    const size = Math.round(Math.min(CROSSHAIR_MAX, CROSSHAIR_MIN + error * CROSSHAIR_PX_PER_RAD));
    if (size !== this.crosshairSize) {
      this.crosshairSize = size;
      this.crosshair.style.setProperty('--cross', `${size}px`);
    }
  }

  /** Text describing the current mode and its keys. */
  setHint(text: string): void {
    if (this.hint.textContent !== text) this.hint.textContent = text;
  }

  /** `focusId` is the soldier whose health is shown (controlled or selected). */
  update(state: GameState, focusId: number | null): void {
    const focus =
      getSoldier(state, focusId) ?? state.soldiers.find((s) => !s.dead) ?? state.soldiers[0];
    const health = Math.ceil(focus?.health ?? 0);
    // The oxygen bar shows while the unit swims, and turns red when the breath runs low.
    const breath = focus ? Math.max(0, focus.oxygen) / this.config.swimming.breath : 1;
    this.oxygen.classList.toggle('hud__oxygen--visible', focus?.swimming === true);
    this.oxygen.classList.toggle('hud__oxygen--low', breath < 0.25);
    this.oxygenFill.style.width = `${Math.min(100, breath * 100)}%`;
    const focusKey = focus?.id ?? 0;
    const gun = focus ? gunOf(this.config, focus) : null;
    const ammo = focus && gun !== null ? ammoLabel(this.config, focus) : '';
    const weapon = focus
      ? gun !== null
        ? `${weaponDef(this.config, gun).name}${ammo ? ` ${ammo}` : ''}`
        : 'Unarmed'
      : '';
    if (
      health !== this.shown.health ||
      focusKey !== this.shown.focus ||
      weapon !== this.shown.weapon ||
      Boolean(focus?.downed) !== this.shown.downed
    ) {
      this.shown.health = health;
      this.shown.focus = focusKey;
      this.shown.weapon = weapon;
      this.shown.downed = Boolean(focus?.downed);
      const max = Math.round(maxHealthOf(state, this.config, focus ?? undefined));
      const down = focus?.downed ? ' — DOWN' : '';
      this.healthLabel.textContent = `${focus?.name ?? `${focus?.kind === 'drone' ? 'Drone' : 'Soldier'} ${focusKey}`} · ${weapon} — Health ${health} / ${max}${down}`;
      this.healthFill.style.width = `${(health / max) * 100}%`;
      this.healthFill.classList.toggle('hud__bar-fill--low', health / max < LOW_HEALTH);
    }

    if (state.wave !== this.shown.wave) {
      this.shown.wave = state.wave;
      this.wave.textContent = `Wave ${state.wave}`;
      if (state.wave > 0) this.showBanner(`Wave ${state.wave}`);
    }

    if (state.kills !== this.shown.kills) {
      this.shown.kills = state.kills;
      this.kills.textContent = `Kills ${state.kills}`;
    }

    if (state.civilians > 0 && state.casualties !== this.shown.casualties) {
      this.shown.casualties = state.casualties;
      this.casualties.textContent =
        state.casualties > 0 ? `CIVILIAN CASUALTIES: ${state.casualties} / ${state.civilians}` : '';
    }
    this.kills.style.display = state.civilians > 0 ? 'none' : '';
    // The sky show is a scene, not a fight: no health, wave or gold readouts.
    this.root.classList.toggle('hud--cinema', this.config.skyShowOn);

    // Yellow subtitles at the bottom, from the map's script.
    const line = this.config.subtitles.find(
      (s) => state.time >= s.at && state.time < s.at + s.duration,
    );
    const text = line?.text ?? '';
    if (text !== this.shown.subtitle) {
      this.shown.subtitle = text;
      this.subtitle.textContent = text;
    }

    if (state.gold !== this.shown.gold) {
      this.shown.gold = state.gold;
      this.gold.textContent = `Gold ${state.gold}`;
    }
    if (state.xp !== this.shown.xp) {
      this.shown.xp = state.xp;
      const info = levelInfo(state.xp, this.config);
      this.level.textContent = `Lv ${info.level}`;
      this.xpFill.style.width = `${(info.into / info.needed) * 100}%`;
    }

    // A thin red bar under the XP bar while a mini boss lives (the toughest one if there are several).
    let boss: (typeof state.zombies)[number] | undefined;
    for (const z of state.zombies) {
      if (z.boss && z.state !== 'death' && (!boss || z.maxHealth > boss.maxHealth)) boss = z;
    }
    const bossRatio = boss ? Math.min(Math.max(boss.health / boss.maxHealth, 0), 1) : -1;
    if (bossRatio !== this.shownBoss) {
      this.shownBoss = bossRatio;
      this.bossBar.classList.toggle('hud__boss--visible', boss !== undefined);
      this.bossFill.style.width = `${Math.max(bossRatio, 0) * 100}%`;
    }

    const countdown =
      state.status === 'playing' && state.spawner.phase === 'intermission'
        ? `Next wave in ${Math.ceil(state.spawner.timer)}s · B: shop`
        : '';
    // Build maps let the player end the calm early.
    this.startWave.hidden = !(this.config.build && countdown !== '');
    if (countdown !== this.shown.countdown) {
      this.shown.countdown = countdown;
      this.countdown.textContent = countdown;
    }

    this.updateObjectives(state);

    const over = state.status !== 'playing';
    if (over !== this.shown.over) {
      this.shown.over = over;
      this.gameOver.classList.toggle('hud__gameover--visible', over);
      if (over) {
        const won = state.status === 'victory';
        this.gameOverTitle.textContent = won ? 'MISSION COMPLETE' : 'GAME OVER';
        const best = Math.max(loadBest(), state.kills);
        saveBest(best);
        this.summary.textContent = `${won ? 'You cleared the mission at' : 'You survived to'} wave ${state.wave} with ${state.kills} kills. Best: ${best}`;
      }
    }
  }

  /** The story goals with their progress; hidden when the map has none. */
  private updateObjectives(state: GameState): void {
    const list = this.config.objectives.map((o, i) => {
      const [now, target] = objectiveProgress(state, o);
      const done = state.objectivesDone[i] === true;
      return {
        text: `${done ? '✔' : '☐'} ${objectiveLabel(o)}${target > 1 ? ` (${now}/${target})` : ''}`,
        done,
      };
    });
    const key = list.map((l) => l.text).join('|');
    if (key === this.shown.objectives) return;
    this.shown.objectives = key;
    this.objectives.replaceChildren();
    for (const l of list) {
      el(
        'li',
        l.done ? 'hud__objective hud__objective--done' : 'hud__objective',
        this.objectives,
        l.text,
      );
    }
  }

  private flashDamage(): void {
    const style = this.damage.style;
    style.transition = 'none';
    style.opacity = '1';
    void this.damage.offsetWidth; // restart the transition
    style.transition = 'opacity 0.45s ease-out';
    style.opacity = '0';
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.add('hud__banner--visible');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(
      () => this.banner.classList.remove('hud__banner--visible'),
      BANNER_MS,
    );
  }
}

/** A short sentence for a story goal, shared by the HUD and the editor. */
export function objectiveLabel(o: Objective): string {
  switch (o.kind) {
    case 'reach':
      return 'Reach the marked spot';
    case 'kills':
      return `Kill ${o.count} enemies`;
    case 'survive':
      return `Clear wave ${o.wave}`;
    case 'boss':
      return o.count === 1 ? 'Kill a mini boss' : `Kill ${o.count} mini bosses`;
  }
}
