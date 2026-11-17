// "How to play": small example boards drawn with the game's own renderer.
// guide.test.ts runs every example through the rule checker, so the pictures
// can't drift from the rules they illustrate.
import { Geometry, type Paths, type Puzzle } from "./puzzle";
import { render } from "./render";

const ep = (color: number, a: [number, number], b: [number, number]) => ({ color, a, b });

/** 4×4, three threads. */
const BASIC: Puzzle = {
  size: 4,
  endpoints: [ep(0, [0, 0], [1, 3]), ep(1, [1, 0], [2, 3]), ep(2, [1, 1], [2, 1])],
  walls: [],
  bridges: [],
  difficulty: null,
};

/** 3×3 with a two-segment wall: the red knots touch, but only across the wall. */
const WALL: Puzzle = {
  size: 3,
  endpoints: [ep(0, [0, 0], [1, 0]), ep(1, [2, 0], [2, 2])],
  walls: [
    { cell: [0, 0], side: "S" },
    { cell: [0, 1], side: "S" },
  ],
  bridges: [],
  difficulty: null,
};

/** 4×4 with one bridge. */
const BRIDGE: Puzzle = {
  size: 4,
  endpoints: [ep(0, [1, 0], [0, 2]), ep(1, [0, 0], [3, 3]), ep(2, [2, 0], [3, 2])],
  walls: [],
  bridges: [[1, 1]],
  difficulty: null,
};

export interface Example {
  puzzle: Puzzle;
  paths: Paths;
  verdict: "puzzle" | "ok" | "bad";
  caption: string;
  mark?: string; // overrides the default ✓/✗ wording
  breaks?: string; // for "bad": the checker error it must produce
}

export const SECTIONS: { title: string; text: string; examples: Example[] }[] = [
  {
    title: "Join the knots",
    text: "Drag from a knot to lay a thread to the other knot of the same colour. Threads move up, down, left and right, and can't overlap or branch. The puzzle is solved when every pair is joined and every square is filled.",
    examples: [
      { puzzle: BASIC, paths: [[], [], []], verdict: "puzzle", caption: "The puzzle." },
      {
        puzzle: BASIC,
        paths: [
          [0, 1, 2, 3, 7],
          [4, 8, 12, 13, 14, 15, 11],
          [5, 6, 10, 9],
        ],
        verdict: "ok",
        mark: "Solved.",
        caption: "Every pair joined, every square filled.",
      },
    ],
  },
  {
    title: "Walls",
    text: "Walls are the wooden bars between squares. A thread can't cross one, so two knots side by side may still need the long way round.",
    examples: [
      {
        puzzle: WALL,
        paths: [
          [0, 1, 2, 5, 4, 3],
          [6, 7, 8],
        ],
        verdict: "ok",
        caption: "Round the end of the wall.",
      },
      {
        puzzle: WALL,
        paths: [[0, 1, 4, 3], []],
        verdict: "bad",
        caption: "Cutting through a wall.",
        breaks: "crosses a wall",
      },
    ],
  },
  {
    title: "Bridges",
    text: "A bridge carries two threads at once: one straight across and one straight down, woven over and under. Threads can't turn on a bridge, the two must be different colours, and a bridge only counts as filled once both are in place.",
    examples: [
      { puzzle: BRIDGE, paths: [[], [], []], verdict: "puzzle", caption: "An empty bridge." },
      {
        puzzle: BRIDGE,
        paths: [
          [4, 5, 6, 7, 3, 2],
          [0, 1, 5, 9, 10, 11, 15],
          [8, 12, 13, 14],
        ],
        verdict: "ok",
        caption: "One across, one down.",
      },
      {
        puzzle: BRIDGE,
        paths: [[4, 5, 1], [], []],
        verdict: "bad",
        caption: "Turning on a bridge.",
        breaks: "turns on a bridge",
      },
    ],
  },
];

const MOVES = [
  "Drag back over a thread to shorten it.",
  "Drag from the middle of a thread to redraw it from there.",
  "Tap a knot to clear its thread.",
  "Undo steps back one move. Reset clears the board, and resets are counted in your result.",
];

const MARK = { ok: ["ok", "✓", "Allowed."], bad: ["bad", "✗", "Not allowed."] } as const;

function mark(x: Example): string {
  if (x.verdict === "puzzle") return "";
  const [cls, glyph, word] = MARK[x.verdict];
  return `<span class="verdict ${cls}">${glyph} ${x.mark ?? word}</span> `;
}

function figure(x: Example): string {
  const svg = render(new Geometry(x.puzzle), x.paths, { solved: false, pulse: new Set() }).replace(
    /aria-label="[^"]*"/,
    'aria-hidden="true"',
  );
  return `<figure class="fig"><div class="fig-board">${svg}</div><figcaption>${mark(x)}${x.caption}</figcaption></figure>`;
}

export function guideHTML(): string {
  const sections = SECTIONS.map(
    (s) =>
      `<section class="guide-section"><h3>${s.title}</h3><p>${s.text}</p>` +
      `<div class="figs" style="--count:${s.examples.length}">${s.examples.map(figure).join("")}</div></section>`,
  ).join("");
  return `<div class="guide-inner">
    <div class="guide-top">
      <h2 id="guide-title">How to play</h2>
      <button type="button" class="close" data-close aria-label="Close">×</button>
    </div>
    <p class="lede">Each day has three puzzles: a 5×5, a 7×7 and a 9×9, on one clock. The clock stops while this guide is open.</p>
    ${sections}
    <section class="guide-section"><h3>Handy moves</h3><ul>${MOVES.map((m) => `<li>${m}</li>`).join("")}</ul></section>
    <button type="button" class="primary" data-close>Got it</button>
  </div>`;
}
