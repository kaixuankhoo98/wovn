// Puzzle data (matches the generator's JSON) and board geometry.
// Cells are addressed by index r * size + c. Paths are arrays of cell indices.

export type Side = "E" | "S";
export type Axis = "h" | "v";

export interface Endpoint {
  color: number;
  a: [number, number];
  b: [number, number];
}

export interface Wall {
  cell: [number, number];
  side: Side;
}

export type SolutionCell = number | { h: number; v: number };

export interface Puzzle {
  size: number;
  endpoints: Endpoint[];
  walls: Wall[];
  bridges: [number, number][];
  solution?: SolutionCell[][];
  difficulty: number | null;
  seed?: number;
}

export type Paths = number[][];

export class Geometry {
  readonly size: number;
  readonly cells: number;
  readonly colors: number;
  private readonly walls = new Set<string>();
  private readonly bridgeSet = new Set<number>();
  private readonly endpoints = new Map<number, number>(); // cell -> colour
  readonly ends: [number, number][] = []; // colour -> [a, b]

  constructor(readonly puzzle: Puzzle) {
    this.size = puzzle.size;
    this.cells = this.size * this.size;
    this.colors = puzzle.endpoints.length;
    for (const w of puzzle.walls) this.walls.add(`${this.idx(w.cell[0], w.cell[1])}${w.side}`);
    for (const [r, c] of puzzle.bridges) this.bridgeSet.add(this.idx(r, c));
    for (const e of puzzle.endpoints) {
      const a = this.idx(e.a[0], e.a[1]);
      const b = this.idx(e.b[0], e.b[1]);
      this.endpoints.set(a, e.color);
      this.endpoints.set(b, e.color);
      this.ends[e.color] = [a, b];
    }
  }

  idx(r: number, c: number): number {
    return r * this.size + c;
  }
  rc(i: number): [number, number] {
    return [Math.floor(i / this.size), i % this.size];
  }
  inBounds(r: number, c: number): boolean {
    return r >= 0 && c >= 0 && r < this.size && c < this.size;
  }
  adjacent(a: number, b: number): boolean {
    const [ar, ac] = this.rc(a);
    const [br, bc] = this.rc(b);
    return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
  }
  /** Axis of a step between two adjacent cells. */
  axis(a: number, b: number): Axis {
    return Math.floor(a / this.size) === Math.floor(b / this.size) ? "h" : "v";
  }
  /** Is there a wall between two adjacent cells? */
  blocked(a: number, b: number): boolean {
    const lo = Math.min(a, b);
    return this.walls.has(`${lo}${this.axis(a, b) === "h" ? "E" : "S"}`);
  }
  isBridge(i: number): boolean {
    return this.bridgeSet.has(i);
  }
  endpointColor(i: number): number | undefined {
    return this.endpoints.get(i);
  }
  get bridgeCells(): number[] {
    return [...this.bridgeSet];
  }

  /**
   * The "slot" a path occupies at position i. Normal cells have one slot,
   * bridges have one per axis. The axis comes from the neighbouring cell.
   */
  slot(path: number[], i: number): string {
    const cell = path[i];
    if (!this.isBridge(cell)) return `${cell}`;
    const nb = i > 0 ? path[i - 1] : path[i + 1];
    return nb === undefined ? `${cell}` : `${cell}${this.axis(nb, cell)}`;
  }

  isTied(color: number, path: number[]): boolean {
    if (path.length < 2) return false;
    const [a, b] = this.ends[color];
    const s = path[0];
    const t = path[path.length - 1];
    return (s === a && t === b) || (s === b && t === a);
  }
}

/** Rebuild per-colour paths from a solution grid (debug reveal, tests). */
export function solutionToPaths(geo: Geometry): Paths {
  const sol = geo.puzzle.solution;
  if (!sol) throw new Error("puzzle has no solution");
  const n = geo.size;
  // slot -> colour
  const owner = new Map<string, number>();
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const v = sol[r][c];
      const i = geo.idx(r, c);
      if (typeof v === "number") owner.set(`${i}`, v);
      else {
        owner.set(`${i}h`, v.h);
        owner.set(`${i}v`, v.v);
      }
    }
  const paths: Paths = [];
  for (let k = 0; k < geo.colors; k++) {
    const [a, b] = geo.ends[k];
    const target = [...owner.values()].filter((x) => x === k).length;
    const path = [a];
    const used = new Set<string>([`${a}`]);
    const dfs = (): boolean => {
      const head = path[path.length - 1];
      if (head === b) return path.length === target;
      const [r, c] = geo.rc(head);
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!geo.inBounds(r + dr, c + dc)) continue;
        const to = geo.idx(r + dr, c + dc);
        if (geo.blocked(head, to)) continue;
        const ax = geo.axis(head, to);
        if (geo.isBridge(head) && path.length > 1 && geo.axis(path[path.length - 2], head) !== ax) continue;
        const s = geo.isBridge(to) ? `${to}${ax}` : `${to}`;
        if (used.has(s) || owner.get(s) !== k) continue;
        used.add(s);
        path.push(to);
        if (dfs()) return true;
        path.pop();
        used.delete(s);
      }
      return false;
    };
    if (!dfs()) throw new Error(`could not trace colour ${k}`);
    paths.push(path);
  }
  return paths;
}
