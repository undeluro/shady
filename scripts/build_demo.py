"""Bundle real summer snapshots and a shared local vector basemap, never OSM tiles."""

import json
from datetime import datetime
from pathlib import Path

from shapely import union_all
from shapely.geometry import box, shape
from shapely.ops import transform

from shady.api import geographic_routes
from shady.dataset import TO_GEO, TO_LOCAL, load_dataset

ROOT = Path(__file__).resolve().parents[1]


def display_path(geometries, bounds):
    import math

    left, bottom, right, top = bounds
    cosine = math.cos((top + bottom) / 2 * math.pi / 180)

    def ring(coords, close=False):
        return " ".join(
            f"{'M' if i == 0 else 'L'}{(x - left) * cosine * 100000:.1f},{(top - y) * 100000:.1f}"
            for i, (x, y) in enumerate(coords)
        ) + ("Z" if close else "")

    paths = []
    for geometry in geometries:
        geo = transform(TO_GEO, geometry)
        if geo.geom_type == "Polygon":
            paths.append(ring(geo.exterior.coords, True))
            paths.extend(ring(r.coords, True) for r in geo.interiors)
        elif geo.geom_type == "LineString":
            paths.append(ring(geo.coords))
    return " ".join(paths)


def build_demo(ds):
    start, end = (19.9373, 50.0617), (19.9356, 50.0542)
    snapshots = []
    camera = None
    basemap = None
    for hour in (10, 13, 16):
        at = datetime.fromisoformat(f"2026-07-01T{hour}:00:00+02:00")
        result = ds.planner.plan(TO_LOCAL(*start), TO_LOCAL(*end), at)
        if camera is None:
            camera = box(
                *union_all([shape(route["geometry"]) for route in result["routes"]])
                .buffer(160)
                .bounds
            )
            area = camera.buffer(1800).envelope
            buildings = [
                b.geometry.intersection(area).simplify(2, preserve_topology=True)
                for b in ds.planner.shade.buildings
                if b.geometry.intersects(area)
            ]
            roads = [
                d["geometry"].intersection(area).simplify(0.5)
                for u, v, k, d in ds.planner.graph.edges(keys=True, data=True)
                if u < v and d["geometry"].intersects(area)
            ]
            bounds = list(transform(TO_GEO, camera).bounds)
            basemap = {
                "bounds": bounds,
                "buildingsPath": display_path(
                    [b for b in buildings if b.geom_type == "Polygon"], bounds
                ),
                "roadsPath": display_path(
                    [r for r in roads if r.geom_type == "LineString"], bounds
                ),
            }

        shadow = ds.planner.shade.geometry_for(area, at).simplify(2, preserve_topology=True)
        parts = [shadow] if shadow.geom_type == "Polygon" else getattr(shadow, "geoms", [])
        snapshots.append(
            {
                "id": f"summer-{hour}",
                "title": "Rynek Główny → Wawel",
                "origin": {"longitude": start[0], "latitude": start[1]},
                "destination": {"longitude": end[0], "latitude": end[1]},
                "departure_at": at.isoformat(),
                "result": geographic_routes(result),
                "shade": {
                    "effective_at": result["effective_at"],
                    "dataset_version": result["dataset_version"],
                    "detail_available": True,
                    "shade_status": result["shade_status"],
                    "shadows": {"type": "FeatureCollection", "features": []},
                    "display_path": display_path(
                        [p for p in parts if p.geom_type == "Polygon"], bounds
                    ),
                },
            }
        )
        print("Packaged summer snapshot", hour, flush=True)
    path = ROOT / "mobile/src/data/demo.json"
    path.write_text(
        json.dumps(
            {"scenarios": snapshots, "map": basemap, "sources": ds.manifest["sources"]},
            separators=(",", ":"),
        )
    )
    print("Demo bundle", path.stat().st_size, "bytes", flush=True)


if __name__ == "__main__":
    build_demo(load_dataset(ROOT / "data/processed"))
