// SVG board: a loom of undyed cloth, dyed threads for paths, knots for
// endpoints, wooden bars for walls, and over/under crossings for bridges.
import type { Geometry, Paths } from "./puzzle";

export const CELL = 100;
const PAD = 18;
const THREAD = 36;

// Cross-stitch motifs, one per colour, drawn at the knot centre (unit ~ 1 = 10px).
const MOTIFS: string[] = [
  "M-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z", // dot
  "M0 -11L10 7H-10Z", // triangle
  "M-8 -8H8V8H-8Z", // square
  "M0 -12L11 0L0 12L-11 0Z", // diamond
  "M-3.5 -11H3.5V-3.5H11V3.5H3.5V11H-3.5V3.5H-11V-3.5H-3.5Z", // plus
  "M-10 -5L-5 -10L0 -5L5 -10L10 -5L5 0L10 5L5 10L0 5L-5 10L-10 5L-5 0Z", // cross
  "M0 -12L3.5 -4H12L5 1.5L8 10L0 4.5L-8 10L-5 1.5L-12 -4H-3.5Z", // star
  "M-11 0a11 11 0 1 0 22 0a11 11 0 1 0 -22 0ZM-5.5 0a5.5 5.5 0 1 1 11 0a5.5 5.5 0 1 1 -11 0Z", // ring
  "M-12 -4H12V4H-12Z", // bar
  "M-11 -2L0 -11L11 -2V5L0 -4L-11 5Z", // chevron
  "M-10 -6L0 -12L10 -6V6L0 12L-10 6Z", // hexagon
];

const center = (geo: Geometry, i: number): [number, number] => {
  const [r, c] = geo.rc(i);
  return [c * CELL + CELL / 2, r * CELL + CELL / 2];
};

function threadPath(geo: Geometry, p: number[]): string {
  return p.map((cell, i) => `${i ? "L" : "M"}${center(geo, cell).join(" ")}`).join("");
}

/** A thread: a dark edge, the dyed body, then ply bands that suggest twisted yarn. */
function thread(d: string, k: number, extra = ""): string {
  return (
    `<path d="${d}" class="edge" stroke-width="${THREAD + 4}" ${extra}/>` +
    `<path d="${d}" class="thread" style="stroke:var(--dye-${k})" stroke-width="${THREAD}" ${extra}/>` +
    `<path d="${d}" class="ply" stroke-width="${THREAD - 8}" ${extra}/>`
  );
}

export interface RenderOpts {
  solved: boolean;
  pulse: Set<number>; // colours tied by the latest move
}

export function render(geo: Geometry, paths: Paths, opts: RenderOpts): string {
  const n = geo.size;
  const W = n * CELL;
  const out: string[] = [];
  out.push(
    `<svg viewBox="${-PAD} ${-PAD} ${W + 2 * PAD} ${W + 2 * PAD}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${n} by ${n} puzzle board">`,
    `<defs>
      <pattern id="weave" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" class="cloth"/>
        <rect x="0" y="1.5" width="6" height="3" class="weft"/>
        <rect x="6" y="7.5" width="6" height="3" class="weft"/>
        <rect x="7.5" y="0" width="3" height="6" class="warp"/>
        <rect x="1.5" y="6" width="3" height="6" class="warp"/>
      </pattern>
    </defs>`,
    `<rect x="${-PAD / 2}" y="${-PAD / 2}" width="${W + PAD}" height="${W + PAD}" rx="10" class="frame"/>`,
    `<rect x="0" y="0" width="${W}" height="${W}" fill="url(#weave)"/>`,
  );

  // Loom lines between cells.
  for (let i = 1; i < n; i++) {
    out.push(`<line x1="${i * CELL}" y1="0" x2="${i * CELL}" y2="${W}" class="loom"/>`);
    out.push(`<line x1="0" y1="${i * CELL}" x2="${W}" y2="${i * CELL}" class="loom"/>`);
  }

  // Empty bridge sockets: a small woven cross, vertical over horizontal.
  for (const b of geo.bridgeCells) {
    const [x, y] = center(geo, b);
    out.push(
      `<g class="socket">
        <rect x="${x - 40}" y="${y - 12}" width="80" height="24" rx="12"/>
        <rect x="${x - 18}" y="${y - 40}" width="36" height="80" rx="12" class="gap"/>
        <rect x="${x - 12}" y="${y - 40}" width="24" height="80" rx="12"/>
      </g>`,
    );
  }

  // Threads.
  for (let k = 0; k < paths.length; k++) {
    const p = paths[k];
    if (p.length > 1) out.push(`<g class="strand${geo.isTied(k, p) ? " tied" : ""}">${thread(threadPath(geo, p), k)}</g>`);
  }

  // Over/under: re-lay each vertical bridge crossing on top with a gap either side.
  for (const b of geo.bridgeCells) {
    for (let k = 0; k < paths.length; k++) {
      const p = paths[k];
      const i = p.indexOf(b);
      if (i <= 0 || i >= p.length - 1 || geo.axis(p[i - 1], b) !== "v") continue;
      const [x, y] = center(geo, b);
      const d = `M${x} ${y - CELL / 2}V${y + CELL / 2}`;
      out.push(
        `<path d="M${x} ${y - 30}V${y + 30}" class="gap-stroke" stroke-width="${THREAD + 14}"/>`,
        `<g class="over">${thread(d, k, 'stroke-linecap="butt"')}</g>`,
      );
    }
  }

  // Walls: walnut bars on the cell edges. Round caps let L-shapes join cleanly.
  for (const w of geo.puzzle.walls) {
    const [r, c] = w.cell;
    const [x1, y1, x2, y2] =
      w.side === "E"
        ? [(c + 1) * CELL, r * CELL, (c + 1) * CELL, (r + 1) * CELL]
        : [c * CELL, (r + 1) * CELL, (c + 1) * CELL, (r + 1) * CELL];
    out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="wall"/>`);
  }

  // Knots (endpoints).
  for (let k = 0; k < geo.colors; k++) {
    const tied = geo.isTied(k, paths[k] ?? []);
    for (const e of geo.ends[k]) {
      const [x, y] = center(geo, e);
      out.push(
        `<g class="knot${tied ? " tied" : ""}" transform="translate(${x} ${y})"><g class="knot-body${opts.pulse.has(k) ? " pulse" : ""}">
          <circle r="36" style="fill:var(--dye-${k})"/>
          <circle r="36" class="knot-rim"/>
          <path d="${MOTIFS[k % MOTIFS.length]}" transform="scale(1.35)" style="fill:var(--ink-${k})"/>
        </g></g>`,
      );
    }
  }

  out.push(`</svg>`);
  if (opts.solved) out[0] = out[0].replace("<svg ", '<svg class="solved" ');
  return out.join("");
}

/** Map a pointer position to a cell index, or null if outside the board. */
export function cellAt(geo: Geometry, svg: SVGSVGElement, clientX: number, clientY: number): number | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  const c = Math.floor(pt.x / CELL);
  const r = Math.floor(pt.y / CELL);
  return geo.inBounds(r, c) ? geo.idx(r, c) : null;
}
