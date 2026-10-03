from datetime import datetime

from shapely.geometry import LineString, box

from shady.importer import Building
from shady.tiles import ShadeEngine

AT = datetime.fromisoformat("2026-07-01T10:00:00+00:00")


def test_neighboring_tile_building_casts_shadow_into_requested_tile():
    engine = ShadeEngine([Building("one", box(505, 0, 515, 10), 20)], "v1", lambda _: (45, 90))
    result = engine.geometry_for(box(480, 0, 500, 10), AT)
    assert abs(LineString([(480, 5), (500, 5)]).intersection(result).length - 15) < 1e-8
    cached = engine.geometry_for(box(480, 0, 500, 10), AT)
    assert cached.equals(result)


def test_cache_eviction_empty_area_and_unavailable_sun_are_equivalent():
    from shapely.geometry import Polygon

    engine = ShadeEngine([], "v", lambda _: (45, 90), max_tiles=1)
    first = engine.tile(0, 0, AT)
    engine.tile(1, 0, AT)
    assert len(engine.cache) == 1
    assert engine.tile(0, 0, AT).equals(first)
    assert engine.geometry_for(Polygon(), AT).is_empty
    engine = ShadeEngine([], "v", lambda _: (-5, 90))
    assert engine.tile(0, 0, AT).is_empty
