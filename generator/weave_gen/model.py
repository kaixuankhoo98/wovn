"""Grid model: cells, walls, bridges, and the node graph the solver works on.

Every normal cell is one node. A bridge cell is split into two nodes: H (links
only to its left/right neighbours) and V (links only to its up/down neighbours).
Each graph edge corresponds to exactly one pair of orthogonally adjacent cells,
so an edge can be identified with the wall that would block it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property

Cell = tuple[int, int]
# A wall/edge key: the cell plus the side ("E" or "S") — canonical form.
EdgeKey = tuple[int, int, str]

@dataclass(frozen=True)
class Profile:
    """Generation knobs for one grid size.

    Walls are placed *first* as designed pieces (a straight run or an L of
    1-3 edge segments); the solution is then generated around them. If the
    result is ambiguous it is rejected, unless `repair` allows a few extra
    single-segment walls.
    """

    colors: tuple[int, int]
    max_blocks: int
    pieces: tuple[int, int]  # number of wall pieces placed up front
    piece_len: tuple[int, int]  # segments per piece
    bridges: tuple[int, int]  # number of bridge cells
    smooth: int
    repair: int = 0  # max extra single walls allowed to force uniqueness (0 = designed walls only)
    # Self-touching: "none" bans any detour where a thread runs alongside
    # itself with no wall between; "no-uturns" bans only the 2-cell U-turn.
    detours: str = "none"


PROFILES = {
    4: Profile((3, 4), 1, (0, 1), (1, 2), (0, 0), 60),
    5: Profile((4, 5), 2, (0, 1), (1, 3), (0, 1), 60),
    6: Profile((5, 6), 2, (1, 2), (1, 3), (0, 1), 40),
    7: Profile((6, 8), 3, (1, 2), (1, 3), (1, 2), 30),
    8: Profile((7, 9), 4, (2, 3), (1, 3), (1, 2), 30),
    9: Profile((8, 11), 6, (2, 3), (1, 3), (2, 3), 20),
}


@dataclass(frozen=True)
class Grid:
    size: int
    bridges: frozenset[Cell] = frozenset()

    @cached_property
    def bridge_index(self) -> dict[Cell, int]:
        return {b: i for i, b in enumerate(sorted(self.bridges))}

    @property
    def num_nodes(self) -> int:
        return self.size * self.size + len(self.bridges)

    def node(self, cell: Cell, axis: str) -> int:
        """Node used when a path passes `cell` along `axis` ('h' or 'v')."""
        r, c = cell
        if cell in self.bridges and axis == "v":
            return self.size * self.size + self.bridge_index[cell]
        return r * self.size + c

    def cell_of(self, node: int) -> Cell:
        n2 = self.size * self.size
        if node < n2:
            return divmod(node, self.size)
        return sorted(self.bridges)[node - n2]

    def is_bridge_node(self, node: int) -> bool:
        return self.cell_of(node) in self.bridges

    def bridge_nodes(self, cell: Cell) -> tuple[int, int]:
        return self.node(cell, "h"), self.node(cell, "v")

    @cached_property
    def edge_keys(self) -> list[EdgeKey]:
        n = self.size
        keys: list[EdgeKey] = []
        for r in range(n):
            for c in range(n):
                if c + 1 < n:
                    keys.append((r, c, "E"))
                if r + 1 < n:
                    keys.append((r, c, "S"))
        return keys

    @cached_property
    def edge_index(self) -> dict[EdgeKey, int]:
        return {k: i for i, k in enumerate(self.edge_keys)}

    @cached_property
    def edges(self) -> list[tuple[int, int]]:
        """Node pairs, parallel to `edge_keys`."""
        out = []
        for r, c, side in self.edge_keys:
            if side == "E":
                out.append((self.node((r, c), "h"), self.node((r, c + 1), "h")))
            else:
                out.append((self.node((r, c), "v"), self.node((r + 1, c), "v")))
        return out

    def adjacency(self, blocked: frozenset[int] | set[int] = frozenset()) -> list[list[int]]:
        adj: list[list[int]] = [[] for _ in range(self.num_nodes)]
        for i, (u, v) in enumerate(self.edges):
            if i in blocked:
                continue
            adj[u].append(v)
            adj[v].append(u)
        return adj

    @cached_property
    def blocks(self) -> list[tuple[int, int, int, int]]:
        """Node quadruples for every 2x2 block without a bridge cell."""
        n = self.size
        out = []
        for r in range(n - 1):
            for c in range(n - 1):
                cells = [(r, c), (r, c + 1), (r + 1, c), (r + 1, c + 1)]
                if not any(x in self.bridges for x in cells):
                    out.append(tuple(self.node(x, "h") for x in cells))
        return out

    def edge_between(self, u: int, v: int) -> int:
        return self._edge_lookup[(min(u, v), max(u, v))]

    @cached_property
    def _edge_lookup(self) -> dict[tuple[int, int], int]:
        return {(min(u, v), max(u, v)): i for i, (u, v) in enumerate(self.edges)}


@dataclass
class Endpoint:
    color: int
    a: Cell
    b: Cell


@dataclass
class Puzzle:
    grid: Grid
    endpoints: list[Endpoint]
    walls: list[EdgeKey] = field(default_factory=list)
    # Per-segment node sequences of the intended solution (optional).
    paths: list[list[int]] | None = None
    seed: int | None = None
    difficulty: float | None = None
    stats: dict | None = None

    @property
    def size(self) -> int:
        return self.grid.size

    def endpoint_nodes(self) -> dict[int, int]:
        """node -> colour for every endpoint node."""
        g = self.grid
        out = {}
        for ep in self.endpoints:
            out[g.node(ep.a, "h")] = ep.color
            out[g.node(ep.b, "h")] = ep.color
        return out

    def wall_edges(self) -> set[int]:
        return {self.grid.edge_index[w] for w in self.walls}

    def solution_edges(self) -> set[int]:
        assert self.paths is not None
        g = self.grid
        return {g.edge_between(p[i], p[i + 1]) for p in self.paths for i in range(len(p) - 1)}

    def node_colors(self) -> dict[int, int]:
        assert self.paths is not None
        return {n: k for k, p in enumerate(self.paths) for n in p}
