"""JSON (de)serialisation in the format the web client reads."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .model import Endpoint, Grid, Puzzle


def puzzle_to_json(p: Puzzle) -> dict[str, Any]:
    g = p.grid
    out: dict[str, Any] = {
        "size": g.size,
        "endpoints": [
            {"color": ep.color, "a": list(ep.a), "b": list(ep.b)} for ep in p.endpoints
        ],
        "walls": [{"cell": [r, c], "side": s} for r, c, s in sorted(p.walls)],
        "bridges": [list(b) for b in sorted(g.bridges)],
    }
    if p.paths is not None:
        colors = p.node_colors()
        sol: list[list[Any]] = []
        for r in range(g.size):
            row: list[Any] = []
            for c in range(g.size):
                if (r, c) in g.bridges:
                    h, v = g.bridge_nodes((r, c))
                    row.append({"h": colors[h], "v": colors[v]})
                else:
                    row.append(colors[g.node((r, c), "h")])
            sol.append(row)
        out["solution"] = sol
    out["difficulty"] = p.difficulty
    if p.seed is not None:
        out["seed"] = p.seed
    return out


def puzzle_from_json(d: dict[str, Any]) -> Puzzle:
    if "puzzles" in d:  # daily wrapper: take the first
        d = d["puzzles"][0]
    grid = Grid(d["size"], frozenset(tuple(b) for b in d.get("bridges", [])))
    endpoints = [Endpoint(e["color"], tuple(e["a"]), tuple(e["b"])) for e in d["endpoints"]]
    walls = [(w["cell"][0], w["cell"][1], w["side"]) for w in d.get("walls", [])]
    p = Puzzle(grid, endpoints, walls, seed=d.get("seed"), difficulty=d.get("difficulty"))
    if "solution" in d:
        p.paths = _paths_from_solution(p, d["solution"])
    return p


def _paths_from_solution(p: Puzzle, sol: list[list[Any]]) -> list[list[int]] | None:
    """Recover each colour's node sequence: a DFS from endpoint a to b that
    covers every node of that colour (handles paths that touch themselves)."""
    g = p.grid
    adj = g.adjacency(p.wall_edges())
    node_color: dict[int, int] = {}
    for r in range(g.size):
        for c in range(g.size):
            v = sol[r][c]
            if isinstance(v, dict):
                h, vv = g.bridge_nodes((r, c))
                node_color[h], node_color[vv] = v["h"], v["v"]
            else:
                node_color[g.node((r, c), "h")] = v

    paths = []
    for ep in p.endpoints:
        k = ep.color
        target = sum(1 for x in node_color.values() if x == k)
        start, goal = g.node(ep.a, "h"), g.node(ep.b, "h")
        path = [start]
        seen = {start}

        def dfs(v: int) -> bool:
            if v == goal:
                return len(path) == target
            for w in adj[v]:
                if w not in seen and node_color.get(w) == k:
                    seen.add(w)
                    path.append(w)
                    if dfs(w):
                        return True
                    path.pop()
                    seen.discard(w)
            return False

        if not dfs(start):
            return None
        paths.append(path)
    return paths


def load(path: str | Path) -> Puzzle:
    return puzzle_from_json(json.loads(Path(path).read_text()))


def dump(p: Puzzle, path: str | Path) -> None:
    Path(path).write_text(json.dumps(puzzle_to_json(p), separators=(",", ":")) + "\n")
