"""One-time, resumable acquisition; never called from request handlers."""

import hashlib
import json
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import osmnx as ox
from pyproj import Transformer
from shapely.geometry import shape
from shapely.ops import transform

from shady.importer import read_citygml
from shady.network import clip_graph, pedestrian_graph
from shady.woodland import extract_woodland

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "data/raw", ROOT / "data/processed"
OUT.mkdir(parents=True, exist_ok=True)
boundary = shape(json.loads((RAW / "boundary.json").read_text()))
project = Transformer.from_crs(4326, 2180, always_xy=True).transform
local_boundary = transform(project, boundary)


def graph():
    path = OUT / "walk.graphml"
    if path.exists():
        return ox.load_graphml(path)
    ox.settings.use_cache = True
    ox.settings.cache_folder = str(RAW / "osm-cache")
    ox.settings.requests_timeout = 180
    ox.settings.http_user_agent = "ShadyHackathon/0.1 local walking data preparation"
    ox.settings.useful_tags_way = list(
        set(ox.settings.useful_tags_way)
        | {
            "foot",
            "access",
            "area",
            "service",
            "sidewalk",
            "sidewalk:both",
            "sidewalk:left",
            "sidewalk:right",
            "oneway:foot",
            "foot:forward",
            "foot:backward",
        }
    )
    last = None
    for host in [
        "regional extract",
        "https://overpass-api.de/api",
        "https://overpass.kumi.systems/api",
    ]:
        try:
            ox.settings.overpass_url = host
            g = (
                ox.graph_from_xml(
                    RAW / "walk.osm",
                    bidirectional=True,
                    retain_all=True,
                    simplify=False,
                )
                if host == "regional extract"
                else ox.graph.graph_from_polygon(
                    boundary, network_type="walk", retain_all=True, simplify=False
                )
            )
            pedestrian_graph(g)
            g = ox.simplify_graph(
                g, edge_attrs_differ=["oneway:foot", "foot:forward", "foot:backward"]
            )
            g = ox.projection.project_graph(g, to_crs="EPSG:2180")
            clip_graph(g, local_boundary)
            ox.save_graphml(g, path)
            return g
        except Exception as error:
            print("OSM provider failed:", host, str(error), flush=True)
            last = error
    raise last


with ThreadPoolExecutor(max_workers=1) as pool:
    future = pool.submit(graph)
    bpath = OUT / "buildings.parquet"
    stats = {}
    if not bpath.exists():
        records = {}
        # max supported 500m building, elevation >=5deg: <5.72km shadow halo.
        halo = local_boundary.buffer(6000)
        for path in sorted(RAW.glob("*.zip")):
            with zipfile.ZipFile(path) as archive:
                for name in archive.namelist():
                    if name.endswith(".gml"):
                        with archive.open(name) as stream:
                            for b in read_citygml(stream, stats):
                                if b.geometry.intersects(halo):
                                    records[b.id] = {
                                        "id": b.id,
                                        "height": b.height,
                                        "geometry": b.geometry,
                                    }
            print("Normalized", path.name, len(records), "buildings", flush=True)
        gpd.GeoDataFrame(list(records.values()), crs="EPSG:2180").to_parquet(bpath)
    g = future.result()
(OUT / "boundary.json").write_text(json.dumps(json.loads((RAW / "boundary.json").read_text())))
frame = gpd.read_parquet(OUT / "buildings.parquet")
woodland_path = OUT / "woodland.parquet"
previous_manifest = (
    json.loads((OUT / "manifest.json").read_text()) if (OUT / "manifest.json").exists() else {}
)
woodland_stats = previous_manifest.get("woodland", {}).get("import_stats", {})
if not woodland_path.exists():
    woodland, woodland_stats = extract_woodland(RAW / "malopolskie-latest.osm.pbf", boundary)
    woodland.to_parquet(woodland_path)
else:
    woodland = gpd.read_parquet(woodland_path)
print("Normalized woodland", len(woodland), "areas", flush=True)
raw_hashes = {}
for source in [
    *RAW.glob("*.zip"),
    RAW / "malopolskie-latest.osm.pbf",
    RAW / "boundary.json",
]:
    with source.open("rb") as stream:
        raw_hashes[source.name] = hashlib.file_digest(stream, "sha256").hexdigest()
processed_hashes = {}
for name in ("buildings.parquet", "walk.graphml", "woodland.parquet"):
    with (OUT / name).open("rb") as stream:
        processed_hashes[name] = hashlib.file_digest(stream, "sha256").hexdigest()
fingerprint = hashlib.sha256(
    json.dumps(
        {**raw_hashes, **processed_hashes, "shade_model": "osm-woodland-weighted-v1"},
        sort_keys=True,
    ).encode()
).hexdigest()[:12]
version = (
    "krakow-lod1-2024-osm-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + fingerprint
)
manifest = {
    "dataset_version": version,
    "acquired_at": datetime.now(timezone.utc).isoformat(),
    "building_vintage": 2024,
    "building_stats": stats,
    "normalized_buildings": len(frame),
    "buildings_intersecting_city": int(frame.intersects(local_boundary).sum()),
    "maximum_building_height_m": float(frame.height.max()),
    "source_sha256": raw_hashes,
    "processed_sha256": processed_hashes,
    "graph_nodes": len(g),
    "graph_edges": g.number_of_edges(),
    "osm_acquisition": "Geofabrik regional PBF / filtered OSMnx XML",
    "woodland": {
        "count": len(woodland),
        "area_m2": float(woodland.geometry.area.sum()),
        "tags": ["natural=wood", "landuse=forest", "landcover=trees"],
        "import_stats": woodland_stats,
        "model_version": "osm-woodland-weighted-v1",
    },
    "timezone": "Europe/Warsaw",
    "sources": [
        {
            "name": "OpenStreetMap contributors",
            "license": "ODbL",
            "url": "https://www.openstreetmap.org/copyright",
        },
        {
            "name": "GUGiK LoD1 buildings 2024",
            "license": "CC BY 4.0",
            "url": "https://www.geoportal.gov.pl/en/data/other-data/3d-models-of-building/",
        },
    ],
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
print(json.dumps(manifest, indent=2), flush=True)
