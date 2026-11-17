import { describe, expect, it } from "vitest";
import { dateKey, dayLabel, dayNumber, fmt, fmtCountdown, freshRecord, msToMidnight, prune, shareText, streak, type Save } from "./daily";

const done = (_day = 0, onTime = true) => ({
  ...freshRecord(),
  stage: 3,
  times: [21_456, 64_009, 107_999],
  onTime,
});

describe("dates", () => {
  it("uses the local calendar date", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("counts down to local midnight", () => {
    expect(msToMidnight(new Date(2026, 10, 17, 23, 59, 30))).toBe(30_000);
    expect(fmtCountdown(3_600_000 + 61_000)).toBe("1:01:01");
  });
});

describe("day number", () => {
  it("counts from the launch date as #1", () => {
    expect(dayNumber("2026-11-17", "2026-11-17")).toBe(1);
    expect(dayNumber("2027-01-15", "2026-11-17")).toBe(60);
  });
  it("is whole across a daylight-saving change", () => {
    expect(dayNumber("2027-04-10", "2027-03-20")).toBe(22);
    expect(dayNumber("2026-11-10", "2026-10-20")).toBe(22);
  });
  it("labels days before launch as a preview", () => {
    expect(dayNumber("2026-11-15", "2026-11-17")).toBe(-1);
    expect(dayLabel(-1)).toBe("Preview");
    expect(dayLabel(3)).toBe("#3");
  });
  it("shares a preview day without a number", () => {
    expect(shareText(done(), 0, [5, 7, 9], 0).split("\n")[0]).toBe("wovn preview  3:13.44");
  });
});

describe("streak", () => {
  const save = (days: Record<string, ReturnType<typeof done>>): Save => ({ v: 1, days });

  it("counts consecutive finished days ending today", () => {
    const s = save({ "2026-11-15": done(1), "2026-11-16": done(2), "2026-11-17": done(3) });
    expect(streak(s, "2026-11-17")).toEqual({ current: 3, best: 3 });
  });
  it("keeps yesterday's streak alive until today is over", () => {
    const s = save({ "2026-11-15": done(1), "2026-11-16": done(2) });
    expect(streak(s, "2026-11-17").current).toBe(2);
    expect(streak(s, "2026-11-18").current).toBe(0);
  });
  it("ignores unfinished days and days finished after midnight", () => {
    const s = save({
      "2026-11-14": done(1),
      "2026-11-15": { ...done(2), stage: 2 },
      "2026-11-16": done(3, false),
      "2026-11-17": done(4),
    });
    expect(streak(s, "2026-11-17")).toEqual({ current: 1, best: 1 });
  });
  it("crosses month and year ends", () => {
    const s = save({ "2026-12-31": done(1), "2027-01-01": done(2) });
    expect(streak(s, "2027-01-01")).toEqual({ current: 2, best: 2 });
  });
});

describe("share text", () => {
  it("gives times only, never the board", () => {
    expect(shareText(done(), 142, [5, 7, 9], 12)).toBe(
      ["wovn #142  3:13.44", "▫️ 5×5  0:21.45", "◽ 7×7  1:04.00", "◻️ 9×9  1:47.99", "🔥 12"].join("\n"),
    );
  });
  it("formats hundredths, rounding down", () => {
    expect(fmt(0)).toBe("0:00.00");
    expect(fmt(59_999)).toBe("0:59.99");
    expect(fmt(61_005)).toBe("1:01.00");
  });
});

describe("prune", () => {
  it("drops boards from past days but keeps times", () => {
    const old = { ...done(1), solved: [[[0, 1]]], board: { paths: [], elapsed: 0, resets: 0 } };
    const today = { ...done(2), solved: [[[0, 1]]] };
    const s = prune({ v: 1, days: { "2026-11-16": old, "2026-11-17": today } }, "2026-11-17");
    expect(s.days["2026-11-16"].solved).toEqual([]);
    expect(s.days["2026-11-16"].board).toBeUndefined();
    expect(s.days["2026-11-16"].times).toEqual(old.times);
    expect(s.days["2026-11-17"].solved.length).toBe(1);
  });
});
