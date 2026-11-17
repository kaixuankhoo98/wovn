import { describe, expect, it } from "vitest";
import { check } from "./checker";
import { SECTIONS } from "./guide";
import { Geometry } from "./puzzle";

describe("guide examples obey the rules they illustrate", () => {
  for (const s of SECTIONS)
    for (const x of s.examples) {
      it(`${s.title}: ${x.caption}`, () => {
        const r = check(new Geometry(x.puzzle), x.paths);
        if (x.verdict === "ok") {
          expect(r.errors).toEqual([]);
          expect(r.solved).toBe(true);
        } else if (x.verdict === "bad") {
          expect(r.errors.length).toBeGreaterThan(0);
          expect(r.errors.every((e) => e.includes(x.breaks!))).toBe(true);
        } else {
          expect(r.errors).toEqual([]);
          expect(r.filled).toBe(0);
        }
      });
    }
});
