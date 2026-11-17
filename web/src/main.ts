import "./style.css";
import {
  dateKey,
  dayLabel,
  dayNumber,
  fmt,
  fmtClock,
  fmtCountdown,
  freshRecord,
  isDone,
  loadSave,
  msToMidnight,
  prune,
  shareText,
  streak,
  total,
  writeSave,
  type DayRecord,
  type DaySet,
} from "./daily";
import { LAUNCH } from "./config";
import { emptyState } from "./input";
import { Geometry, type Paths, type Puzzle } from "./puzzle";
import { render } from "./render";
import { Session } from "./session";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const boardEl = $<HTMLDivElement>("board");
const statusEl = $<HTMLParagraphElement>("status");
const nextBtn = $<HTMLButtonElement>("next");
const ladderEl = $<HTMLOListElement>("ladder");
const dayEl = $<HTMLParagraphElement>("day");
const playEl = $<HTMLElement>("play");
const resultsEl = $<HTMLElement>("results");
const gateEl = $<HTMLElement>("gate");

/** Show exactly one of the three screens; the header ladder only belongs with the board. */
function screen(which: "gate" | "play" | "results") {
  gateEl.hidden = which !== "gate";
  playEl.hidden = which !== "play";
  resultsEl.hidden = which !== "results";
  ladderEl.hidden = which !== "play";
}

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
// Feature flag for testing tools: on under `npm run dev`, or in any build with VITE_DEV_TOOLS=1.
const DEV_TOOLS = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "1";

let session: Session | null = null;
let onNext: () => void = () => {};

// --- shared board UI ---

function playStatus(s: Session) {
  const r = s.progress();
  const pct = Math.round((100 * r.filled) / r.total);
  return `${r.tied} of ${s.geo.colors} threads tied, ${pct}% of the cloth filled. <span class="time">${fmtClock(s.time())}</span>`;
}
const solvedStatus = (s: Session) =>
  `<strong>Solved in <span class="time">${fmt(s.time())}</span>.</strong> ${resetText(s.resets)}`;
const resetText = (n: number) => (n === 0 ? "No resets." : n === 1 ? "1 reset." : `${n} resets.`);

$("undo").addEventListener("click", () => session?.undo());
$("reset").addEventListener("click", () => session?.reset());
nextBtn.addEventListener("click", () => onNext());
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    session?.undo();
  }
});

/** A small framed cloth: the finished board, or a blank loom showing the grid size. */
function swatch(puzzle: Puzzle, paths: Paths | null): string {
  const geo = new Geometry(puzzle);
  const svg = render(geo, paths ?? emptyState(geo).paths, { solved: false, pulse: new Set() });
  return svg.replace(/aria-label="[^"]*"/, 'aria-hidden="true"');
}

/**
 * Copy text. The async Clipboard API needs HTTPS (and is missing on plain-HTTP
 * pages like a LAN dev server), so fall back to selecting a hidden textarea.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  // 16px stops iOS zooming in; fixed + transparent keeps it out of sight without leaving the viewport.
  ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;";
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS ignores select() alone
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

/** Move focus to the next action for keyboard users; on touch screens it only adds a stray ring. */
const focusAction = (el: HTMLElement) => {
  if (!matchMedia("(pointer: coarse)").matches) el.focus({ preventScroll: true });
};

// --- daily ladder ---

const longDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
};

async function daily() {
  const today = dateKey(new Date());
  let set: DaySet;
  const notice = (title: string, text: string) => {
    dayEl.textContent = longDate(today);
    screen("gate");
    $("gate-title").textContent = title;
    $("gate-text").textContent = text;
    $("begin").hidden = true;
  };
  let res: Response;
  try {
    res = await fetch(`${BASE}puzzles/daily/${today}.json`);
  } catch {
    notice("Can't load today's puzzle", "Check your connection, then reload the page.");
    return;
  }
  if (!res.ok) {
    notice(
      "No puzzle today",
      DEV_TOOLS
        ? `There's no file for ${today}. Run the generator's schedule command to add more days.`
        : "Today's puzzle isn't ready yet. Check back later.",
    );
    return;
  }
  set = await res.json();

  const save = prune(loadSave(), today);
  const rec: DayRecord = (save.days[set.date] ??= freshRecord(set.puzzles.length));
  const number = dayNumber(set.date, LAUNCH);
  const sizes = set.puzzles.map((p) => p.size);
  // Re-read before writing so another tab's days aren't clobbered; only today's record is ours.
  let cleared = false; // set by the dev tool below so pagehide can't save the day back
  const persist = () => {
    if (cleared) return;
    const latest = loadSave();
    latest.days[set.date] = rec;
    writeSave(latest);
  };
  dayEl.textContent = `${dayLabel(number)}, ${longDate(set.date)}`;

  const drawLadder = (current: number) => {
    ladderEl.innerHTML = set.puzzles
      .map((p, i) => {
        const done = rec.times[i] !== null;
        const cls = done ? "done" : i === current ? "current" : "upcoming";
        const label = `${p.size} by ${p.size}${done ? `, solved in ${fmt(rec.times[i]!)}` : i === current ? ", playing" : ""}`;
        return `<li class="swatch ${cls}" style="--n:${p.size}" aria-label="${label}"${i === current ? ' aria-current="step"' : ""}>${swatch(p, done ? rec.solved[i] : null)}</li>`;
      })
      .join("");
  };

  /** The three looms, large: blank until solved, then the finished cloth with its time. */
  const looms = (current: number) =>
    set.puzzles
      .map((p, i) => {
        const done = rec.times[i] !== null;
        const cls = done ? "done" : i === current ? "current" : "upcoming";
        const time = done ? ` <span class="time">${fmt(rec.times[i]!)}</span>` : "";
        return (
          `<li style="--n:${p.size}"${i === current ? ' aria-current="step"' : ""}>` +
          `<div class="swatch ${cls}">${swatch(p, done ? rec.solved[i] ?? null : null)}</div>` +
          `<span class="caption">${p.size}×${p.size}${time}</span></li>`
        );
      })
      .join("");

  /** Ask before a board appears, so the clock only runs while the player is ready. */
  const gate = (i: number) => {
    session?.destroy();
    session = null;
    screen("gate");
    const n = sizes[i];
    const begin = $<HTMLButtonElement>("begin");
    const paused = rec.board;
    if (paused) {
      $("gate-title").innerHTML = `Paused at <span class="time">${fmtClock(paused.elapsed)}</span>`;
      $("gate-text").textContent = `Your ${n}×${n} is as you left it.`;
      begin.textContent = `Resume ${n}×${n}`;
      $("gate-note").textContent = "The clock starts again when you tap Resume.";
    } else {
      $("gate-title").textContent = i === 0 ? "Ready to begin?" : `Ready for the ${n}×${n}?`;
      $("gate-text").textContent =
        i === 0
          ? "Join each pair of matching knots with one thread, and fill every square. Threads can't cross walls, and only cross each other straight over a bridge."
          : "";
      begin.textContent = `Start ${n}×${n}`;
      $("gate-note").textContent =
        i === 0
          ? "Three grids, one clock. It starts when you tap Start, and pauses if you leave the page."
          : "The clock starts when you tap Start.";
    }
    $("gate-looms").innerHTML = looms(i);
    begin.hidden = false;
    begin.onclick = () => {
      // Left open past midnight: load the new day instead of starting yesterday's.
      if (dateKey(new Date()) !== set.date && !paused && i === 0) return location.reload();
      play(i);
    };
    focusAction(begin);
  };

  const play = (i: number) => {
    session?.destroy();
    screen("play");
    nextBtn.hidden = true;
    drawLadder(i);
    session = null;
    session = new Session(boardEl, set.puzzles[i], {
      onChange: () => {
        if (!session) return;
        statusEl.innerHTML = session.solved ? solvedStatus(session) : playStatus(session);
        if (!session.solved) {
          rec.board = session.snapshot();
          persist();
        }
      },
      onSolved: () => {
        const s = session!;
        rec.times[i] = s.time();
        rec.resets[i] = s.resets;
        rec.solved[i] = s.snapshot().paths;
        delete rec.board;
        rec.stage = i + 1;
        if (isDone(rec)) rec.onTime = dateKey(new Date()) === set.date;
        persist();
        drawLadder(i + 1);
        const last = isDone(rec);
        nextBtn.textContent = last ? "See results" : `Start ${sizes[i + 1]}×${sizes[i + 1]}`;
        onNext = last ? results : () => play(i + 1);
        nextBtn.hidden = false;
        focusAction(nextBtn);
      },
    }, rec.board);
    statusEl.innerHTML = playStatus(session);
  };

  // Save the running time when the player leaves mid-puzzle.
  // Dev tool: wipe today's progress and start the set again. Vite drops this
  // block from production builds because DEV_TOOLS is a build-time constant.
  if (DEV_TOOLS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dev-tool";
    btn.textContent = "Clear today's progress (dev)";
    btn.addEventListener("click", () => {
      cleared = true;
      session?.destroy();
      const latest = loadSave();
      delete latest.days[set.date];
      writeSave(latest);
      location.reload();
    });
    document.querySelector(".page")!.append(btn);
  }

  addEventListener("pagehide", () => {
    if (session && !session.solved && !isDone(rec)) {
      rec.board = session.snapshot();
      persist();
    }
  });

  let countdown: number | undefined;
  const results = () => {
    session?.destroy();
    session = null;
    screen("results");

    const { current, best } = streak(save, today);
    $("headline").innerHTML = `Woven in <span class="time">${fmt(total(rec))}</span>`;
    $("samples").innerHTML = looms(-1);
    const resets = rec.resets.reduce((a, b) => a + b, 0);
    const parts = [resetText(resets)];
    if (rec.onTime === false) parts.push("You finished after midnight, so this day doesn't count toward your streak.");
    else parts.push(`Streak: ${current === 1 ? "1 day" : `${current} days`}${best > current ? `, best ${best}` : ""}.`);
    $("summary").textContent = parts.join(" ");

    const shareBtn = $<HTMLButtonElement>("share");
    const shareStatus = $("share-status");
    shareBtn.onclick = async () => {
      const text = shareText(rec, number, sizes, rec.onTime === false ? 0 : current);
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        try {
          await navigator.share({ text });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      if (await copyText(text)) {
        shareStatus.textContent = "Result copied. Paste it anywhere.";
      } else {
        shareStatus.textContent = "Couldn't reach the clipboard. Here's your result to copy by hand:";
        shareStatus.insertAdjacentHTML("beforeend", `<pre class="share-text"></pre>`);
        shareStatus.querySelector("pre")!.textContent = text;
      }
    };

    const tickCountdown = () => {
      const ms = msToMidnight(new Date());
      $("countdown").textContent = fmtCountdown(ms);
      if (dateKey(new Date()) !== today) location.reload();
    };
    window.clearInterval(countdown);
    tickCountdown();
    countdown = window.setInterval(tickCountdown, 1000);
  };

  if (isDone(rec)) results();
  else gate(rec.stage);
}

// --- dev mode: ?dev or ?p=<file> opens the generator's dev puzzles with a picker ---

async function dev() {
  const DEV = `${BASE}puzzles/dev/`;
  const picker = $<HTMLSelectElement>("picker");
  $("picker-wrap").hidden = false;
  screen("play");
  ladderEl.hidden = true;
  dayEl.textContent = "Dev puzzles";
  let files: string[];
  try {
    files = await fetch(DEV + "index.json").then((r) => r.json());
  } catch {
    statusEl.textContent = "No dev puzzles found. Run the generator's make command to create some.";
    return;
  }
  const label = (f: string) => {
    const m = f.match(/^(\d+)-s\d+-(\d+)\.json$/);
    return m ? `${m[1]} × ${m[1]}, puzzle ${Number(m[2])}` : f;
  };
  picker.innerHTML = files.map((f) => `<option value="${f}">${label(f)}</option>`).join("");

  const select = async (file: string) => {
    const puzzle: Puzzle = await fetch(DEV + file).then((r) => r.json());
    picker.value = file;
    const url = new URL(location.href);
    url.searchParams.set("p", file);
    history.replaceState(null, "", url);
    session?.destroy();
    session = null;
    nextBtn.hidden = true;
    const i = files.indexOf(file);
    session = new Session(
      boardEl,
      puzzle,
      {
        onChange: () => session && (statusEl.innerHTML = session.solved ? solvedStatus(session) : playStatus(session)),
        onSolved: () => {
          nextBtn.textContent = "Next puzzle";
          nextBtn.hidden = i >= files.length - 1;
          onNext = () => select(files[i + 1]);
        },
      },
      undefined,
      params.get("reveal") === "1",
    );
    statusEl.innerHTML = session.solved ? solvedStatus(session) : playStatus(session);
  };
  picker.addEventListener("change", () => select(picker.value));
  const wanted = params.get("p");
  await select(wanted && files.includes(wanted) ? wanted : files[0]);
}

if (params.has("dev") || params.has("p")) dev();
else daily();
