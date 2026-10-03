"""Separate line and branch gates; pytest-cov's aggregate gate is insufficient."""

import json
import sys
from pathlib import Path

report = json.loads(
    Path(sys.argv[1] if len(sys.argv) > 1 else "backend/coverage.json").read_text()
)["totals"]
line = report["covered_lines"] / report["num_statements"] * 100
branch = (
    report["covered_branches"] / report["num_branches"] * 100 if report["num_branches"] else 100
)
print(f"Python core: {line:.2f}% lines / {branch:.2f}% branches")
if line < 95 or branch < 90:
    raise SystemExit("Core coverage gate failed (95% line / 90% branch).")
