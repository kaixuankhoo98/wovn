// Daily ladder logic with no DOM: dates, saved progress, streaks, share text.
import type { Paths, Puzzle } from "./puzzle";
import type { Snapshot } from "./session";

export interface DaySet {
  date: string; // YYYY-MM-DD
  puzzles: Puzzle[]; // 5x5, 7x7, 9x9
}

export interface DayRecord {
  stage: number; // index of the puzzle being played; puzzles.length when done
  times: (number | null)[]; // ms per solved puzzle
  resets: number[];
  solved: Paths[]; // finished boards, for the swatches (dropped for past days)
  board?: Snapshot; // the in-progress board for `stage`
  onTime?: boolean; // all three solved on the puzzle's own date
}

export interface Save {
  v: 1;
  days: Record<string, DayRecord>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date as YYYY-MM-DD. */
export const dateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseKey = (k: string): Date => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const shift = (k: string, days: number): string => {
  const d = parseKey(k);
  d.setDate(d.getDate() + days);
  return dateKey(d);
};

export function msToMidnight(now: Date): number {
  const m = new Date(now);
  m.setHours(24, 0, 0, 0);
  return m.getTime() - now.getTime();
}

/** Times are kept to the hundredth, rounded down, so the shown parts add up to the shown total. */
const centis = (ms: number) => Math.floor(ms / 10);

/** m:ss.cc for finished times. */
export function fmt(ms: number): string {
  const cs = centis(ms);
  const s = Math.floor(cs / 100);
  return `${Math.floor(s / 60)}:${pad(s % 60)}.${pad(cs % 100)}`;
}

/** m:ss for the running clock, which ticks twice a second. */
export function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** h:mm:ss for the countdown. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** Puzzle number for a date: the launch date is #1. Zero or less means before launch. */
export function dayNumber(date: string, launch: string): number {
  // Round, because a span crossing a daylight-saving change isn't a whole number of 24h days.
  return Math.round((parseKey(date).getTime() - parseKey(launch).getTime()) / 86_400_000) + 1;
}

/** "#12", or "Preview" for days before launch. */
export const dayLabel = (n: number) => (n >= 1 ? `#${n}` : "Preview");

export const freshRecord = (count = 3): DayRecord => ({
  stage: 0,
  times: Array(count).fill(null),
  resets: Array(count).fill(0),
  solved: [],
});

export const isDone = (r: DayRecord) => r.stage >= r.times.length;
export const total = (r: DayRecord) => r.times.reduce<number>((a, t) => a + centis(t ?? 0) * 10, 0);

/** A day counts toward the streak only when all three were solved on that date. */
export function streak(save: Save, today: string): { current: number; best: number } {
  const done = new Set(Object.keys(save.days).filter((k) => isDone(save.days[k]) && save.days[k].onTime));
  let best = 0;
  for (const k of done) {
    if (done.has(shift(k, -1))) continue; // not the start of a run
    let n = 0;
    while (done.has(shift(k, n))) n++;
    best = Math.max(best, n);
  }
  let current = 0;
  let k = done.has(today) ? today : shift(today, -1);
  while (done.has(k)) {
    current++;
    k = shift(k, -1);
  }
  return { current, best };
}

const SWATCH = ["▫️", "◽", "◻️"]; // small, medium, large: one per grid size

export function shareText(rec: DayRecord, number: number, sizes: number[], streakNow: number): string {
  const lines = [`wovn ${number >= 1 ? `#${number}` : "preview"}  ${fmt(total(rec))}`];
  sizes.forEach((n, i) => lines.push(`${SWATCH[i] ?? "◻️"} ${n}×${n}  ${fmt(rec.times[i] ?? 0)}`));
  if (streakNow > 0) lines.push(`🔥 ${streakNow}`);
  return lines.join("\n");
}

/** Past days keep only their times; boards are dropped to keep storage small. */
export function prune(save: Save, today: string): Save {
  for (const [k, r] of Object.entries(save.days)) {
    if (k < today) {
      r.solved = [];
      delete r.board;
    }
  }
  return save;
}

const KEY = "wovn:v1";

export function loadSave(): Save {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s?.v === 1 && s.days) return s;
  } catch {
    // storage blocked or corrupt: play without saving
  }
  return { v: 1, days: {} };
}

export function writeSave(s: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
