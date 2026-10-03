"""Offline OSM land-cover import; polygons are not measured canopy shadows."""

import geopandas as gpd
import osmium
from pyproj import Transformer
from shapely import from_wkb, make_valid, union_all
from shapely.ops import transform

WOODLAND_TAGS = (("natural", "wood"), ("landuse", "forest"), ("landcover", "trees"))


def polygonal(geometry):
    if geometry.geom_type in ("Polygon", "MultiPolygon"):
        return geometry
    return union_all([polygonal(g) for g in getattr(geometry, "geoms", [])])


def extract_woodland(source, boundary_geo):
    project = Transformer.from_crs(4326, 2180, always_xy=True).transform
    boundary = transform(project, boundary_geo)
    factory = osmium.geom.WKBFactory()
    records = []
    stats = {"invalid_areas": 0, "wooded_areas": 0}

    class Handler(osmium.SimpleHandler):
        def area(self, area):
            tags = dict(area.tags)
            source_tag = next((f"{k}={v}" for k, v in WOODLAND_TAGS if tags.get(k) == v), None)
            if source_tag is None:
                return
            stats["wooded_areas"] += 1
            try:
                geometry = from_wkb(factory.create_multipolygon(area))
                if not geometry.is_valid:
                    geometry = polygonal(make_valid(geometry))
                if geometry.is_empty or not geometry.intersects(boundary_geo):
                    return
                geometry = polygonal(transform(project, geometry).intersection(boundary))
                if geometry.is_empty or geometry.area == 0:
                    return
                records.append(
                    {
                        "id": f"{'way' if area.from_way() else 'relation'}/{area.orig_id()}",
                        "source_tag": source_tag,
                        "geometry": geometry,
                    }
                )
            except (RuntimeError, ValueError):
                stats["invalid_areas"] += 1

    Handler().apply_file(str(source), locations=True, idx="flex_mem")
    frame = gpd.GeoDataFrame(records, columns=["id", "source_tag", "geometry"], crs=2180)
    return frame, stats
