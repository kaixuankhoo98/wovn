"""Exhaustive solver for tiny puzzles, used to cross-check the SAT counter."""

from __future__ import annotations

from weave_gen.model import Puzzle


def brute_solutions(p: Puzzle, limit: int = 3) -> int:
    g = p.grid
    adj = g.adjacency(p.wall_edges())
    n = g.num_nodes
    partner: dict[int, int] = {}
    for b in g.bridges:
        h, v = g.bridge_nodes(b)
        partner[h], partner[v] = v, h
    color: list[int | None] = [None] * n
    pairs = []
    for ep in p.endpoints:
        a, b = g.node(ep.a, "h"), g.node(ep.b, "h")
        color[a] = color[b] = ep.color
        pairs.append((ep.color, a, b))
    count = 0

    def route(i: int) -> None:
        nonlocal count
        if count >= limit:
            return
        if i == len(pairs):
            if all(c is not None for c in color):
                count += 1
            return
        k, a, b = pairs[i]

        def dfs(v: int) -> None:
            for w in adj[v]:
                if count >= limit:
                    return
                if w == b:
                    route(i + 1)
                elif color[w] is None and (w not in partner or color[partner[w]] != k):
                    color[w] = k
                    dfs(w)
                    color[w] = None

        dfs(a)

    route(0)
    return count
