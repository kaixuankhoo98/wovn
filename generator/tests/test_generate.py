"""Properties every generated puzzle must satisfy."""

import json

import pytest

from wovn_gen.generate import generate_many
from wovn_gen.io import puzzle_from_json, puzzle_to_json
from wovn_gen.model import PROFILES
from wovn_gen.sat import count_solutions
from wovn_gen.segment import quality


def _puzzles(size, count, seed):
    return [p for p, _ in generate_many(size, count, seed)]


@pytest.mark.parametrize("size,count", [(5, 12), (7, 10), (9, 6)])
def test_generated_puzzle_properties(size, count):
    prof = PROFILES[size]
    for p in _puzzles(size, count, seed=7):
        g = p.grid
        # unique
        sols = count_solutions(p, limit=2)
        assert len(sols) == 1 and sols[0] == p.solution_edges()
        # every node covered exactly once, segments >= 3 nodes
        seen = [n for path in p.paths for n in path]
        assert sorted(seen) == list(range(g.num_nodes))
        assert all(len(path) >= 3 for path in p.paths)
        # endpoints never on bridges; bridges carry two different colours
        for ep in p.endpoints:
            assert ep.a not in g.bridges and ep.b not in g.bridges
        colors = p.node_colors()
        for b in g.bridges:
            h, v = g.bridge_nodes(b)
            assert colors[h] != colors[v]
        # counts within the profile
        assert prof.bridges[0] <= len(g.bridges) <= prof.bridges[1]
        assert prof.pieces[0] <= p.stats["pieces"] <= prof.pieces[1]
        assert p.stats["repair"] <= prof.repair
        assert prof.colors[0] <= len(p.endpoints) <= prof.colors[1]
        # no detours: a thread never runs alongside itself without a wall between
        adj = g.adjacency(p.wall_edges())
        q = quality(p.paths, g, adj)
        assert q.touches == 0 and q.straights == 0
        # walls never cut the solution, never touch a bridge
        assert not (p.wall_edges() & p.solution_edges())
        for r, c, side in p.walls:
            other = (r, c + 1) if side == "E" else (r + 1, c)
            assert (r, c) not in g.bridges and other not in g.bridges


def test_json_round_trip_and_determinism():
    a = _puzzles(7, 3, seed=11)
    b = _puzzles(7, 3, seed=11)
    for p, q in zip(a, b):
        d = puzzle_to_json(p)
        assert d == puzzle_to_json(q)  # same seed, same puzzle
        back = puzzle_from_json(json.loads(json.dumps(d)))
        assert puzzle_to_json(back) == d
