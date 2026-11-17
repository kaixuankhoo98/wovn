"""ASCII rendering: endpoints uppercase, path cells lowercase.
A bridge shows as `h+v` (the horizontal path's letter, '+', the vertical one's)."""

from __future__ import annotations

from .model import Puzzle

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def render(p: Puzzle, show_solution: bool = True) -> str:
    g = p.grid
    n = g.size
    walls = set(p.walls)
    ends = {}
    for ep in p.endpoints:
        ends[ep.a] = ends[ep.b] = LETTERS[ep.color]
    colors = p.node_colors() if (show_solution and p.paths) else {}

    def letter(node: int) -> str:
        k = colors.get(node)
        return LETTERS[k].lower() if k is not None else " "

    def content(r: int, c: int) -> str:
        if (r, c) in ends:
            return f" {ends[(r, c)]} "
        if (r, c) in g.bridges:
            h, v = g.bridge_nodes((r, c))
            return f"{letter(h)}+{letter(v)}"
        k = colors.get(g.node((r, c), "h"))
        return f" {LETTERS[k].lower()} " if k is not None else " . "

    lines = ["+" + "---+" * n]
    for r in range(n):
        row = "|"
        for c in range(n):
            row += content(r, c)
            row += "|" if c == n - 1 or (r, c, "E") in walls else " "
        lines.append(row)
        sep = "+"
        for c in range(n):
            sep += "---" if r == n - 1 or (r, c, "S") in walls else "   "
            sep += "+"
        lines.append(sep)
    return "\n".join(lines)
