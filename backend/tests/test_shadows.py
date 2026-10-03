from shapely.geometry import box

from shady.shadows import project_shadow


def test_ten_meter_building_casts_ten_meter_shadow_west():
    result = project_shadow(box(0, 0, 10, 10), 10, 45, 90)
    assert result.bounds == (-10.0, 0.0, 10.0, 10.0)
    assert abs(result.area - 200) < 1e-8


def test_courtyard_does_not_become_a_solid_building():
    from shapely.geometry import Point, Polygon

    ring = Polygon(
        [(0, 0), (30, 0), (30, 30), (0, 30)], holes=[[(5, 5), (25, 5), (25, 25), (5, 25)]]
    )
    shadow = project_shadow(ring, 5, 45, 90)
    assert not shadow.covers(Point(10, 15))
    assert shadow.covers(Point(22, 15))


def test_night_and_invalid_height_do_not_cast_shadows():
    assert project_shadow(box(0, 0, 10, 10), 10, -5, 90).is_empty
    assert project_shadow(box(0, 0, 10, 10), 0, 45, 90).is_empty


def test_multibuilding_shape_preserves_gap():
    from shapely.geometry import MultiPolygon, Point

    shape = MultiPolygon([box(0, 0, 10, 10), box(0, 30, 10, 40)])
    result = project_shadow(shape, 10, 45, 90)
    assert not result.covers(Point(0, 20))
