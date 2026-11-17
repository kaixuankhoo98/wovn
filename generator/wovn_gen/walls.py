"""Walls: designed pieces placed up front, plus optional repair walls.

Geometry: walls lie on the lattice lines between cells. Lattice point (i, j)
is the corner above-left of cell (i, j). A vertical unit segment (i,j)-(i+1,j)
separates cells (i, j-1) and (i, j) -> key (i, j-1, "E"). A horizontal unit
segment (i,j)-(i,j+1) separates cells (i-1, j) and (i, j) -> key (i-1, j, "S").
Pieces are chains of such segments: straight, or one 90-degree turn (an L).
"""

from __future__ import annotations

import random

from .model import EdgeKey, Grid, Puzzle
from .sat import SolutionSearch

DIRS = {"N": (-1, 0), "S": (1, 0), "W": (0, -1), "E": (0, 1)}
TURNS = {"N": "EW", "S": "EW", "E": "NS", "W": "NS"}


def _segment_key(n: int, p: tuple[int, int], d: str) -> EdgeKey | None:
    """Edge key of the unit lattice segment leaving point p in direction d,
    or None if it lies on the border / outside the grid."""
    i, j = p
    di, dj = DIRS[d]
    q = (i + di, j + dj)
    if not (0 <= q[0] <= n and 0 <= q[1] <= n):
        return None
    if dj == 0:  # vertical segment on line x=j
        top = min(i, q[0])
        if not 1 <= j <= n - 1:
            return None
        return (top, j - 1, "E")
    left = min(j, q[1])  # horizontal segment on line y=i
    if not 1 <= i <= n - 1:
        return None
    return (i - 1, left, "S")


def random_piece(n: int, length: int, rng: random.Random) -> list[EdgeKey] | None:
    """A straight or L-shaped chain of `length` unit segments."""
    p = (rng.randint(0, n), rng.randint(0, n))
    d = rng.choice("NSEW")
    turn_at = rng.randint(1, length - 1) if length >= 2 and rng.random() < 0.5 else None
    keys = []
    for step in range(length):
        if step == turn_at:
            d = rng.choice(TURNS[d])
        k = _segment_key(n, p, d)
        if k is None:
            return None
        keys.append(k)
        p = (p[0] + DIRS[d][0], p[1] + DIRS[d][1])
    return keys


def _cells_of(key: EdgeKey) -> tuple[tuple[int, int], tuple[int, int]]:
    r, c, side = key
    return ((r, c), (r, c + 1)) if side == "E" else ((r, c), (r + 1, c))


def place_pieces(
    grid: Grid, count: int, length_range: tuple[int, int], rng: random.Random, tries: int = 200
) -> list[list[EdgeKey]] | None:
    """Place `count` non-touching pieces. Rejects pieces that touch a bridge
    cell or leave any cell with fewer than two open sides."""
    n = grid.size
    pieces: list[list[EdgeKey]] = []
    used: set[EdgeKey] = set()
    used_cells: set[tuple[int, int]] = set()
    for _ in range(tries):
        if len(pieces) == count:
            break
        piece = random_piece(n, rng.randint(*length_range), rng)
        if piece is None or len(set(piece)) != len(piece):
            continue
        cells = {c for k in piece for c in _cells_of(k)}
        if cells & grid.bridges or cells & used_cells:
            continue  # keep pieces apart and away from bridges
        trial = used | set(piece)
        blocked = {grid.edge_index[k] for k in trial}
        adj = grid.adjacency(blocked)
        if any(len(adj[grid.node(c, "h")]) < 2 for c in cells):
            continue
        pieces.append(piece)
        used = trial
        used_cells |= cells
    return pieces if len(pieces) == count else None


def make_unique(
    puzzle: Puzzle, rng: random.Random, max_extra: int, fixed: set[int] = frozenset()
) -> list[int] | None:
    """Minimal extra wall edge ids (on top of `fixed`) making `puzzle.paths`
    the unique solution, or None if more than `max_extra` are needed."""
    intended = puzzle.solution_edges()
    search = SolutionSearch(puzzle)
    search.ban(intended)  # every remaining solution is an alternative
    try:
        walls: list[int] = []
        while (alt := search.next_solution(set(fixed) | set(walls))) is not None:
            if len(walls) >= max_extra * 3:  # also covers max_extra == 0
                return None
            walls.append(rng.choice(sorted(alt - intended)))
        order = list(walls)
        rng.shuffle(order)
        for w in order:
            if search.next_solution(set(fixed) | (set(walls) - {w})) is None:
                walls.remove(w)
        return walls if len(walls) <= max_extra else None
    finally:
        search.close()
