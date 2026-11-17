"""SAT-based uniqueness checking.

Encoding: c[n][k] (node n has colour k) and e[i] (graph edge i is used).
Walls are passed as assumptions (¬e[i]) so one solver can be reused while walls
are added and pruned. Degree constraints allow stray cycles that touch no
endpoint; these are banned lazily as they appear.
"""

from __future__ import annotations

from pysat.card import CardEnc, EncType
from pysat.formula import IDPool
from pysat.solvers import Solver

from .model import Puzzle


class SolutionSearch:
    def __init__(self, puzzle: Puzzle, solver_name: str = "g4"):
        self.puzzle = puzzle
        g = puzzle.grid
        self.grid = g
        self.k = len(puzzle.endpoints)
        self.endpoints = puzzle.endpoint_nodes()
        pool = IDPool()
        self.c = [[pool.id(("c", n, k)) for k in range(self.k)] for n in range(g.num_nodes)]
        self.e = [pool.id(("e", i)) for i in range(len(g.edges))]
        self.solver = Solver(name=solver_name)
        add = self.solver.add_clause

        def card_equals(lits: list[int], bound: int) -> None:
            if bound > len(lits):
                add([])  # impossible
                return
            enc = CardEnc.equals(lits=lits, bound=bound, vpool=pool, encoding=EncType.seqcounter)
            for cl in enc.clauses:
                add(cl)

        incident: list[list[int]] = [[] for _ in range(g.num_nodes)]
        for i, (u, v) in enumerate(g.edges):
            incident[u].append(i)
            incident[v].append(i)
        self.incident = incident

        for n in range(g.num_nodes):
            card_equals(self.c[n], 1)
            deg = 1 if n in self.endpoints else 2
            card_equals([self.e[i] for i in incident[n]], deg)
        for n, k in self.endpoints.items():
            add([self.c[n][k]])
        for i, (u, v) in enumerate(g.edges):
            for k in range(self.k):
                add([-self.e[i], -self.c[u][k], self.c[v][k]])
                add([-self.e[i], -self.c[v][k], self.c[u][k]])
        for b in g.bridges:
            h, v = g.bridge_nodes(b)
            for k in range(self.k):
                add([-self.c[h][k], -self.c[v][k]])

    def ban(self, edges: set[int]) -> None:
        self.solver.add_clause([-self.e[i] for i in edges])

    def _stray_cycles(self, used: set[int]) -> list[set[int]]:
        g = self.grid
        adj: dict[int, list[tuple[int, int]]] = {}
        for i in used:
            u, v = g.edges[i]
            adj.setdefault(u, []).append((v, i))
            adj.setdefault(v, []).append((u, i))
        seen: set[int] = set()
        cycles = []
        for start in adj:
            if start in seen:
                continue
            comp_edges: set[int] = set()
            has_endpoint = False
            stack = [start]
            seen.add(start)
            while stack:
                x = stack.pop()
                has_endpoint |= x in self.endpoints
                for y, i in adj[x]:
                    comp_edges.add(i)
                    if y not in seen:
                        seen.add(y)
                        stack.append(y)
            if not has_endpoint:
                cycles.append(comp_edges)
        return cycles

    def next_solution(self, walls: set[int] = frozenset()) -> set[int] | None:
        """A cycle-free solution (edge set) under the given walls, or None."""
        assumptions = [-self.e[i] for i in walls]
        while self.solver.solve(assumptions=assumptions):
            model = self.solver.get_model()
            used = {i for i, lit in enumerate(self.e) if model[lit - 1] > 0}
            cycles = self._stray_cycles(used)
            if not cycles:
                return used
            for cyc in cycles:
                self.ban(cyc)
        return None

    def close(self) -> None:
        self.solver.delete()


def count_solutions(puzzle: Puzzle, limit: int = 2) -> list[set[int]]:
    """Up to `limit` distinct solutions (edge sets) honouring the puzzle's walls."""
    s = SolutionSearch(puzzle)
    walls = puzzle.wall_edges()
    found = []
    try:
        while len(found) < limit:
            sol = s.next_solution(walls)
            if sol is None:
                break
            found.append(sol)
            s.ban(sol)
    finally:
        s.close()
    return found


def edges_to_paths(puzzle: Puzzle, edges: set[int]) -> list[list[int]]:
    """Recover per-colour node sequences from an edge set."""
    g = puzzle.grid
    adj: dict[int, list[int]] = {}
    for i in edges:
        u, v = g.edges[i]
        adj.setdefault(u, []).append(v)
        adj.setdefault(v, []).append(u)
    paths = []
    for ep in puzzle.endpoints:
        cur, prev = g.node(ep.a, "h"), None
        p = [cur]
        while True:
            nxt = [w for w in adj.get(cur, []) if w != prev]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            p.append(cur)
        paths.append(p)
    return paths
