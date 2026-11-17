// One playable board: input, undo/reset, timer. The page decides what happens around it.
import { check } from "./checker";
import { down, emptyState, move, up, type InputState } from "./input";
import { Geometry, solutionToPaths, type Paths, type Puzzle } from "./puzzle";
import { cellAt, render } from "./render";

export interface Snapshot {
  paths: Paths;
  elapsed: number;
  resets: number;
}

export interface Hooks {
  onChange(): void; // after every committed change and every timer tick
  onSolved(): void;
}

const copy = (p: Paths): Paths => p.map((x) => [...x]);

export class Session {
  readonly geo: Geometry;
  state: InputState;
  resets = 0;
  solved = false;
  private undoStack: Paths[] = [];
  // timer: runs from when the board is shown, pauses while the tab is hidden
  private elapsed = 0;
  private runningSince: number | null = null;
  private tick: number | undefined;
  private held = false; // clock held while an overlay (the guide) covers the board
  private pointer: number | null = null;
  private lastCell: number | null = null;
  private abort = new AbortController();

  constructor(
    private el: HTMLElement,
    puzzle: Puzzle,
    private hooks: Hooks,
    restore?: Snapshot,
    reveal = false,
  ) {
    this.geo = new Geometry(puzzle);
    this.state = emptyState(this.geo);
    if (restore && restore.paths.length === this.geo.colors) {
      this.state = { ...this.state, paths: copy(restore.paths) };
      this.elapsed = restore.elapsed;
      this.resets = restore.resets;
    }
    if (reveal && puzzle.solution) this.state = { ...this.state, paths: solutionToPaths(this.geo) };
    this.listen();
    this.commit(this.state);
    this.startTimer();
  }

  /** Milliseconds played so far. */
  time(): number {
    return this.elapsed + (this.runningSince === null ? 0 : performance.now() - this.runningSince);
  }

  snapshot(): Snapshot {
    return { paths: copy(this.state.paths), elapsed: this.time(), resets: this.resets };
  }

  progress() {
    return check(this.geo, this.state.paths);
  }

  undo() {
    if (this.solved || this.pointer !== null || !this.undoStack.length) return;
    this.commit({ ...this.state, paths: this.undoStack.pop()! });
  }

  reset() {
    if (this.solved || this.state.paths.every((p) => !p.length)) return;
    this.undoStack.push(copy(this.state.paths));
    this.resets++;
    this.commit(emptyState(this.geo));
  }

  /** Stop the clock while something covers the board. */
  holdClock() {
    this.held = true;
    this.stopTimer();
  }

  releaseClock() {
    this.held = false;
    this.startTimer();
  }

  destroy() {
    this.stopTimer();
    this.abort.abort();
  }

  private startTimer() {
    if (this.runningSince === null && !this.solved && !this.held && !document.hidden) {
      this.runningSince = performance.now();
      this.tick = window.setInterval(() => this.hooks.onChange(), 500);
    }
  }

  private stopTimer() {
    if (this.runningSince !== null) this.elapsed += performance.now() - this.runningSince;
    this.runningSince = null;
    window.clearInterval(this.tick);
  }

  private tiedSet(paths: Paths): Set<number> {
    const s = new Set<number>();
    paths.forEach((p, k) => this.geo.isTied(k, p) && s.add(k));
    return s;
  }

  private commit(next: InputState, pulse = new Set<number>()) {
    this.state = next;
    const justSolved = check(this.geo, next.paths).solved && !this.solved;
    if (justSolved) {
      this.solved = true;
      this.stopTimer();
      navigator.vibrate?.([12, 40, 24]);
    }
    this.el.innerHTML = render(this.geo, next.paths, { solved: this.solved, pulse });
    this.hooks.onChange();
    if (justSolved) this.hooks.onSolved();
  }

  private listen() {
    const { signal } = this.abort;
    const el = this.el;
    const svg = () => el.querySelector("svg")!;

    el.addEventListener(
      "pointerdown",
      (e) => {
        if (this.solved || this.pointer !== null) return;
        const cell = cellAt(this.geo, svg(), e.clientX, e.clientY);
        if (cell === null) return;
        const next = down(this.geo, this.state, cell);
        if (next.active === null) return;
        e.preventDefault();
        this.pointer = e.pointerId;
        this.lastCell = cell;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // capture is a nicety; dragging still works without it
        }
        this.undoStack.push(copy(this.state.paths));
        this.commit(next);
      },
      { signal },
    );

    el.addEventListener(
      "pointermove",
      (e) => {
        if (e.pointerId !== this.pointer) return;
        const cell = cellAt(this.geo, svg(), e.clientX, e.clientY);
        if (cell === null || cell === this.lastCell) return;
        this.lastCell = cell;
        const before = this.tiedSet(this.state.paths);
        const next = move(this.geo, this.state, cell);
        if (next === this.state) return;
        const fresh = new Set([...this.tiedSet(next.paths)].filter((k) => !before.has(k)));
        if (fresh.size) navigator.vibrate?.(12);
        this.commit(next, fresh);
      },
      { signal },
    );

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointer) return;
      this.pointer = null;
      this.lastCell = null;
      const next = up(this.geo, this.state);
      // A drag that changed nothing shouldn't fill the undo stack.
      const top = this.undoStack[this.undoStack.length - 1];
      if (JSON.stringify(next.paths) === JSON.stringify(top)) this.undoStack.pop();
      this.commit(next);
    };
    el.addEventListener("pointerup", release, { signal });
    el.addEventListener("pointercancel", release, { signal });

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.stopTimer();
        else this.startTimer();
      },
      { signal },
    );
  }
}
