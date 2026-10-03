from shapely.geometry import box


def test_import_uses_wooded_areas_not_generic_green_space(tmp_path):
    from shady.woodland import extract_woodland

    path = tmp_path / "trees.osm"
    path.write_text("""<osm version="0.6">
      <node id="1" lon="19.94" lat="50.06"/><node id="2" lon="19.941" lat="50.06"/>
      <node id="3" lon="19.941" lat="50.061"/><node id="4" lon="19.94" lat="50.061"/>
      <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
        <tag k="natural" v="wood"/></way>
      <way id="11"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
        <tag k="leisure" v="park"/></way>
      <way id="12"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
        <tag k="landuse" v="grass"/></way></osm>""")
    frame, stats = extract_woodland(path, box(19.93, 50.05, 19.95, 50.07))
    assert len(frame) == 1
    assert frame.iloc[0].id == "way/10"
    assert frame.iloc[0].source_tag == "natural=wood"
    assert frame.crs.to_epsg() == 2180
    assert 7000 < frame.geometry.area.sum() < 9000
    assert stats["invalid_areas"] == 0


def test_relation_preserves_clearing_and_clips_to_city(tmp_path):
    from shapely.geometry import Point
    from shapely.ops import transform

    from shady.dataset import TO_LOCAL
    from shady.woodland import extract_woodland

    path = tmp_path / "relation.osm"
    points = [
        (1, 19.94, 50.06),
        (2, 19.944, 50.06),
        (3, 19.944, 50.064),
        (4, 19.94, 50.064),
        (5, 19.941, 50.061),
        (6, 19.942, 50.061),
        (7, 19.942, 50.062),
        (8, 19.941, 50.062),
    ]
    nodes = "".join(f'<node id="{i}" lon="{x}" lat="{y}"/>' for i, x, y in points)
    path.write_text(f"""<osm version="0.6">{nodes}
      <way id="10"><nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/></way>
      <way id="11"><nd ref="5"/><nd ref="6"/><nd ref="7"/><nd ref="8"/><nd ref="5"/></way>
      <relation id="20"><member type="way" ref="10" role="outer"/>
        <member type="way" ref="11" role="inner"/>
        <tag k="type" v="multipolygon"/><tag k="landuse" v="forest"/></relation></osm>""")
    city = box(19.939, 50.059, 19.943, 50.065)
    frame, _ = extract_woodland(path, city)
    assert list(frame.id) == ["relation/20"]
    woodland = frame.geometry.iloc[0]
    assert transform(TO_LOCAL, city).buffer(1e-7).covers(woodland)
    assert not woodland.covers(Point(TO_LOCAL(19.9415, 50.0615)))
    assert woodland.covers(Point(TO_LOCAL(19.9425, 50.063)))


def test_import_supports_tree_landcover_and_empty_results(tmp_path):
    from shady.woodland import extract_woodland

    path = tmp_path / "empty.osm"
    path.write_text('<osm version="0.6"/>')
    frame, stats = extract_woodland(path, box(19.93, 50.05, 19.95, 50.07))
    assert frame.empty and frame.crs.to_epsg() == 2180
    assert stats == {"wooded_areas": 0, "invalid_areas": 0}


def test_woodland_counts_half_weight_and_does_not_double_count_buildings():
    from datetime import datetime

    from shapely.geometry import LineString

    from shady.importer import Building
    from shady.tiles import ShadeEngine

    engine = ShadeEngine(
        [Building("one", box(0, -1, 30, 1), 1)],
        "v1",
        lambda _: (90, 0),
        woodland=[box(20, -1, 80, 1)],
    )
    line = LineString([(0, 0), (100, 0)])
    at = datetime.fromisoformat("2026-07-01T13:00:00+02:00")
    # 30m building shade plus 50m woodland-only at half weight = 55m equivalent shade.
    assert engine.shaded_length(line, at) == 55
    assert engine.geometry_for(box(0, -1, 100, 1), at).intersection(line).length == 80


def test_woodland_season_uses_warsaw_time_and_keeps_low_sun_unavailable():
    from datetime import datetime

    from shapely.geometry import LineString, Polygon

    from shady.tiles import ShadeEngine

    line = LineString([(490, 5), (510, 5)])
    engine = ShadeEngine([], "v", lambda _: (45, 90), max_tiles=1, woodland=[box(490, 0, 510, 10)])
    summer = datetime.fromisoformat("2026-07-01T13:09:00+02:00")
    assert engine.shaded_length(line, summer) == 10
    assert engine.shaded_length(line, summer) == 10
    assert engine.geometry_for(box(490, 0, 510, 10), summer).area == 200
    engine.woodland_cache.clear()
    engine.edge_cache.clear()
    assert engine.shaded_length(line, summer) == 10
    assert engine.woodland_geometry_for(Polygon(), summer).is_empty
    assert engine.shaded_length(line, datetime.fromisoformat("2026-04-30T22:05:00Z")) == 10
    assert engine.shaded_length(line, datetime.fromisoformat("2026-09-30T22:05:00Z")) == 0
    assert (
        engine.model(datetime.fromisoformat("2026-01-01T12:00:00Z"))["woodland_status"]
        == "off_season"
    )
    for elevation in (-5, 3):
        unavailable = ShadeEngine([], "v", lambda _: (elevation, 90), woodland=engine.woodland)
        assert unavailable.geometry_for(box(490, 0, 510, 10), summer).is_empty
        assert unavailable.shaded_length(line, summer) == 0


def test_route_prefers_woodland_detour_and_reports_source_segments():
    from datetime import datetime

    from shapely.geometry import LineString
    from test_routing import graph

    from shady.routing import RoutePlanner
    from shady.tiles import ShadeEngine

    g = graph()
    g.nodes[3]["y"] = g.nodes[4]["y"] = 10
    for u, v, _, data in g.edges(keys=True, data=True):
        data["geometry"] = LineString(
            [(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])]
        )
        data["length"] = data["geometry"].length
    engine = ShadeEngine([], "v", lambda _: (45, 90), woodland=[box(-1, 5, 101, 15)])
    result = RoutePlanner(g, box(-100, -100, 200, 200), engine).plan(
        (0, 0), (100, 0), datetime.fromisoformat("2026-07-01T13:00:00+02:00")
    )
    route = result["routes"][1]
    assert route["distance_m"] == 120
    assert route["shaded_m"] == 55
    assert route["woodland_m"] == 110
    assert route["building_shaded_m"] == 0
    assert result["sunny_m_saved"] == 35
    assert result["shade_model"]["woodland_weight"] == 0.5
    woodland_segments = [
        f for f in route["segments"]["features"] if f["properties"]["exposure"] == "woodland"
    ]
    assert woodland_segments
    assert (
        sum(__import__("shapely").geometry.shape(f["geometry"]).length for f in woodland_segments)
        == 110
    )


def test_dataset_loads_declared_woodland_and_rejects_missing_or_bad_artifact(tmp_path):
    import json

    import geopandas as gpd
    import osmnx as ox
    import pytest
    from shapely.geometry import mapping
    from test_api import dataset

    from shady.dataset import load_dataset

    ds = dataset()
    manifest = {**ds.manifest, "woodland": {"count": 1}}
    (tmp_path / "boundary.json").write_text(json.dumps(mapping(ds.boundary_geo)))
    (tmp_path / "manifest.json").write_text(json.dumps(manifest))
    ox.save_graphml(ds.planner.graph, tmp_path / "walk.graphml")
    gpd.GeoDataFrame(
        [{"id": "one", "height": 10, "geometry": ds.planner.boundary}], crs=2180
    ).to_parquet(tmp_path / "buildings.parquet")
    with pytest.raises(FileNotFoundError):
        load_dataset(tmp_path)
    frame = gpd.GeoDataFrame(
        [{"id": "way/1", "source_tag": "natural=wood", "geometry": ds.boundary_geo}], crs=4326
    )
    frame.to_parquet(tmp_path / "woodland.parquet")
    with pytest.raises(ValueError, match="Woodland"):
        load_dataset(tmp_path)
    frame = frame.to_crs(2180)
    frame.to_parquet(tmp_path / "woodland.parquet")
    loaded = load_dataset(tmp_path)
    assert len(loaded.planner.shade.woodland) == 1
    assert (
        loaded.planner.shade.model(
            __import__("datetime").datetime.fromisoformat("2026-07-01T12:00:00Z")
        )["woodland_status"]
        == "leaf_on"
    )


def test_api_separates_building_and_woodland_and_agrees_with_routes(tmp_path):
    from fastapi.testclient import TestClient
    from shapely.geometry import shape
    from test_api import dataset

    from shady.api import create_app
    from shady.tiles import ShadeEngine

    ds = dataset()
    ds.planner.shade = ShadeEngine(
        ds.planner.shade.buildings, "test", lambda _: (45, 90), woodland=[ds.planner.boundary]
    )
    payload = {
        "origin": {"latitude": 50.06, "longitude": 19.938},
        "destination": {"latitude": 50.06, "longitude": 19.941},
        "departure_at": "2026-07-01T13:09:00+02:00",
    }
    with TestClient(create_app(ds, data_dir=tmp_path)) as client:
        metadata = client.get("/v1/metadata").json()
        assert "woodland" in metadata["model"].lower()
        assert metadata["woodland_model"]["weight"] == 0.5
        route = client.post("/v1/routes", json=payload).json()
        params = {"bbox": "19.937,50.059,19.942,50.061", "departure_at": payload["departure_at"]}
        shade = client.get("/v1/shade", params=params).json()
        assert shade["shade_model"] == route["shade_model"]
        assert shade["effective_at"] == route["effective_at"]
        assert {f["properties"]["source"] for f in shade["shadows"]["features"]} == {
            "building",
            "woodland",
        }
        assert all(
            ds.boundary_geo.buffer(1e-9).covers(shape(f["geometry"]))
            for f in shade["shadows"]["features"]
        )
        winter = client.get(
            "/v1/shade", params={**params, "departure_at": "2026-01-01T13:00:00+02:00"}
        ).json()
        assert winter["shade_model"]["woodland_status"] == "off_season"
        assert all(f["properties"]["source"] == "building" for f in winter["shadows"]["features"])


def test_woodland_cannot_override_detour_cap_or_unavailable_sun():
    from datetime import datetime

    from test_routing import graph

    from shady.routing import RoutePlanner
    from shady.tiles import ShadeEngine

    at = datetime.fromisoformat("2026-07-01T13:00:00+02:00")
    woods = [box(-10, 15, 110, 25)]
    for elevation, status in [(45, "available"), (-5, "night"), (3, "low_sun")]:
        engine = ShadeEngine([], "v", lambda _: (elevation, 90), woodland=woods)
        result = RoutePlanner(graph(), box(-100, -100, 200, 200), engine).plan((0, 0), (100, 0), at)
        assert result["routes"][1]["distance_m"] == 100
        assert result["shade_status"] == status
        if status != "available":
            assert result["routes"][1]["shade_pct"] is None
            assert result["routes"][1]["woodland_m"] is None


def test_import_tree_landcover_excludes_areas_outside_boundary(tmp_path):
    from shady.woodland import extract_woodland

    path = tmp_path / "outside.osm"
    nodes = '<node id="1" lon="19.94" lat="50.06"/><node id="2" lon="19.941" lat="50.06"/>'
    nodes += '<node id="3" lon="19.941" lat="50.061"/>'
    path.write_text(f"""<osm version="0.6">{nodes}<way id="1">
      <nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>
      <tag k="landcover" v="trees"/></way></osm>""")
    frame, _ = extract_woodland(path, box(19.93, 50.05, 19.95, 50.07))
    assert len(frame) == 1 and frame.iloc[0].source_tag == "landcover=trees"
    frame, _ = extract_woodland(path, box(20, 51, 21, 52))
    assert frame.empty
