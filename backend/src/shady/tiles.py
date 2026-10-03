from collections import OrderedDict
from math import floor, radians, tan

from shapely import STRtree, union_all
from shapely.geometry import Polygon, box

from .shadows import project_shadow
from .timebase import bucket, sun_position

TILE_SIZE = 500


class ShadeEngine:
    def __init__(self, buildings, version, position=sun_position, max_tiles=256):
        self.buildings = buildings
        self.version = version
        self.position = position
        self.tree = STRtree([b.geometry for b in buildings])
        self.max_height = max((b.height for b in buildings), default=0)
        self.cache = OrderedDict()
        self.max_tiles = max_tiles
        self.edge_cache = OrderedDict()

    def context(self, at):
        at = bucket(at)
        elevation, azimuth = self.position(at)
        status = "night" if elevation <= 0 else ("low_sun" if elevation < 5 else "available")
        return at, elevation, azimuth, status

    def tile(self, x, y, at):
        at, elevation, azimuth, status = self.context(at)
        key = (self.version, at, x, y)
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
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

    def geometry_for(self, area, at):
        if area.is_empty:
            return Polygon()
        left, bottom, right, top = area.bounds
        tiles = [
            self.tile(x, y, at).intersection(area)
            for x in range(floor(left / TILE_SIZE), floor(right / TILE_SIZE) + 1)
            for y in range(floor(bottom / TILE_SIZE), floor(top / TILE_SIZE) + 1)
        ]
        return union_all(tiles)

    def shaded_length(self, line, at):
        key = (bucket(at), line.normalize().wkb)
        if key in self.edge_cache:
            self.edge_cache.move_to_end(key)
            return self.edge_cache[key]
        value = line.intersection(self.geometry_for(line.envelope.buffer(0.01), at)).length
        self.edge_cache[key] = value
        if len(self.edge_cache) > 50000:
            self.edge_cache.popitem(last=False)
        return value
