"""Geometry of opaque, vertically extruded buildings on flat ground."""

from math import cos, radians, sin, tan

from shapely import affinity, make_valid, union_all
from shapely.geometry import Polygon


def project_shadow(footprint, height: float, elevation: float, azimuth: float):
    if height <= 0 or elevation <= 0:
        return Polygon()
    distance = height / tan(radians(elevation))
    dx = round(-distance * sin(radians(azimuth)), 10)
    dy = round(-distance * cos(radians(azimuth)), 10)
    parts = [footprint, affinity.translate(footprint, dx, dy)]
    polygons = [footprint] if footprint.geom_type == "Polygon" else footprint.geoms
    for polygon in polygons:
        for ring in [polygon.exterior, *polygon.interiors]:
            points = list(ring.coords)
            for a, b in zip(points, points[1:]):
                parts.append(
                    Polygon([a[:2], b[:2], (b[0] + dx, b[1] + dy), (a[0] + dx, a[1] + dy)])
                )
    return make_valid(union_all(parts))
