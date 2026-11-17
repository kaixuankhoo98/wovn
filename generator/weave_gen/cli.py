"""Command-line interface: make, check, show."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from .generate import generate_many
from .io import dump, load
from .render import render
from .sat import count_solutions


def cmd_make(a: argparse.Namespace) -> None:
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    last = 0
    for i, (p, attempts) in enumerate(generate_many(a.size, a.count, a.seed, a.bridges, a.repair)):
        name = f"{a.size}-s{a.seed}-{i + 1:03d}.json"
        dump(p, out / name)
        print(
            f"{name}: colours={len(p.endpoints)} walls={len(p.walls)} bridges={len(p.grid.bridges)} {p.stats} "
            f"(attempts {attempts - last})",
            file=sys.stderr,
        )
        last = attempts
        if a.print:
            print(render(p) + "\n")
    print(f"done in {time.time() - t0:.1f}s, {last} attempts", file=sys.stderr)
    _write_index(out)


def _write_index(out: Path) -> None:
    files = sorted(f.name for f in out.glob("*.json") if f.name != "index.json")
    (out / "index.json").write_text(json.dumps(files, indent=1) + "\n")


def _puzzle_files(files: list[str]) -> list[str]:
    return [f for f in files if Path(f).name != "index.json"]


def cmd_check(a: argparse.Namespace) -> None:
    bad = 0
    for f in _puzzle_files(a.files):
        p = load(f)
        sols = count_solutions(p, limit=2)
        verdict = {0: "NO SOLUTION", 1: "unique", 2: "MULTIPLE"}[len(sols)]
        print(f"{f}: {verdict}, colours={len(p.endpoints)} walls={len(p.walls)} "
              f"bridges={len(p.grid.bridges)} difficulty={p.difficulty}")
        bad += len(sols) != 1
    if bad:
        sys.exit(1)


def cmd_show(a: argparse.Namespace) -> None:
    for f in _puzzle_files(a.files):
        p = load(f)
        print(f"{f}")
        print(render(p, show_solution=not a.blank))
        print()


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(prog="weave_gen")
    sub = ap.add_subparsers(required=True)

    m = sub.add_parser("make", help="generate candidate puzzles")
    m.add_argument("--size", type=int, required=True)
    m.add_argument("--count", type=int, default=10)
    m.add_argument("--seed", type=int, default=1)
    m.add_argument("--bridges", type=int, default=None, help="override bridge count")
    m.add_argument("--repair", type=int, default=None, help="override max repair walls (0 = reject if not unique)")
    m.add_argument("--out", default="../web/public/puzzles/dev")
    m.add_argument("--print", action="store_true", help="print each puzzle as ASCII")
    m.set_defaults(fn=cmd_make)

    c = sub.add_parser("check", help="verify uniqueness")
    c.add_argument("files", nargs="+")
    c.set_defaults(fn=cmd_check)

    s = sub.add_parser("show", help="ASCII render")
    s.add_argument("files", nargs="+")
    s.add_argument("--blank", action="store_true", help="hide the solution")
    s.set_defaults(fn=cmd_show)

    a = ap.parse_args(argv)
    a.fn(a)
