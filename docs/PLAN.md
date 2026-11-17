# Weave: plan and status

> A daily path-connecting logic puzzle in the Numberlink genre, with **walls** and **bridges**.
> Every day: three puzzles in order, **5×5 → 7×7 → 9×9**. "Weave" is still a working title.

Last updated: 2026-11-17

---

## Where we're up to

| Milestone | Status |
|---|---|
| **M0** Generator spike (walls, uniqueness, ASCII output) | ✅ Done |
| **M1** Bridges | ✅ Done |
| **M2** Playable single grid (render, drag input, rule checker) | ✅ Done, but not yet tested on a real phone |
| **M3** Daily ladder (fetch by date, three grids, timer, results, share, streaks) | ⬜ Next |
| **M4** Difficulty grading and a year of scheduled puzzles | ⬜ |
| **M5** Polish (first-time guide, animations, PWA, deploy) | ⬜ Partly done: dark mode, colour-blind symbols and haptics already exist |

The puzzles have been playtested on screen and look good. Nothing is committed to git yet.

### Run it

```sh
# generator (Python 3.12 via uv)
cd generator
uv run python -m weave_gen make --size 9 --count 10 --seed 1   # writes ../web/public/puzzles/dev/
uv run python -m weave_gen check ../web/public/puzzles/dev/*.json
uv run python -m weave_gen show  ../web/public/puzzles/dev/9-s1-001.json [--blank]
uv run pytest

# web (Vite + plain TypeScript)
cd web
npm run dev          # add ?p=<file> to open a puzzle and &reveal=1 to show its solution
npm test
npm run build
```

---

## The game (as decided)

### Rules
1. Connect each pair of coloured endpoints with one path. Paths move up, down, left or right.
2. Paths can't overlap or branch.
3. **Every cell must be filled.**
4. **Walls** sit on the edge between two cells, and paths can't cross them.
5. **Bridges** are cells that carry two paths: one straight across horizontally, one straight across vertically. Paths can't turn on a bridge. A bridge counts as filled only when both directions are used. **The two paths on a bridge must be different colours**, so a path can't cross itself. Bridges are never endpoints.

### Daily format

| Grid | Colours | Wall pieces | Bridges |
|---|---|---|---|
| 5×5 | 4–5 | 0–1 | 0–1 |
| 7×7 | 6–8 | 1–2 | 1–2 |
| 9×9 | 8–11 | 2–3 | 2–3 |

There's no way to fail. Scoring is based on time, and the number of resets is recorded. The share text must not reveal the solution (see the original spec below).

---

## Decisions log

| # | Decision | Why |
|---|---|---|
| 1 | Build M0 (generator) and M2 (prototype) side by side | So fun can be judged on screen instead of on paper. |
| 2 | Frontend: Vite, plain TypeScript and SVG, no framework | The board is one SVG plus a small state machine. The bundle is about 5 KB gzipped. |
| 3 | The two paths on a bridge must be different colours | Every bridge then reads as a real crossing. This is enforced in the cutter, the SAT encoding, the input and the checker. |
| 4 | Visual direction: **woven textile** | Fits the name. The threads are the one memorable element; everything else stays quiet. |
| 5 | **Walls are placed first, as designed pieces**, not added afterwards to fix ambiguity | Repair walls looked like random scraps. Each piece is a straight run or an L of 1–3 edge segments. |
| 6 | **No repair walls** (`repair = 0`): an ambiguous puzzle is thrown away | Every wall on the board is a deliberate shape. Generation is cheap enough to afford the rejects. |
| 7 | Bridge counts: 0–1, 1–2, 2–3 (same ranges as wall pieces) | Your call. |
| 8 | **No detours**: a thread can never sit next to another part of itself unless a wall separates them | Bans artificial filler such as "left, down, right" just to fill a 2-cell gap. Going around the end of a wall is still allowed. A milder setting, `detours="no-uturns"`, bans only the 2-cell U-turn. |

---

## Architecture

```
generator/                 Python 3.12, uv, python-sat; runs offline
  weave_gen/
    model.py               Grid, Puzzle, per-size PROFILES (all the tuning knobs)
    hamilton.py            Hamiltonian path search, backbite moves, anneal-based smoothing
    segment.py             cuts the path into threads; quality metrics
    sat.py                 uniqueness check
    walls.py               designed wall pieces, optional repair walls
    generate.py            one seed in, one puzzle out (or None)
    io.py, render.py       JSON in and out; ASCII renderer
    cli.py                 make / check / show
  tests/                   brute-force cross-check and property tests
web/
  src/puzzle.ts            types, Geometry, solutionToPaths
  src/input.ts             pure drag state machine
  src/checker.ts           rule-based solved check
  src/render.ts            SVG textile renderer
  src/main.ts              page wiring: picker, timer, undo/reset, pointer events
  src/style.css            design tokens (light and dark), board styles
  public/puzzles/dev/      generated puzzles and index.json (also test fixtures)
docs/PLAN.md               this file
```

There's no backend in v1. Puzzles are generated offline and served as static JSON files. Player state will live in `localStorage`.

### Puzzle JSON (as implemented)

```json
{
  "size": 7,
  "endpoints": [{ "color": 0, "a": [0, 0], "b": [4, 2] }],
  "walls": [{ "cell": [2, 1], "side": "E" }],
  "bridges": [[3, 3]],
  "solution": [[0, 0, {"h": 1, "v": 2}]],
  "difficulty": null,
  "seed": 1000004
}
```

- Coordinates are `[row, col]`. Walls are stored only as `E` or `S`, so each one has a single canonical form. A wall piece is just several adjacent wall entries.
- Dev files contain one puzzle each. The daily format will wrap three of them: `{date, number, puzzles: [...]}`. The CLI already reads both shapes.
- The client checks a board against the **rules**, never against `solution`. `solution` is kept for debugging and `&reveal=1`.

---

## Generator pipeline (as built)

1. **Pick bridges.** Interior cells only, never next to each other.
2. **Place wall pieces.** Straight or L shapes of 1–3 segments. They can't touch each other or a bridge, and can't leave a cell with fewer than 2 open sides.
3. **Build the graph.** One node per cell, except each bridge becomes two nodes (H and V). Walls remove edges.
4. **Find a Hamiltonian path.** A depth-first search that visits the neighbour with the fewest onward options first. Each restart gets a small budget (20 steps per node, up to 200 restarts), because on odd-sized grids a start on the wrong cell colour can never succeed.
5. **Randomise it** with about 10 backbite moves per node.
6. **Smooth it.** Simulated annealing over backbite moves reduces the number of places where the path runs next to itself.
7. **Cut it into threads (exact).** Every self-touch and every bridge's H/V pair becomes a pair of positions that must end up in different threads. Dynamic programming counts every valid cutting and samples one uniformly. A valid cutting has threads of 3 cells up to about twice the average length, no endpoint on a bridge, no dead-straight thread, no separation pair inside one thread, and a colour count in the size's range. Returns None if no cutting is valid.
8. **Check uniqueness (SAT).** Variables are node colours and used edges. Each node has exactly one colour, endpoints have degree 1 and other nodes degree 2, a used edge forces the same colour on both ends, and a bridge's H and V must differ. Walls are passed as solver assumptions. Stray cycles that touch no endpoint are banned lazily as they appear. Banning the intended edge set and getting UNSAT means the puzzle is unique.
9. **Reject or keep.** Ambiguous puzzles are discarded (`repair = 0`). Each puzzle records its seed and can be regenerated exactly.

### Tuning knobs (`PROFILES` in `model.py`)

`colors`, `max_blocks` (only used in the legacy `detours="any"` mode), `pieces`, `piece_len`, `bridges`, `smooth`, `repair`, `detours`.

### Current performance

| Size | Time per puzzle | Wall segments seen |
|---|---|---|
| 5×5 | ~0.02s | 0–3 |
| 7×7 | ~0.1s | 1–4 |
| 9×9 | ~0.3s | 2–8 |

A year of daily sets takes a few minutes.

### What we learned
- **Almost all ambiguity comes from a thread folding against itself**: single-colour 2×2 blocks and U-turns. When folds were filtered out, almost no walls were needed. When folds were allowed, the walls needed roughly equalled the fold count. That's why walls became designed pieces and folds were banned outright.
- **Random Hamiltonian paths are full of hairpins.** Random cuts can't fix that. Smoothing plus exact dynamic-programming cutting can, and made 9×9 more than 10× faster.
- **The search budget matters on odd-sized grids** (see step 4).

---

## Frontend (as built)

- **Look:** a woven textile. The board is undyed flax on chambray (light) or indigo cloth on indigo night (dark). Threads are dyed yarn with ply bands. Endpoints are knots in 11 natural-dye colours, each with a cross-stitch symbol for colour-blind players. Walls are walnut bars (birch in dark mode). Bridges are drawn as a real over/under, with the vertical thread on top. The font is Schibsted Grotesk.
- **Input** (pointer events, so mouse and touch share one code path):
  - Drag from an endpoint to start or restart that thread. Tapping an endpoint clears it.
  - Drag from a loose end, or from the middle of a thread, to continue it from there.
  - Dragging back over your own thread shortens it.
  - Dragging into another thread cuts it, and it grows back if you back out within the same drag.
  - Moves are blocked by walls, other endpoints, turning on a bridge, and crossing yourself on a bridge.
  - Fast drags fill in skipped cells along a straight line or an L.
  - Reaching the matching endpoint locks the thread, with a pulse and a short vibration.
- **Controls:** Undo (also ⌘Z), Reset (counted), and a timer that starts on the first move and pauses when the tab is hidden. When solved, the page shows "Solved in m:ss" and a Next puzzle button.

---

## Testing

- **Generator (pytest):** the SAT counter must agree with a brute-force solver on random 4×4 and 5×5 puzzles (unique, 2 and 3+ solutions, with and without bridges). Property tests on generated puzzles check: unique, every node covered once, threads of 3+ cells, no endpoint on a bridge, bridge colours differ, counts within the profile, **no self-touches or straight threads**, walls never block the solution or touch a bridge. Also a JSON round trip and that the same seed gives the same puzzle.
- **Web (vitest, 35 tests):** every dev fixture's solution passes the rule checker, plus input state machine tests (extend, shorten, straight-line fill, walls, cut and regrow, bridge rules, tap to clear).
- **Manual:** a 5×5 with a bridge and a wall was solved with real mouse drags in Chrome (light mode). Dark mode was checked visually.

---

## Next steps

### M3: daily ladder
- `generate.py schedule --start YYYY-MM-DD --days N --out web/public/puzzles`. Write `puzzles/YYYY-MM-DD.json` with three puzzles, and number days from launch Wordle-style ("#142").
- Client: fetch by local date, play 5 → 7 → 9 back to back with a short solved moment between, then a results screen (three times, total, resets, streak, countdown to the next puzzle).
- Share text, with no solution spoilers:
  ```
  Weave #142  ⏱ 3:12
  🟩 5×5  0:21
  🟨 7×7  1:04
  🟥 9×9  1:47
  🔥 12
  ```
  Use `navigator.share`, falling back to the clipboard.
- In `localStorage`, wrapped in try/catch: the in-progress board and timer (restored when the player returns), streak, best times and a histogram of times.

### M4: grading and scheduling
- A solver that uses only rules a person would apply: forced moves, corners and dead ends, regions cut off from the endpoints that need them, bridges going straight. Score how many cells it resolves and how many one-step lookaheads it needs. Reject puzzles that need deep guessing.
- Use the score to build each day's set so difficulty rises steadily and stays similar from week to week.

### M5: polish
- A one-screen first-time guide with a tiny animated example, a PWA icon, and deploy to any static host.
- **Test on a real phone** (touch dragging and layout at 360px).

---

## Open questions
- Should resets, or a future hint button, affect the score?
- Is a daily leaderboard wanted later? It would need a small backend.
- Should every 5×5 have at least one wall? It currently has none about half the time.
- Are long threads OK? On 9×9 a thread can wind through about 20 cells. A lower length cap is an easy lever if that feels like busywork.
- Should puzzle filenames be salted hashes, so players can't look ahead? This was acceptable to skip for v1.
- Name.

## Things not to do
- Don't use Flow Free's name, look or levels.
- Don't build a backend for v1.
- Don't let the client compare the board to `solution`. Check the rules.
