"""Real-data route acceptance and cold/warm timing, plus bundled demo generation."""

import json
import platform
import time
from datetime import datetime
from pathlib import Path

import networkx as nx

from build_demo import build_demo
from shady.dataset import TO_LOCAL, load_dataset

ROOT = Path(__file__).resolve().parents[1]
t = time.monotonic()
ds = load_dataset(ROOT / "data/processed")
print("Loaded dataset", round(time.monotonic() - t, 2), "s", flush=True)
checks = [
    ("Stare Miasto", "Rynek Główny → Wawel", (19.9373, 50.0617), (19.9356, 50.0542)),
    (
        "Podgórze",
        "Rynek Podgórski → Plac Bohaterów Getta",
        (19.9500, 50.0441),
        (19.9548, 50.0467),
    ),
    ("Nowa Huta", "Plac Centralny → Aleja Róż", (20.0372, 50.0713), (20.0375, 50.0783)),
    ("Western Kraków", "Park Jordana → Błonia", (19.9167, 50.0636), (19.9081, 50.0589)),
    (
        "Cross district",
        "Rynek Główny → Plac Centralny",
        (19.9373, 50.0617),
        (20.0372, 50.0713),
    ),
]
report = {
    "machine": platform.platform(),
    "dataset_version": ds.manifest["dataset_version"],
    "nodes": len(ds.planner.graph),
    "edges": ds.planner.graph.number_of_edges(),
    "components": nx.number_weakly_connected_components(ds.planner.graph),
    "routes": [],
}
scenarios = []
for index, (district, title, start, end) in enumerate(checks):
    at = datetime.fromisoformat("2026-07-01T13:00:00+02:00")
    ds.planner.shade.cache.clear()
    ds.planner.shade.edge_cache.clear()
    try:
        t = time.monotonic()
        cold = ds.planner.plan(TO_LOCAL(*start), TO_LOCAL(*end), at)
        cold_s = time.monotonic() - t
        t = time.monotonic()
        warm = ds.planner.plan(TO_LOCAL(*start), TO_LOCAL(*end), at)
        warm_s = time.monotonic() - t
        assert cold == warm
        assert cold["routes"][1]["distance_m"] <= cold["routes"][0]["distance_m"] * 1.25 + 0.01
        for r in cold["routes"]:
            from shapely.geometry import shape

            assert ds.planner.boundary.covers(shape(r["geometry"]))
        row = {
            "district": district,
            "title": title,
            "cold_s": round(cold_s, 3),
            "warm_s": round(warm_s, 3),
            "cold_target_met": cold_s < 10,
            "warm_target_met": warm_s < 2,
            "distance_m": cold["routes"][0]["distance_m"],
            "shaded_distance_m": cold["routes"][1]["distance_m"],
            "sunny_m_saved": cold["sunny_m_saved"],
            "snap_offsets": [p["offset_m"] for p in cold["snapped_endpoints"]],
        }
        report["routes"].append(row)
        print(json.dumps(row), flush=True)
        (ROOT / "docs/benchmark.json").write_text(json.dumps(report, indent=2))
    except Exception as e:
        print("FAILED", district, type(e).__name__, str(e), flush=True)
        report["routes"].append({"district": district, "error": str(e)})
        (ROOT / "docs/benchmark.json").write_text(json.dumps(report, indent=2))
if any("error" in row for row in report["routes"]):
    raise SystemExit("City route acceptance failed; see docs/benchmark.json")
print("Complete", flush=True)


build_demo(ds)
