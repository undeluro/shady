"""Stream the regional PBF into a city-sized OSM XML snapshot for OSMnx."""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

import osmium
from shapely.geometry import shape

from shady.network import walk_allowed

ROOT = Path(__file__).resolve().parents[1]
raw = ROOT / "data/raw"
left, bottom, right, top = shape(json.loads((raw / "boundary.json").read_text())).bounds
nodes = {}
ways = []


class WalkHandler(osmium.SimpleHandler):
    def way(self, way):
        tags = dict(way.tags)
        if not walk_allowed(tags):
            return
        points = [(n.ref, n.location.lon, n.location.lat) for n in way.nodes if n.location.valid()]
        if len(points) != len(way.nodes) or not any(
            left - 0.01 <= x <= right + 0.01 and bottom - 0.01 <= y <= top + 0.01
            for _, x, y in points
        ):
            return
        ways.append((way.id, [n for n, _, _ in points], tags))
        nodes.update({n: (x, y) for n, x, y in points})


handler = WalkHandler()
handler.apply_file(str(raw / "malopolskie-latest.osm.pbf"), locations=True, idx="flex_mem")
root = ET.Element("osm", version="0.6", generator="Shady regional snapshot walking filter")
for n, (x, y) in nodes.items():
    ET.SubElement(root, "node", id=str(n), lon=str(x), lat=str(y), version="1")
for wid, refs, tags in ways:
    w = ET.SubElement(root, "way", id=str(wid), version="1")
    for n in refs:
        ET.SubElement(w, "nd", ref=str(n))
    for k, v in tags.items():
        ET.SubElement(w, "tag", k=k, v=v)
ET.ElementTree(root).write(raw / "walk.osm", encoding="utf-8", xml_declaration=True)
print("Walking XML:", len(nodes), "nodes;", len(ways), "ways", flush=True)
