"""The SAT counter must agree with exhaustive search on small grids."""

import random

import pytest

from brute import brute_solutions
from wovn_gen.generate import pick_bridges
from wovn_gen.hamilton import backbite, find_hamiltonian_path
from wovn_gen.model import Endpoint, Grid, Puzzle
from wovn_gen.sat import count_solutions
from wovn_gen.segment import cut_path
from wovn_gen.walls import place_pieces


def random_instance(size: int, seed: int) -> Puzzle | None:
    """A solvable puzzle with random walls and bridges (not necessarily unique)."""
    rng = random.Random(seed)
    bridges = pick_bridges(size, rng.randint(0, 1), rng)
    grid = Grid(size, bridges)
    pieces = place_pieces(grid, rng.randint(0, 2), (1, 2), rng) or []
    fixed = {grid.edge_index[k] for piece in pieces for k in piece}
    adj = grid.adjacency(fixed)
    path = find_hamiltonian_path(adj, rng)
    if path is None:
        return None
    path = backbite(path, adj, rng, 10 * grid.num_nodes)
    k = rng.randint(2, 4)
    segs = cut_path(path, grid, rng, adj, (k, k), detours="any")
    if segs is None:
        return None
    eps = [Endpoint(i, grid.cell_of(s[0]), grid.cell_of(s[-1])) for i, s in enumerate(segs)]
    p = Puzzle(grid, eps, walls=[grid.edge_keys[i] for i in fixed], paths=segs)
    # sprinkle a few extra walls the intended solution doesn't use
    unused = sorted(set(range(len(grid.edges))) - p.solution_edges() - fixed)
    p.walls += [grid.edge_keys[i] for i in rng.sample(unused, min(len(unused), rng.randint(0, 3)))]
    return p


@pytest.mark.parametrize("size", [4, 5])
def test_sat_count_matches_brute_force(size):
    checked = bridged = 0
    for seed in range(400):
        p = random_instance(size, seed)
        if p is None:
            continue
        expected = brute_solutions(p, limit=3)
        got = len(count_solutions(p, limit=3))
        assert got == expected, f"seed {seed}: sat={got} brute={expected}"
        assert expected >= 1  # the intended solution always exists
        checked += 1
        bridged += bool(p.grid.bridges)
        if checked >= 60:
            break
    assert checked >= 40 and bridged >= 5
