"""Hamiltonian paths: find one (Warnsdorff DFS), then randomise it (backbite)."""

from __future__ import annotations

import random
import sys


def find_hamiltonian_path(
    adj: list[list[int]], rng: random.Random, budget: int | None = None, restarts: int = 200
) -> list[int] | None:
    n = len(adj)
    if budget is None:
        budget = n * 20
    sys.setrecursionlimit(max(10_000, n * 4))
    for _ in range(restarts):
        start = rng.randrange(n)
        visited = [False] * n
        path: list[int] = []
        steps = 0

        def free_degree(v: int) -> int:
            return sum(1 for w in adj[v] if not visited[w])

        def dfs(v: int) -> bool:
            nonlocal steps
            steps += 1
            if steps > budget:
                return False
            visited[v] = True
            path.append(v)
            if len(path) == n:
                return True
            nbrs = [w for w in adj[v] if not visited[w]]
            rng.shuffle(nbrs)
            nbrs.sort(key=free_degree)  # Warnsdorff, random tie-break
            for w in nbrs:
                if dfs(w):
                    return True
                if steps > budget:
                    break
            visited[v] = False
            path.pop()
            return False

        if dfs(start):
            return path
    return None


def backbite(path: list[int], adj: list[list[int]], rng: random.Random, moves: int) -> list[int]:
    p = list(path)
    n = len(p)
    pos = {v: i for i, v in enumerate(p)}
    for _ in range(moves):
        if rng.random() < 0.5:
            p.reverse()
            pos = {v: i for i, v in enumerate(p)}
        end = p[-1]
        w = rng.choice(adj[end])
        i = pos[w]
        if i == n - 2:
            continue
        # p[i] = w is adjacent to end: p[:i+1] + reversed(p[i+1:])
        tail = p[i + 1 :]
        tail.reverse()
        p[i + 1 :] = tail
        for j in range(i + 1, n):
            pos[p[j]] = j
    return p


def touch_score(path: list[int], edges: list[tuple[int, int]], window: int) -> int:
    """How often the path runs alongside itself: open (unwalled) edges joining
    two path nodes 3..window steps apart. Within one segment these are
    detours; the cutter can only break some of them."""
    pos = [0] * (max(path) + 1)
    for i, v in enumerate(path):
        pos[v] = i
    score = 0
    for u, v in edges:
        if 3 <= abs(pos[u] - pos[v]) <= window:
            score += 1
    return score


def smooth(
    path: list[int],
    adj: list[list[int]],
    rng: random.Random,
    window: int,
    steps: int,
    t_start: float = 2.0,
    t_end: float = 0.1,
) -> list[int]:
    """Simulated annealing over backbite moves toward fewer self-touches."""
    import math

    edges = [(u, v) for u in range(len(adj)) for v in adj[u] if u < v]
    cur = list(path)
    cur_s = touch_score(cur, edges, window)
    best, best_s = cur, cur_s
    for step in range(steps):
        temperature = t_start * (t_end / t_start) ** (step / steps)
        cand = backbite(cur, adj, rng, 1)
        s = touch_score(cand, edges, window)
        if s <= cur_s or rng.random() < math.exp((cur_s - s) / temperature):
            cur, cur_s = cand, s
            if s < best_s:
                best, best_s = cand, s
                if s == 0:
                    break
    return best
