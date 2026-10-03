import json
from dataclasses import dataclass
from pathlib import Path

import geopandas as gpd
import osmnx as ox
from pyproj import CRS, Transformer
from shapely.geometry import shape
from shapely.ops import transform

from .importer import Building
from .routing import RoutePlanner
from .tiles import ShadeEngine

TO_LOCAL = Transformer.from_crs(4326, 2180, always_xy=True).transform
TO_GEO = Transformer.from_crs(2180, 4326, always_xy=True).transform


@dataclass
class Dataset:
    boundary_geo: object
    manifest: dict
    planner: RoutePlanner


def load_dataset(directory):
    directory = Path(directory)
    manifest = json.loads((directory / "manifest.json").read_text())
    boundary = shape(json.loads((directory / "boundary.json").read_text()))
    frame = gpd.read_parquet(directory / "buildings.parquet")
    if frame.crs is None or frame.crs.to_epsg() != 2180:
        raise ValueError("Building geometry must use EPSG:2180 meters.")
    if not frame.height.between(0, 500, inclusive="neither").all():
        raise ValueError("Invalid building height in processed dataset.")
    if not frame.geometry.is_valid.all() or frame.geometry.is_empty.any():
        raise ValueError("Invalid building geometry in processed dataset.")
    buildings = [Building(row.id, row.geometry, float(row.height)) for row in frame.itertuples()]
    woodland = []
    if "woodland" in manifest:
        woods = gpd.read_parquet(directory / "woodland.parquet")
        if (
            woods.crs is None
            or woods.crs.to_epsg() != 2180
            or not woods.geometry.is_valid.all()
            or woods.geometry.is_empty.any()
            or not woods.geom_type.isin(["Polygon", "MultiPolygon"]).all()
        ):
            raise ValueError("Woodland geometry must be valid polygons in EPSG:2180 meters.")
        if len(woods) != manifest["woodland"]["count"]:
            raise ValueError("Woodland count does not match the manifest.")
        woodland = list(woods.geometry)
    engine = ShadeEngine(buildings, manifest["dataset_version"], woodland=woodland)
    graph = ox.load_graphml(directory / "walk.graphml")
    if CRS.from_user_input(graph.graph["crs"]).to_epsg() != 2180:
        raise ValueError("Walking graph must use EPSG:2180 meters.")
    return Dataset(boundary, manifest, RoutePlanner(graph, transform(TO_LOCAL, boundary), engine))
