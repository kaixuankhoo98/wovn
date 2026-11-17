"""Cut a Hamiltonian path into coloured segments and apply quality filters."""

from __future__ import annotations

import random
from dataclasses import dataclass

from .model import Grid


def separation_pairs(path: list[int], grid: Grid, adj: list[list[int]], detours: str) -> list[tuple[int, int]]:
    """Index pairs (i, j), i < j, that must end up in different segments:
    self-touches (open edges between non-consecutive path nodes), filtered by
    the detour rule, plus the two halves of every bridge."""
    pos = {v: i for i, v in enumerate(path)}
    pairs = []
    if detours != "any":
        for v, i in pos.items():
            for w in adj[v]:
                j = pos[w]
                if j - i > 1 and (detours == "none" or j - i == 3):
                    pairs.append((i, j))
    for b in grid.bridges:
        h, v = sorted((pos[x] for x in grid.bridge_nodes(b)))
        pairs.append((h, v))
    return pairs


def cut_path(
    path: list[int],
    grid: Grid,
    rng: random.Random,
    adj: list[list[int]],
    colors: tuple[int, int],
    detours: str = "none",
    min_len: int = 3,
) -> list[list[int]] | None:
    """Cut the path into k coloured segments, k in `colors`, sampled uniformly
    from every valid cutting. A segment [a, b) is valid if it is min_len..max_len
    long, doesn't start or end on a bridge node, isn't dead straight, and
    contains no separation pair. Dynamic programming counts the cuttings,
    then one is drawn at random. Returns None if no valid cutting exists."""
    n = len(path)
    k_lo, k_hi = colors
    max_len = max(min_len + 2, (2 * n + k_lo - 1) // k_lo)
    cells = [grid.cell_of(v) for v in path]
    is_bridge = [grid.is_bridge_node(v) for v in path]

    # first_conflict[a] = smallest j over pairs (i, j) with i >= a: a segment
    # starting at a must end before index j.
    first_conflict = [n] * (n + 1)
    for i, j in separation_pairs(path, grid, adj, detours):
        first_conflict[i] = min(first_conflict[i], j)
    for a in range(n - 1, -1, -1):
        first_conflict[a] = min(first_conflict[a], first_conflict[a + 1])

    def valid(a: int, b: int) -> bool:
        if not min_len <= b - a <= max_len or b > first_conflict[a]:
            return False
        if is_bridge[a] or is_bridge[b - 1]:
            return False
        seg = cells[a:b]
        return len({r for r, _ in seg}) > 1 and len({c for _, c in seg}) > 1

    ok = {(a, b) for b in range(1, n + 1) for a in range(max(0, b - max_len), b - min_len + 1) if valid(a, b)}
    # ways[c][b] = number of ways to cut path[:b] into c valid segments
    ways = [[0] * (n + 1) for _ in range(k_hi + 1)]
    ways[0][0] = 1
    for c in range(1, k_hi + 1):
        for a, b in ok:
            if ways[c - 1][a]:
                ways[c][b] += ways[c - 1][a]
    feasible = [k for k in range(k_lo, k_hi + 1) if ways[k][n]]
    if not feasible:
        return None
    k = rng.choice(feasible)
    segs = []
    b = n
    for c in range(k, 0, -1):
        options = [(a, ways[c - 1][a]) for a in range(max(0, b - max_len), b) if (a, b) in ok and ways[c - 1][a]]
        pick = rng.randrange(sum(w for _, w in options))
        for a, w in options:
            if pick < w:
                break
            pick -= w
        segs.append(path[a:b])
        b = a
    segs.reverse()
    return segs


@dataclass
class Quality:
    blocks: int  # single-colour 2x2 blocks
    straights: int  # dead-straight segments
    touches: int  # a segment running alongside itself with no wall between
    uturns: int  # the tightest touch: a 2-cell detour (left, down, right)


def quality(segs: list[list[int]], grid: Grid, adj: list[list[int]] | None = None) -> Quality:
    n = grid.size
    color: dict[tuple[int, int], int] = {}
    for k, s in enumerate(segs):
        for v in s:
            cell = grid.cell_of(v)
            if cell not in grid.bridges:
                color[cell] = k
    blocks = 0
    for r in range(n - 1):
        for c in range(n - 1):
            cells = [(r, c), (r + 1, c), (r, c + 1), (r + 1, c + 1)]
            if all(x in color for x in cells) and len({color[x] for x in cells}) == 1:
                blocks += 1
    straights = 0
    for s in segs:
        cells = [grid.cell_of(v) for v in s]
        if len({r for r, _ in cells}) == 1 or len({c for _, c in cells}) == 1:
            straights += 1
    touches = uturns = 0
    if adj is not None:
        for s in segs:
            pos = {v: i for i, v in enumerate(s)}
            for v, i in pos.items():
                for w in adj[v]:
                    j = pos.get(w)
                    if j is not None and j - i > 1:
                        touches += 1
                        uturns += j - i == 3
    return Quality(blocks, straights, touches, uturns)


def passes_filters(segs: list[list[int]], grid: Grid, adj: list[list[int]], max_blocks: int, detours: str) -> bool:
    """Final sanity check (the cutter already enforces these)."""
    q = quality(segs, grid, adj)
    if q.straights:
        return False
    if detours == "none":
        return q.touches == 0
    if detours == "no-uturns":
        return q.uturns == 0
    return q.blocks <= max_blocks
