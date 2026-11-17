"""End-to-end generation of a single puzzle from a seed."""

from __future__ import annotations

import random

from .hamilton import backbite, find_hamiltonian_path, smooth
from .model import PROFILES, Endpoint, Grid, Profile, Puzzle
from .segment import cut_path, passes_filters
from .walls import make_unique, place_pieces


def pick_bridges(size: int, count: int, rng: random.Random) -> frozenset | None:
    interior = [(r, c) for r in range(1, size - 1) for c in range(1, size - 1)]
    rng.shuffle(interior)
    chosen: list[tuple[int, int]] = []
    for cell in interior:
        if len(chosen) == count:
            break
        if all(abs(cell[0] - b[0]) + abs(cell[1] - b[1]) > 1 for b in chosen):
            chosen.append(cell)
    return frozenset(chosen) if len(chosen) == count else None


def generate(
    size: int,
    seed: int,
    bridges: int | None = None,
    colors: int | None = None,
    profile: Profile | None = None,
    repair: int | None = None,
) -> Puzzle | None:
    """One attempt. Returns None if this seed doesn't yield a valid puzzle."""
    prof = profile or PROFILES[size]
    rng = random.Random(seed)
    nb = bridges if bridges is not None else rng.randint(*prof.bridges)
    bset = pick_bridges(size, nb, rng)
    if bset is None:
        return None
    grid = Grid(size, bset)
    pieces = place_pieces(grid, rng.randint(*prof.pieces), prof.piece_len, rng)
    if pieces is None:
        return None
    fixed = {grid.edge_index[k] for piece in pieces for k in piece}
    adj = grid.adjacency(fixed)
    path = find_hamiltonian_path(adj, rng)
    if path is None:
        return None
    path = backbite(path, adj, rng, moves=10 * grid.num_nodes)
    k_range = (colors, colors) if colors is not None else prof.colors
    window = grid.num_nodes // k_range[0] + 2
    path = smooth(path, adj, rng, window, steps=prof.smooth * grid.num_nodes)
    segs = cut_path(path, grid, rng, adj, k_range, prof.detours)
    if segs is None or not passes_filters(segs, grid, adj, prof.max_blocks, prof.detours):
        return None
    endpoints = [
        Endpoint(i, grid.cell_of(s[0]), grid.cell_of(s[-1])) for i, s in enumerate(segs)
    ]
    puzzle = Puzzle(grid, endpoints, paths=segs, seed=seed)
    extra = make_unique(puzzle, rng, prof.repair if repair is None else repair, fixed)
    if extra is None:
        return None
    puzzle.walls = sorted(grid.edge_keys[i] for i in fixed | set(extra))
    puzzle.stats = {"pieces": len(pieces), "piece_segments": len(fixed), "repair": len(extra)}
    return puzzle


def generate_many(
    size: int, count: int, seed: int, bridges: int | None = None, repair: int | None = None, max_attempts: int = 100_000
):
    """Yield (puzzle, attempts_used) until `count` puzzles are found."""
    made = 0
    for attempt in range(max_attempts):
        if made >= count:
            return
        p = generate(size, seed * 1_000_000 + attempt, bridges, repair=repair)
        if p is not None:
            made += 1
            yield p, attempt + 1
