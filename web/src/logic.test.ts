import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { check } from "./checker";
import { down, emptyState, move, up, type InputState } from "./input";
import { Geometry, solutionToPaths, type Puzzle } from "./puzzle";

const dir = join(__dirname, "../public/puzzles/dev");
const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => [f, JSON.parse(readFileSync(join(dir, f), "utf8")) as Puzzle] as const);

describe("checker on generator fixtures", () => {
  it("has fixtures, including bridges and walls", () => {
    expect(fixtures.length).toBeGreaterThan(5);
    expect(fixtures.some(([, p]) => p.bridges.length > 0)).toBe(true);
    expect(fixtures.some(([, p]) => p.walls.length > 0)).toBe(true);
  });

  for (const [name, p] of fixtures) {
    it(`${name}: stored solution satisfies the rules`, () => {
      const geo = new Geometry(p);
      const r = check(geo, solutionToPaths(geo));
      expect(r.errors).toEqual([]);
      expect(r.solved).toBe(true);
    });
  }

  it("rejects a board with one cell missing", () => {
    const [, p] = fixtures[0];
    const geo = new Geometry(p);
    const paths = solutionToPaths(geo);
    const k = paths.findIndex((x) => x.length > 2);
    paths[k] = paths[k].slice(0, -1);
    expect(check(geo, paths).solved).toBe(false);
  });
});

// Hand-made 4x4 with a bridge at (1,1) and a wall east of (2,2).
//   A . B .
//   . + . .
//   . . . .
//   . A B .
const tiny: Puzzle = {
  size: 4,
  endpoints: [
    { color: 0, a: [0, 0], b: [3, 1] },
    { color: 1, a: [0, 2], b: [3, 2] },
  ],
  walls: [{ cell: [2, 2], side: "E" }],
  bridges: [[1, 1]],
  difficulty: null,
};
const g = new Geometry(tiny);
const at = (r: number, c: number) => g.idx(r, c);
function drag(s: InputState, cells: [number, number][]): InputState {
  let st = down(g, s, at(...cells[0]));
  for (const c of cells.slice(1)) st = move(g, st, at(...c));
  return up(g, st);
}

describe("input state machine", () => {
  it("extends from an endpoint and locks on reaching its partner", () => {
    const s = drag(emptyState(g), [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]]);
    expect(s.paths[0]).toEqual([at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(3, 1)]);
    expect(g.isTied(0, s.paths[0])).toBe(true);
  });

  it("shortens when dragging back over its own path", () => {
    let s = down(g, emptyState(g), at(0, 0));
    for (const c of [[1, 0], [2, 0], [1, 0]] as [number, number][]) s = move(g, s, at(...c));
    expect(up(g, s).paths[0]).toEqual([at(0, 0), at(1, 0)]);
  });

  it("fills in skipped cells along a straight line", () => {
    const s = drag(emptyState(g), [[0, 0], [3, 0]]);
    expect(s.paths[0]).toEqual([at(0, 0), at(1, 0), at(2, 0), at(3, 0)]);
  });

  it("is blocked by walls and by other endpoints", () => {
    let s = drag(emptyState(g), [[0, 2], [1, 2], [2, 2], [2, 3]]);
    expect(s.paths[1]).toEqual([at(0, 2), at(1, 2), at(2, 2)]);
    s = drag(emptyState(g), [[0, 2], [0, 1], [0, 0]]);
    expect(s.paths[1]).toEqual([at(0, 2), at(0, 1)]);
  });

  it("cuts another colour, and the cut path grows back when you back out", () => {
    let s = drag(emptyState(g), [[0, 0], [1, 0], [2, 0]]);
    let d = down(g, s, at(0, 2));
    d = move(g, d, at(0, 1));
    d = move(g, d, at(0, 0)); // blocked: endpoint of colour 0
    expect(d.paths[0]).toEqual([at(0, 0), at(1, 0), at(2, 0)]);
    s = drag(emptyState(g), [[0, 0], [1, 0], [2, 0], [2, 1]]);
    d = down(g, s, at(3, 2));
    d = move(g, d, at(2, 2));
    d = move(g, d, at(2, 1)); // cuts colour 0 at (2,1)
    expect(d.paths[0]).toEqual([at(0, 0), at(1, 0), at(2, 0)]);
    d = move(g, d, at(2, 2)); // back out
    expect(d.paths[0]).toEqual([at(0, 0), at(1, 0), at(2, 0), at(2, 1)]);
  });

  it("goes straight through bridges, and lets a second colour cross", () => {
    // colour 1 crosses the bridge horizontally
    let s = drag(emptyState(g), [[0, 2], [1, 2], [1, 1], [1, 0]]);
    expect(s.paths[1]).toEqual([at(0, 2), at(1, 2), at(1, 1), at(1, 0)]);
    // turning on the bridge is not allowed
    const t = drag(emptyState(g), [[0, 2], [1, 2], [1, 1], [2, 1]]);
    expect(t.paths[1]).toEqual([at(0, 2), at(1, 2), at(1, 1)]);
    // colour 0 crosses vertically without cutting colour 1
    s = drag({ ...s, paths: [[], [at(0, 2), at(1, 2), at(1, 1), at(1, 0)]] }, [[0, 0], [0, 1], [1, 1], [2, 1]]);
    expect(s.paths[0]).toEqual([at(0, 0), at(0, 1), at(1, 1), at(2, 1)]);
    expect(s.paths[1]).toEqual([at(0, 2), at(1, 2), at(1, 1), at(1, 0)]);
  });

  it("stops a path from crossing itself on a bridge", () => {
    const s = drag(emptyState(g), [[0, 0], [0, 1], [1, 1], [2, 1], [2, 0], [1, 0], [1, 1]]);
    expect(s.paths[0]).toEqual([at(0, 0), at(0, 1), at(1, 1), at(2, 1), at(2, 0), at(1, 0)]);
  });

  it("clears a colour when its endpoint is tapped", () => {
    let s = drag(emptyState(g), [[0, 0], [1, 0], [2, 0]]);
    s = drag(s, [[0, 0]]);
    expect(s.paths[0]).toEqual([]);
  });

  it("solves the tiny puzzle end to end", () => {
    let s = drag(emptyState(g), [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1]]);
    // colour 1: (0,2)->(0,3)->(1,3)->(2,3)->(3,3)->... wall blocks (2,2)-(2,3), so route:
    s = drag(s, [[0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2]]);
    // remaining cells (1,0),(2,0),(3,0),(1,2),(2,2) + bridge horizontal can't all be covered
    // by these two colours, so the board isn't solved: a sanity check on `filled`.
    const r = check(g, s.paths);
    expect(r.tied).toBe(2);
    expect(r.solved).toBe(false);
    expect(r.filled).toBe(10);
  });
});
