"""Daily sets: shape, numbering, determinism, and never overwriting played days."""

import json
from datetime import date

from wovn_gen.io import puzzle_from_json
from wovn_gen.sat import count_solutions
from wovn_gen.schedule import make_day, schedule

LAUNCH = date(2026, 11, 17)


def test_day_shape_and_numbering():
    d = make_day(date(2026, 11, 19), LAUNCH)
    assert d["date"] == "2026-11-19" and d["number"] == 3
    assert [p["size"] for p in d["puzzles"]] == [5, 7, 9]
    for p in d["puzzles"]:
        assert len(count_solutions(puzzle_from_json(p), limit=2)) == 1


def test_same_date_same_puzzles():
    assert make_day(LAUNCH, LAUNCH) == make_day(LAUNCH, LAUNCH)
    assert make_day(LAUNCH, LAUNCH)["puzzles"] != make_day(date(2026, 11, 18), LAUNCH)["puzzles"]


def test_schedule_keeps_existing_days(tmp_path):
    list(schedule(LAUNCH, LAUNCH, 2, tmp_path))
    first = tmp_path / "2026-11-17.json"
    first.write_text('{"sentinel": true}')
    results = list(schedule(LAUNCH, LAUNCH, 3, tmp_path))
    assert [wrote for _, _, wrote in results] == [False, False, True]
    assert json.loads(first.read_text()) == {"sentinel": True}
