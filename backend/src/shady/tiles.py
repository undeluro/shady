from collections import OrderedDict
from math import floor, radians, tan
from zoneinfo import ZoneInfo

from shapely import STRtree, union_all
from shapely.geometry import Polygon, box

from .shadows import project_shadow
from .timebase import bucket, sun_position

TILE_SIZE = 500
WOODLAND_WEIGHT = 0.5
LEAF_ON_MONTHS = (5, 6, 7, 8, 9)


class ShadeEngine:
    def __init__(self, buildings, version, position=sun_position, max_tiles=256, woodland=None):
        self.buildings = buildings
        self.version = version
        self.position = position
        self.tree = STRtree([b.geometry for b in buildings])
        self.max_height = max((b.height for b in buildings), default=0)
        self.woodland = list(woodland or [])
        self.woodland_tree = STRtree(self.woodland)
        self.woodland_cache = OrderedDict()
        self.cache = OrderedDict()
        self.max_tiles = max_tiles
        self.edge_cache = OrderedDict()
        self.stats = dict(
            tile_hits=0,
            tile_misses=0,
            edge_hits=0,
            edge_misses=0,
            woodland_tile_hits=0,
            woodland_tile_misses=0,
        )

    def context(self, at):
        at = bucket(at)
        elevation, azimuth = self.position(at)
        status = "night" if elevation <= 0 else ("low_sun" if elevation < 5 else "available")
        return at, elevation, azimuth, status

    def tile(self, x, y, at):
        at, elevation, azimuth, status = self.context(at)
        key = (self.version, at, x, y)
        if key in self.cache:
            self.stats["tile_hits"] += 1
            self.cache.move_to_end(key)
            return self.cache[key]
        self.stats["tile_misses"] += 1
        bounds = box(x * TILE_SIZE, y * TILE_SIZE, (x + 1) * TILE_SIZE, (y + 1) * TILE_SIZE)
        result = Polygon()
        if status == "available":
            radius = self.max_height / tan(radians(elevation))
            indices = self.tree.query(bounds.buffer(radius), predicate="intersects")
            shadows = [
                project_shadow(
                    self.buildings[i].geometry, self.buildings[i].height, elevation, azimuth
                )
                for i in indices
            ]
            result = union_all(shadows).intersection(bounds)
        self.cache[key] = result
        while len(self.cache) > self.max_tiles:
            self.cache.popitem(last=False)
        return result

    def building_geometry_for(self, area, at):
        if area.is_empty:
            return Polygon()
        left, bottom, right, top = area.bounds
        tiles = [
            self.tile(x, y, at).intersection(area)
            for x in range(floor(left / TILE_SIZE), floor(right / TILE_SIZE) + 1)
            for y in range(floor(bottom / TILE_SIZE), floor(top / TILE_SIZE) + 1)
        ]
        return union_all(tiles)

    def model(self, at):
        month = bucket(at).astimezone(ZoneInfo("Europe/Warsaw")).month
        return {
            "woodland_status": "not_loaded"
            if not self.woodland
            else ("leaf_on" if month in LEAF_ON_MONTHS else "off_season"),
            "woodland_weight": WOODLAND_WEIGHT,
            "leaf_on_months": list(LEAF_ON_MONTHS),
        }

    def woodland_geometry_for(self, area, at):
        if (
            area.is_empty
            or self.context(at)[3] != "available"
            or self.model(at)["woodland_status"] != "leaf_on"
        ):
            return Polygon()
        left, bottom, right, top = area.bounds
        parts = []
        for x in range(floor(left / TILE_SIZE), floor(right / TILE_SIZE) + 1):
            for y in range(floor(bottom / TILE_SIZE), floor(top / TILE_SIZE) + 1):
                key = (self.version, x, y)
                if key not in self.woodland_cache:
                    self.stats["woodland_tile_misses"] += 1
                    bounds = box(
                        x * TILE_SIZE, y * TILE_SIZE, (x + 1) * TILE_SIZE, (y + 1) * TILE_SIZE
                    )
                    indices = self.woodland_tree.query(bounds, predicate="intersects")
                    self.woodland_cache[key] = union_all(
                        [self.woodland[i] for i in indices]
                    ).intersection(bounds)
                    if len(self.woodland_cache) > self.max_tiles:
                        self.woodland_cache.popitem(last=False)
                else:
                    self.stats["woodland_tile_hits"] += 1
                self.woodland_cache.move_to_end(key)
                parts.append(self.woodland_cache[key].intersection(area))
        return union_all(parts)

    def layers_for(self, area, at):
        buildings = self.building_geometry_for(area, at)
        woodland = self.woodland_geometry_for(area, at).difference(buildings)
        return buildings, woodland

    def geometry_for(self, area, at):
        return union_all(self.layers_for(area, at))

    def shaded_length(self, line, at):
        key = (bucket(at), line.normalize().wkb)
        if key in self.edge_cache:
            self.stats["edge_hits"] += 1
            self.edge_cache.move_to_end(key)
            return self.edge_cache[key]
        self.stats["edge_misses"] += 1
        buildings, woodland = self.layers_for(line.envelope.buffer(0.01), at)
        value = (
            line.intersection(buildings).length
            + WOODLAND_WEIGHT * line.intersection(woodland).length
        )
        self.edge_cache[key] = value
        if len(self.edge_cache) > 50000:
            self.edge_cache.popitem(last=False)
        return value
