import "./style.css";
import { check } from "./checker";
import { down, emptyState, move, up, type InputState } from "./input";
import { Geometry, solutionToPaths, type Paths, type Puzzle } from "./puzzle";
import { cellAt, render } from "./render";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardEl = $<HTMLDivElement>("board");
const picker = $<HTMLSelectElement>("picker");
const metaEl = $<HTMLParagraphElement>("meta");
const statusEl = $<HTMLParagraphElement>("status");
const nextBtn = $<HTMLButtonElement>("next");

const BASE = `${import.meta.env.BASE_URL}puzzles/dev/`;
const params = new URLSearchParams(location.search);

let files: string[] = [];
let geo: Geometry;
let state: InputState;
let undoStack: Paths[] = [];
let resets = 0;
let solved = false;
// timer: runs from the first move, pauses while the tab is hidden
let elapsed = 0;
let runningSince: number | null = null;
let tick: number | undefined;

const label = (f: string) => {
  const m = f.match(/^(\d+)-s\d+-(\d+)\.json$/);
  return m ? `${m[1]} × ${m[1]}, puzzle ${Number(m[2])}` : f;
};
const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const now = () => elapsed + (runningSince === null ? 0 : performance.now() - runningSince);
const startTimer = () => {
  if (runningSince === null && !solved && !document.hidden) {
    runningSince = performance.now();
    tick = window.setInterval(updateStatus, 500);
  }
};
const stopTimer = () => {
  if (runningSince !== null) elapsed += performance.now() - runningSince;
  runningSince = null;
  window.clearInterval(tick);
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopTimer();
  else if (elapsed > 0 && !solved) startTimer();
});

function tiedSet(paths: Paths): Set<number> {
  const s = new Set<number>();
  paths.forEach((p, k) => geo.isTied(k, p) && s.add(k));
  return s;
}

function draw(pulse = new Set<number>()) {
  boardEl.innerHTML = render(geo, state.paths, { solved, pulse });
}

function updateStatus() {
  const r = check(geo, state.paths);
  if (solved) {
    statusEl.innerHTML = `<strong>Solved in <span class="time">${fmt(now())}</span>.</strong> ${resets === 1 ? "1 reset" : `${resets} resets`}.`;
    return;
  }
  const pct = Math.round((100 * r.filled) / r.total);
  statusEl.innerHTML = `${r.tied} of ${geo.colors} threads tied, ${pct}% of the cloth filled. <span class="time">${fmt(now())}</span>`;
}

function commit(next: InputState, pulse?: Set<number>) {
  state = next;
  const r = check(geo, state.paths);
  if (r.solved && !solved) {
    solved = true;
    stopTimer();
    nextBtn.hidden = files.indexOf(picker.value) >= files.length - 1;
    navigator.vibrate?.([12, 40, 24]);
  }
  draw(pulse);
  updateStatus();
}

// --- pointer input ---
let pointer: number | null = null;
let lastCell: number | null = null;

boardEl.addEventListener("pointerdown", (e) => {
  if (solved || pointer !== null) return;
  const svg = boardEl.querySelector("svg")!;
  const cell = cellAt(geo, svg, e.clientX, e.clientY);
  if (cell === null) return;
  const next = down(geo, state, cell);
  if (next.active === null) return;
  e.preventDefault();
  pointer = e.pointerId;
  lastCell = cell;
  boardEl.setPointerCapture(e.pointerId);
  undoStack.push(state.paths.map((p) => [...p]));
  startTimer();
  commit(next);
});

boardEl.addEventListener("pointermove", (e) => {
  if (e.pointerId !== pointer) return;
  const svg = boardEl.querySelector("svg")!;
  const cell = cellAt(geo, svg, e.clientX, e.clientY);
  if (cell === null || cell === lastCell) return;
  lastCell = cell;
  const before = tiedSet(state.paths);
  const next = move(geo, state, cell);
  if (next === state) return;
  const fresh = new Set([...tiedSet(next.paths)].filter((k) => !before.has(k)));
  if (fresh.size) navigator.vibrate?.(12);
  commit(next, fresh);
});

const release = (e: PointerEvent) => {
  if (e.pointerId !== pointer) return;
  pointer = null;
  lastCell = null;
  const next = up(geo, state);
  // A drag that changed nothing shouldn't fill the undo stack.
  if (JSON.stringify(next.paths) === JSON.stringify(undoStack[undoStack.length - 1])) undoStack.pop();
  commit(next);
};
boardEl.addEventListener("pointerup", release);
boardEl.addEventListener("pointercancel", release);

// --- buttons ---
function undo() {
  if (solved || pointer !== null || !undoStack.length) return;
  commit({ ...state, paths: undoStack.pop()! });
}
$("undo").addEventListener("click", undo);
$("reset").addEventListener("click", () => {
  if (solved || state.paths.every((p) => !p.length)) return;
  undoStack.push(state.paths.map((p) => [...p]));
  resets++;
  commit(emptyState(geo));
});
nextBtn.addEventListener("click", () => {
  const i = files.indexOf(picker.value);
  if (i < files.length - 1) select(files[i + 1]);
});
picker.addEventListener("change", () => select(picker.value));
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    undo();
  }
});

// --- loading ---
async function select(file: string) {
  const puzzle: Puzzle = await fetch(BASE + file).then((r) => r.json());
  picker.value = file;
  const url = new URL(location.href);
  url.searchParams.set("p", file);
  window.history.replaceState(null, "", url);
  geo = new Geometry(puzzle);
  state = emptyState(geo);
  undoStack = [];
  resets = 0;
  solved = false;
  nextBtn.hidden = true;
  stopTimer();
  elapsed = 0;
  if (params.get("reveal") === "1" && puzzle.solution) state = { ...state, paths: solutionToPaths(geo) };
  const walls = puzzle.walls.length;
  const bridges = puzzle.bridges.length;
  metaEl.textContent =
    `${geo.colors} threads, ${walls} wall ${walls === 1 ? "segment" : "segments"}, ` +
    `${bridges} ${bridges === 1 ? "bridge" : "bridges"}`;
  commit(state);
}

async function init() {
  try {
    files = await fetch(BASE + "index.json").then((r) => r.json());
  } catch {
    statusEl.textContent = "No puzzles found. Run the generator's make command to create some.";
    return;
  }
  picker.innerHTML = files.map((f) => `<option value="${f}">${label(f)}</option>`).join("");
  const wanted = params.get("p");
  await select(wanted && files.includes(wanted) ? wanted : files[0]);
}
init();
