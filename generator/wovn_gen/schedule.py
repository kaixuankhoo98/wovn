"""Daily sets: one file per date holding a 5x5, 7x7 and 9x9 puzzle."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from .generate import generate_many
from .io import puzzle_to_json

LADDER = (5, 7, 9)


def day_seed(day: date, size: int) -> int:
    """Deterministic per date and size, so any day can be regenerated exactly."""
    return day.toordinal() * 10 + size


def make_day(day: date, launch: date) -> dict[str, Any]:
    puzzles = []
    for size in LADDER:
        p, _ = next(generate_many(size, 1, day_seed(day, size)))
        puzzles.append(puzzle_to_json(p))
    return {"date": day.isoformat(), "number": (day - launch).days + 1, "puzzles": puzzles}


def schedule(launch: date, start: date, days: int, out: Path, force: bool = False):
    """Write daily/YYYY-MM-DD.json for each day. Existing files are kept unless
    `force`, so puzzles people may already have played never change."""
    out.mkdir(parents=True, exist_ok=True)
    for i in range(days):
        day = start + timedelta(days=i)
        path = out / f"{day.isoformat()}.json"
        if path.exists() and not force:
            yield day, path, False
            continue
        path.write_text(json.dumps(make_day(day, launch), separators=(",", ":")) + "\n")
        yield day, path, True
