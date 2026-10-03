"""Normalize the GUGiK LoD1 CityGML source (XY meters in EPSG:2180)."""

from dataclasses import dataclass

from lxml import etree
from shapely import make_valid, union_all
from shapely.geometry import Polygon

NS = {"g": "http://www.opengis.net/gml", "b": "http://www.opengis.net/citygml/building/2.0"}


@dataclass(frozen=True)
class Building:
    id: str
    geometry: object
    height: float


def read_citygml(stream, stats=None):
    stats = stats if stats is not None else {}
    for _, element in etree.iterparse(
        stream, events=("end",), tag=f"{{{NS['b']}}}Building", resolve_entities=False
    ):
        stats["seen"] = stats.get("seen", 0) + 1
        surfaces = []
        heights = []
        for poly in element.findall(".//g:Polygon", NS):
            rings = []
            for text in poly.findall(".//g:LinearRing/g:posList", NS):
                vals = [float(v) for v in text.text.split()]
                coords = list(zip(vals[::3], vals[1::3], vals[2::3]))
                heights.extend(c[2] for c in coords)
                rings.append(coords)
            if rings and len(rings[0]) >= 4:
                zs = [c[2] for c in rings[0]]
                if max(zs) - min(zs) < 0.05:
                    geom = make_valid(
                        Polygon([c[:2] for c in rings[0]], [[c[:2] for c in r] for r in rings[1:]])
                    )
                    surfaces.append((min(zs), geom))
        height_text = element.findtext("b:measuredHeight", namespaces=NS)
        height = (
            float(height_text) if height_text else (max(heights) - min(heights) if heights else 0)
        )
        if surfaces and 0 < height < 500:
            ground = min(z for z, _ in surfaces)
            geometry = union_all([p for z, p in surfaces if abs(z - ground) < 0.05])
            if geometry.area > 0:
                yield Building(element.get(f"{{{NS['g']}}}id", "unknown"), geometry, height)
        else:
            stats["rejected"] = stats.get("rejected", 0) + 1
        element.clear()
        while element.getprevious() is not None:
            del element.getparent()[0]
