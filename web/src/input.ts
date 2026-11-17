// Pure drag state machine: (state, action) -> state.
//
// While dragging, other colours are derived from their drag-start shape,
// cut back wherever the active path now sits. Backing out of a cut path
// lets it grow back, and releasing commits the result.
import type { Geometry, Paths } from "./puzzle";

export interface InputState {
  paths: Paths;
  active: number | null;
  base: Paths | null; // paths at drag start
}

export const emptyState = (geo: Geometry): InputState => ({
  paths: Array.from({ length: geo.colors }, () => []),
  active: null,
  base: null,
});

const clone = (p: Paths): Paths => p.map((x) => [...x]);

function slots(geo: Geometry, path: number[]): string[] {
  return path.map((_, i) => geo.slot(path, i));
}

function withActive(geo: Geometry, s: InputState, newPath: number[]): InputState {
  const k = s.active!;
  const claims = new Set(slots(geo, newPath));
  const paths = s.base!.map((p, j) => {
    if (j === k) return newPath;
    const ss = slots(geo, p);
    const cut = ss.findIndex((x) => claims.has(x));
    return cut === -1 ? p : p.slice(0, cut);
  });
  return { ...s, paths };
}

/** Pointer down on a cell. */
export function down(geo: Geometry, s: InputState, cell: number): InputState {
  const ep = geo.endpointColor(cell);
  if (ep !== undefined) {
    // Start this colour fresh from the endpoint (also clears it on a tap).
    const base = clone(s.paths);
    base[ep] = [];
    return withActive(geo, { ...s, active: ep, base }, [cell]);
  }
  // Grab an existing path at this cell and continue from there.
  for (let k = 0; k < geo.colors; k++) {
    const i = s.paths[k].indexOf(cell);
    if (i > 0) {
      const base = clone(s.paths);
      return withActive(geo, { ...s, active: k, base }, s.paths[k].slice(0, i + 1));
    }
  }
  return s;
}

/** Move one step from the active head to an adjacent cell, or null if not allowed. */
function step(geo: Geometry, s: InputState, to: number): InputState | null {
  const k = s.active!;
  const p = s.paths[k];
  const head = p[p.length - 1];
  const prev = p.length > 1 ? p[p.length - 2] : undefined;
  if (!geo.adjacent(head, to)) return null;
  if (to === prev) return withActive(geo, s, p.slice(0, -1)); // shorten
  if (geo.isTied(k, p)) return null; // locked: only backing out is allowed
  if (geo.blocked(head, to)) return null;
  const ax = geo.axis(head, to);
  if (geo.isBridge(head) && prev !== undefined && geo.axis(prev, head) !== ax) return null; // no turning on a bridge

  const ep = geo.endpointColor(to);
  if (ep !== undefined) {
    if (ep !== k || to === p[0]) return null;
    return withActive(geo, s, [...p, to]);
  }

  const own = slots(geo, p);
  if (geo.isBridge(to)) {
    const other = ax === "h" ? "v" : "h";
    if (own.includes(`${to}${other}`)) return null; // a path can't cross itself
    const i = own.indexOf(`${to}${ax}`);
    if (i !== -1) return withActive(geo, s, p.slice(0, i + 1));
  } else {
    const i = p.indexOf(to);
    if (i !== -1) return withActive(geo, s, p.slice(0, i + 1)); // loop back: trim
  }
  return withActive(geo, s, [...p, to]);
}

function walk(geo: Geometry, s: InputState, dir: [number, number][], target: number): InputState {
  let cur = s;
  for (const [dr, dc] of dir) {
    const p = cur.paths[cur.active!];
    const [r, c] = geo.rc(p[p.length - 1]);
    if (!geo.inBounds(r + dr, c + dc)) break;
    const next = step(geo, cur, geo.idx(r + dr, c + dc));
    if (!next) break;
    cur = next;
    const np = cur.paths[cur.active!];
    if (np[np.length - 1] === target) break;
  }
  return cur;
}

/**
 * Pointer moved over `cell`. Fast drags that skip cells are filled in along
 * a straight line, or an L (horizontal-first, then vertical-first) if the
 * pointer moved diagonally. If neither reaches the cell, take whichever got
 * closer.
 */
export function move(geo: Geometry, s: InputState, cell: number): InputState {
  if (s.active === null) return s;
  const p = s.paths[s.active];
  const head = p[p.length - 1];
  if (cell === head) return s;
  const [hr, hc] = geo.rc(head);
  const [tr, tc] = geo.rc(cell);
  const dr = tr - hr;
  const dc = tc - hc;
  const hs: [number, number][] = Array.from({ length: Math.abs(dc) }, () => [0, Math.sign(dc)]);
  const vs: [number, number][] = Array.from({ length: Math.abs(dr) }, () => [Math.sign(dr), 0]);
  const options = dr === 0 || dc === 0 ? [[...hs, ...vs]] : [[...hs, ...vs], [...vs, ...hs]];
  let best = s;
  let bestDist = Math.abs(dr) + Math.abs(dc);
  for (const dirs of options) {
    const out = walk(geo, s, dirs, cell);
    const op = out.paths[out.active!];
    const [r, c] = geo.rc(op[op.length - 1]);
    const d = Math.abs(tr - r) + Math.abs(tc - c);
    if (d < bestDist) {
      best = out;
      bestDist = d;
      if (d === 0) break;
    }
  }
  return best;
}

/** Pointer released: commit. A lone endpoint (a tap) clears that colour. */
export function up(_geo: Geometry, s: InputState): InputState {
  if (s.active === null) return s;
  const paths = clone(s.paths);
  if (paths[s.active].length === 1) paths[s.active] = [];
  return { paths, active: null, base: null };
}
