// Rule-based solved check. Never compares against the stored solution.
import type { Geometry, Paths } from "./puzzle";

export interface CheckResult {
  solved: boolean;
  tied: number; // colours whose path joins both endpoints
  filled: number; // cells fully covered (bridges need both axes)
  total: number;
  errors: string[];
}

export function check(geo: Geometry, paths: Paths): CheckResult {
  const errors: string[] = [];
  const slotOwner = new Map<string, number>();
  let tied = 0;

  for (let k = 0; k < geo.colors; k++) {
    const p = paths[k] ?? [];
    if (geo.isTied(k, p)) tied++;
    for (let i = 0; i < p.length; i++) {
      const cell = p[i];
      const ep = geo.endpointColor(cell);
      if (ep !== undefined && ep !== k) errors.push(`colour ${k} passes another colour's endpoint`);
      if (ep === k && i !== 0 && i !== p.length - 1) errors.push(`colour ${k} passes through its own endpoint`);
      if (i > 0) {
        const prev = p[i - 1];
        if (!geo.adjacent(prev, cell)) errors.push(`colour ${k} jumps`);
        else if (geo.blocked(prev, cell)) errors.push(`colour ${k} crosses a wall`);
      }
      if (geo.isBridge(cell)) {
        if (i === 0 || i === p.length - 1) errors.push(`colour ${k} ends on a bridge`);
        else if (geo.axis(p[i - 1], cell) !== geo.axis(cell, p[i + 1]))
          errors.push(`colour ${k} turns on a bridge`);
      }
      const s = geo.slot(p, i);
      if (slotOwner.has(s)) errors.push(`overlap at cell ${cell}`);
      slotOwner.set(s, k);
    }
  }

  let filled = 0;
  for (let i = 0; i < geo.cells; i++) {
    if (geo.isBridge(i)) {
      const h = slotOwner.get(`${i}h`);
      const v = slotOwner.get(`${i}v`);
      if (h !== undefined && v !== undefined) {
        if (h === v) errors.push(`bridge ${i} uses one colour twice`);
        else filled++;
      }
    } else if (slotOwner.has(`${i}`)) filled++;
  }

  const total = geo.cells;
  return {
    solved: errors.length === 0 && tied === geo.colors && filled === total,
    tied,
    filled,
    total,
    errors,
  };
}
