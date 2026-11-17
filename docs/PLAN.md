# wovn: plan and status

> A daily path-connecting logic puzzle in the Numberlink genre, with **walls** and **bridges**.
> Every day: three puzzles in order, **5×5 → 7×7 → 9×9**.

Last updated: 2026-11-17

---

## Where we're up to

| Milestone | Status |
|---|---|
| **M0** Generator spike (walls, uniqueness, ASCII output) | ✅ Done |
| **M1** Bridges | ✅ Done |
| **M2** Playable single grid (render, drag input, rule checker) | ✅ Done, but not yet tested on a real phone |
| **M3** Daily ladder (fetch by date, three grids, timer, results, share, streaks) | ✅ Done. 60 days scheduled (2026-11-17 to 2027-01-15) |
| **M4** Polish (first-time guide, animations, PWA, deploy) | ⬜ Next. Partly done: dark mode, colour-blind symbols and haptics already exist |

Difficulty grading was dropped for now (see decision 10). The repo is on GitHub (`kaixuankhoo98/wovn`, SSH remote).

### Run it

```sh
# generator (Python 3.12 via uv)
cd generator
uv run python -m wovn_gen make --size 9 --count 10 --seed 1   # writes ../web/public/puzzles/dev/
uv run python -m wovn_gen check ../web/public/puzzles/dev/*.json
uv run python -m wovn_gen show  ../web/public/puzzles/dev/9-s1-001.json [--blank]
uv run python -m wovn_gen schedule --start 2027-01-16 --days 60   # writes ../web/public/puzzles/daily/YYYY-MM-DD.json (start defaults to today)
uv run pytest

# web (Vite + plain TypeScript)
cd web
npm run dev          # opens today's set; ?dev (or ?p=<file>) opens the dev puzzles, &reveal=1 shows the solution
                     # dev tools ("Clear today's progress") show under npm run dev, or in a build with VITE_DEV_TOOLS=1
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

There's no way to fail. Scoring is based on time, and the number of resets is recorded. The share text never reveals the solution.

- **Day number:** derived in the client from `LAUNCH` in `web/src/config.ts` (currently 2026-11-17 = #1). Moving launch is that one line: puzzles are chosen by calendar date, so none change. Days before launch still play and show as "Preview" (share text says `wovn preview`).
- **Ready screen:** no board is shown until the player taps **Start 5×5**. The screen shows the three blank looms (no knots, so no free study time), a one-paragraph rules summary, and a note that the clock starts on Start. **The clock runs from when a board appears, not from the first move.**
- **Coming back:** partway through a grid gives "Paused at m:ss" and **Resume 7×7** (board hidden while paused). Between grids gives "Ready for the 7×7?" and **Start 7×7**. A finished day goes straight to results.
- **Between puzzles:** the solved board stays up until the player taps **Start 7×7** / **Start 9×9** / **See results**, which starts the next clock straight away.
- **Edge cases:** no file for today gives "No puzzle today"; a network failure gives "Can't load today's puzzle". A ready screen left open past midnight reloads into the new day on Start.
- **Streak:** a day counts only when all three are solved on that local date. Finishing after midnight still records the times but doesn't count toward the streak.
- **Only today's set** is playable. No archive yet.
- **Share text** (one swatch emoji per grid, getting bigger with the size):
  ```
  wovn #142  3:12.85
  ▫️ 5×5  0:21.40
  ◽ 7×7  1:04.12
  ◻️ 9×9  1:47.33
  🔥 12
  ```
- **Times:** finished times show hundredths (`m:ss.cc`, rounded down, and the total is the sum of the shown parts). The live clock shows whole seconds.

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
| 9 | Name is **wovn** (lowercase everywhere, including share text) | Decided 2026-11-17. |
| 10 | **No difficulty grading for now** | Your call. Daily sets are ordered by size only; revisit if days feel uneven. |
| 11 | Launch date lives in one place (`web/src/config.ts`), not in puzzle files | 2026-11-17 is a placeholder #1. Changing it is a one-line edit and a redeploy, no regeneration. |
| 12 | Streak needs all three solved on the day | Your call. |
| 13 | Only today's set is playable | Your call. Keeps v1 simple. |
| 14 | Manual "Start next" button between puzzles | Your call. Gives a moment to look at the solved cloth. |
| 15 | Share emoji are size swatches (▫️ ◽ ◻️), not grades | They stand for the 5, 7 and 9 grids. Easy to swap later. |
| 16 | `schedule` never overwrites an existing day unless `--force` | A day someone may have played must not change under them. |
| 17 | Ready screen before the first board; clock starts when a board is shown | Your call. Makes the time fair: nobody studies the board off the clock. |

---

## Architecture

```
generator/                 Python 3.12, uv, python-sat; runs offline
  wovn_gen/
    model.py               Grid, Puzzle, per-size PROFILES (all the tuning knobs)
    hamilton.py            Hamiltonian path search, backbite moves, anneal-based smoothing
    segment.py             cuts the path into threads; quality metrics
    sat.py                 uniqueness check
    walls.py               designed wall pieces, optional repair walls
    generate.py            one seed in, one puzzle out (or None)
    io.py, render.py       JSON in and out; ASCII renderer
    schedule.py            daily sets: deterministic seed per date and size
    cli.py                 make / check / show / schedule
  tests/                   brute-force cross-check and property tests
web/
  src/puzzle.ts            types, Geometry, solutionToPaths
  src/input.ts             pure drag state machine
  src/checker.ts           rule-based solved check
  src/render.ts            SVG textile renderer
  src/session.ts           one playable board: pointer input, undo/reset, timer, snapshot/restore
  src/daily.ts             no-DOM daily logic: dates, saved progress, streaks, share text
  src/config.ts            LAUNCH: the date of puzzle #1
  src/main.ts              page wiring: ready screen, daily ladder, results screen, dev picker
  src/style.css            design tokens (light and dark), board styles
  public/puzzles/dev/      generated puzzles and index.json (also test fixtures)
  public/puzzles/daily/    one file per date: {date, puzzles: [5x5, 7x7, 9x9]}
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
- Dev files contain one puzzle each. Daily files wrap three: `{date, puzzles: [...]}`. The CLI reads both shapes. The day number is not stored anywhere; the client derives it from `LAUNCH`.
- Daily seeds are `date.toordinal() * 10 + size`, so any day can be regenerated exactly.
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
- **Controls:** Undo (also ⌘Z), Reset (counted), and a timer that starts on the first move and pauses when the tab is hidden.
- **Daily ladder:** the page fetches `puzzles/daily/<local date>.json`. The header shows three **swatches** sized 5:7:9: the current one is ringed, upcoming ones are faded, solved ones show your finished cloth in miniature. Progress (stage, times, resets, solved boards and the in-progress board with its timer) is saved to `localStorage` under `wovn:v1` on every change and on `pagehide`, then restored on return. Each write re-reads storage and replaces only today's record, so two tabs don't clobber each other. Past days keep only their times.
- **Results:** a big "Woven in m:ss" headline, the three swatches large with their times, resets and streak in one sentence, **Share result** (`navigator.share` on touch devices, otherwise the clipboard, otherwise the text shown to copy by hand), and a countdown to local midnight that reloads into the new day.

---

## Testing

- **Generator (pytest):** the SAT counter must agree with a brute-force solver on random 4×4 and 5×5 puzzles (unique, 2 and 3+ solutions, with and without bridges). Property tests on generated puzzles check: unique, every node covered once, threads of 3+ cells, no endpoint on a bridge, bridge colours differ, counts within the profile, **no self-touches or straight threads**, walls never block the solution or touch a bridge. Also a JSON round trip and that the same seed gives the same puzzle.
- **Generator schedule tests:** day shape (no stored number), uniqueness of each daily puzzle, same date gives the same set, and existing days are never overwritten.
- **Web (vitest, 43 tests):** every dev fixture's solution passes the rule checker, input state machine tests (extend, shorten, straight-line fill, walls, cut and regrow, bridge rules, tap to clear), plus daily logic: local dates, day numbers (including across daylight saving and before launch), countdown, streaks (including unfinished days, finishing after midnight, month and year ends), share text and pruning.
- **Manual:** a 5×5 with a bridge and a wall was solved with real mouse drags in Chrome (light mode). Dark mode was checked visually. The full daily flow (restore mid-puzzle, solve, Start next, results, share to clipboard, reload on a finished day) was run in Chrome with pointer events, and the layout checked at 360px in both themes.

---

## Next steps

### M4: polish
- A one-screen first-time guide with a tiny animated example, a PWA icon, and deploy to any static host.
- **Test on a real phone** (touch dragging, the share sheet, and layout at 360px).
- Schedule more days before 2027-01-15 runs out: `schedule --start 2027-01-16 --days N`.

---

## Open questions
- Should resets, or a future hint button, affect the score?
- Is a daily leaderboard wanted later? It would need a small backend.
- What should the real launch date be? 2026-11-17 is a placeholder #1 (one line in `web/src/config.ts`).
- Should every 5×5 have at least one wall? It currently has none about half the time.
- Are long threads OK? On 9×9 a thread can wind through about 20 cells. A lower length cap is an easy lever if that feels like busywork.
- Should puzzle filenames be salted hashes, so players can't look ahead? This was acceptable to skip for v1.

## Things not to do
- Don't use Flow Free's name, look or levels.
- Don't build a backend for v1.
- Don't let the client compare the board to `solution`. Check the rules.
