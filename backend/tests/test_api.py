import asyncio
import json

import geopandas as gpd
import httpx
import networkx as nx
import osmnx as ox
from fastapi.testclient import TestClient
from shapely.geometry import LineString, box
from shapely.ops import transform

from shady.api import Geocoder, create_app
from shady.dataset import TO_LOCAL, Dataset, load_dataset
from shady.importer import Building
from shady.routing import RoutePlanner
from shady.tiles import ShadeEngine


def dataset():
    geo = box(19.93, 50.05, 19.95, 50.07)
    boundary = transform(TO_LOCAL, geo)
    a, b = TO_LOCAL(19.938, 50.06), TO_LOCAL(19.941, 50.06)
    g = nx.MultiDiGraph(crs="EPSG:2180")
    for n, p in enumerate((a, b), 1):
        g.add_node(n, x=p[0], y=p[1])
    for u, v in [(1, 2), (2, 1)]:
        geom = LineString([a, b] if u == 1 else [b, a])
        g.add_edge(u, v, geometry=geom, length=geom.length)
    shade = ShadeEngine(
        [Building("a", box(a[0], a[1] - 10, a[0] + 20, a[1] + 10), 12)], "test", lambda _: (45, 90)
    )
    return Dataset(
        geo, {"dataset_version": "test", "sources": []}, RoutePlanner(g, boundary, shade)
    )


def test_missing_dataset_is_explicit():
    with TestClient(create_app(data_dir="/does/not/exist")) as client:
        assert client.get("/health").json()["ready"] is False
        assert client.get("/v1/metadata").status_code == 503


def test_ready_api_routes_and_shade_share_effective_timestamp(tmp_path):
    ds = dataset()
    with TestClient(create_app(ds, data_dir=tmp_path)) as client:
        assert client.get("/health").json()["ready"]
        assert client.get("/v1/metadata").json()["detour_cap"] == 0.25
        payload = {
            "origin": {"latitude": 50.06, "longitude": 19.938},
            "destination": {"latitude": 50.06, "longitude": 19.941},
            "departure_at": "2026-07-01T13:09:00+02:00",
        }
        response = client.post("/v1/routes", json=payload)
        assert response.status_code == 200
        route = response.json()
        assert route["routes"][0]["geometry"]["coordinates"][0][0] > 19
        params = {"bbox": "19.937,50.059,19.942,50.061", "departure_at": payload["departure_at"]}
        shade = client.get("/v1/shade", params=params).json()
        assert shade["effective_at"] == route["effective_at"]
        assert shade["shadows"]["features"]
        assert not client.get("/v1/shade", params={**params, "zoom": 12}).json()["detail_available"]
        assert client.get("/v1/shade", params={**params, "bbox": "bad"}).status_code == 422
        assert client.get("/v1/shade", params={**params, "bbox": "nan,0,1,2"}).status_code == 422
        assert (
            client.get("/v1/shade", params={**params, "bbox": "0,0,1,1"}).json()["shadows"][
                "features"
            ]
            == []
        )
        assert (
            client.post(
                "/v1/routes", json={**payload, "departure_at": "2026-07-01T13:00:00"}
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/v1/routes", json={**payload, "origin": {"latitude": 51, "longitude": 20}}
            ).json()["error"]["code"]
            == "outside_coverage"
        )


def test_geocoder_filters_polygon_caches_and_limits_upstream_requests(tmp_path):
    async def run():
        calls = []

        def upstream(request):
            calls.append(asyncio.get_running_loop().time())
            assert "Shady" in request.headers["User-Agent"]
            return httpx.Response(
                200,
                json=[
                    {
                        "osm_type": "node",
                        "osm_id": 1,
                        "display_name": "Inside",
                        "lat": "1",
                        "lon": "1",
                    },
                    {
                        "osm_type": "node",
                        "osm_id": 2,
                        "display_name": "Outside",
                        "lat": "4",
                        "lon": "4",
                    },
                ],
            )

        geocoder = Geocoder(
            box(0, 0, 2, 2), tmp_path / "search.json", httpx.MockTransport(upstream)
        )
        a = await geocoder.search("First")
        assert len(a) == 1
        assert await geocoder.search(" first ") == a
        await geocoder.search("Second")
        assert calls[1] - calls[0] >= 0.99
        await geocoder.close()
        loaded = Geocoder(box(0, 0, 2, 2), tmp_path / "search.json", httpx.MockTransport(upstream))
        assert await loaded.search("First") == a
        await loaded.close()

    asyncio.run(run())


def test_search_failure_is_explicit_and_query_is_submitted(tmp_path):
    def upstream(request):
        return httpx.Response(503)

    ds = dataset()
    geocoder = Geocoder(ds.boundary_geo, transport=httpx.MockTransport(upstream))
    with TestClient(create_app(ds, tmp_path, geocoder)) as client:
        assert client.get("/v1/search", params={"q": "  "}).status_code == 422
        assert (
            client.get("/v1/search", params={"q": "Rynek"}).json()["error"]["code"]
            == "search_unavailable"
        )
    geocoder = Geocoder(
        ds.boundary_geo, transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[]))
    )
    with TestClient(create_app(ds, tmp_path, geocoder)) as client:
        assert client.get("/v1/search", params={"q": "Nothing"}).json() == {"results": []}


def test_dataset_round_trip_preserves_disconnected_components(tmp_path):
    ds = dataset()
    g = ds.planner.graph
    g.add_node(3, x=560000, y=245000)
    g.add_node(4, x=560010, y=245000)
    g.add_edge(3, 4, geometry=LineString([(560000, 245000), (560010, 245000)]), length=10)
    from shapely.geometry import mapping

    (tmp_path / "boundary.json").write_text(json.dumps(mapping(ds.boundary_geo)))
    (tmp_path / "manifest.json").write_text(json.dumps(ds.manifest))
    gpd.GeoDataFrame(
        [{"id": "one", "height": 10, "geometry": box(560000, 245000, 560010, 245010)}], crs=2180
    ).to_parquet(tmp_path / "buildings.parquet")
    ox.save_graphml(g, tmp_path / "walk.graphml")
    loaded = load_dataset(tmp_path)
    assert nx.number_weakly_connected_components(loaded.planner.graph) == 2
    with TestClient(create_app(data_dir=tmp_path)) as client:
        assert client.get("/health").json()["ready"]


def test_processed_data_requires_meter_crs_and_valid_heights(tmp_path):
    import pytest
    from shapely.geometry import mapping

    ds = dataset()
    (tmp_path / "boundary.json").write_text(json.dumps(mapping(ds.boundary_geo)))
    (tmp_path / "manifest.json").write_text(json.dumps(ds.manifest))
    ox.save_graphml(ds.planner.graph, tmp_path / "walk.graphml")
    frame = gpd.GeoDataFrame(
        [{"id": "one", "height": 10, "geometry": box(19, 50, 20, 51)}], crs=4326
    )
    frame.to_parquet(tmp_path / "buildings.parquet")
    with pytest.raises(ValueError, match="2180"):
        load_dataset(tmp_path)
    frame = frame.to_crs(2180)
    frame.loc[0, "height"] = float("nan")
    frame.to_parquet(tmp_path / "buildings.parquet")
    with pytest.raises(ValueError, match="height"):
        load_dataset(tmp_path)


def test_neighboring_buildings_cast_shadows_across_the_city_border(tmp_path):
    from shapely.geometry import shape

    ds = dataset()
    x, y = TO_LOCAL(19.93, 50.06)
    building = Building("neighbor", box(x - 15, y - 5, x - 5, y + 5), 30)
    assert not ds.planner.boundary.intersects(building.geometry)
    ds.planner.shade = ShadeEngine([building], "test", lambda _: (45, 270))
    with TestClient(create_app(ds, tmp_path)) as client:
        response = client.get(
            "/v1/shade",
            params={
                "bbox": "19.929,50.059,19.932,50.061",
                "departure_at": "2026-07-01T13:00:00+02:00",
            },
        ).json()
    features = response["shadows"]["features"]
    assert features
    assert all(ds.boundary_geo.buffer(1e-9).covers(shape(f["geometry"])) for f in features)


def test_search_rejects_malformed_provider_data_and_caps_results(tmp_path):
    ds = dataset()
    invalid = Geocoder(
        ds.boundary_geo,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json={"error": "bad response"})
        ),
    )
    with TestClient(create_app(ds, tmp_path, invalid)) as client:
        assert client.get("/v1/search", params={"q": "Wawel"}).status_code == 503
    many = [
        {"osm_type": "node", "osm_id": i, "display_name": "Inside", "lat": "50.06", "lon": "19.94"}
        for i in range(10)
    ]
    geocoder = Geocoder(
        ds.boundary_geo, transport=httpx.MockTransport(lambda r: httpx.Response(200, json=many))
    )
    with TestClient(create_app(ds, tmp_path, geocoder)) as client:
        assert len(client.get("/v1/search", params={"q": "Wawel"}).json()["results"]) == 5


def test_route_logs_correlate_timings_and_cache_without_private_input(tmp_path, caplog):
    import logging

    caplog.set_level(logging.INFO, logger="shady")
    payload = {
        "origin": {"latitude": 50.06, "longitude": 19.938},
        "destination": {"latitude": 50.06, "longitude": 19.941},
        "departure_at": "2026-07-01T13:09:00+02:00",
    }
    with TestClient(create_app(dataset(), data_dir=tmp_path)) as client:
        first = client.post("/v1/routes", json=payload, headers={"X-Request-ID": "phone-test-1"})
        assert first.headers["X-Request-ID"] == "phone-test-1"
        second = client.post("/v1/routes", json=payload, headers={"X-Request-ID": "phone-test-2"})
        assert second.status_code == 200
    records = [json.loads(r.message) for r in caplog.records if r.name == "shady"]
    completed = [r for r in records if r["event"] == "http.completed"]
    assert completed[0]["request_id"] == "phone-test-1"
    assert completed[0]["duration_ms"] >= 0
    assert completed[0]["status"] == 200
    planned = [r for r in records if r["event"] == "routes.completed"]
    assert planned[0]["request_id"] == "phone-test-1"
    assert planned[0]["tile_misses"] > 0
    assert planned[1]["edge_hits"] > 0
    assert planned[1]["queue_ms"] >= 0
    assert any(
        r["event"] == "routes.eligible" and r["request_id"] == "phone-test-1" for r in records
    )
    serialized = json.dumps(records)
    assert "19.938" not in serialized
    assert '"origin"' not in serialized


def test_logs_preserve_explicit_errors_and_do_not_log_search_text(tmp_path, caplog):
    import logging

    caplog.set_level(logging.INFO, logger="shady")
    with TestClient(create_app(dataset(), data_dir=tmp_path)) as client:
        invalid = client.get(
            "/v1/search", params={"q": " "}, headers={"X-Request-ID": "invalid id!"}
        )
        assert invalid.status_code == 422
        assert invalid.headers["X-Request-ID"] != "invalid id!"
        response = client.get(
            "/v1/shade", params={"bbox": "private-address", "departure_at": "2026-07-01T13:00:00Z"}
        )
        assert response.status_code == 422
    records = [json.loads(r.message) for r in caplog.records if r.name == "shady"]
    assert any(r["event"] == "request.rejected" and r["code"] == "invalid_bbox" for r in records)
    assert any(r["event"] == "http.completed" and r["status"] == 422 for r in records)
    assert "private-address" not in json.dumps(records)


def test_unexpected_computation_error_is_correlated_and_sanitized(tmp_path, caplog):
    import logging

    caplog.set_level(logging.INFO, logger="shady")
    ds = dataset()

    def broken(*args):
        raise RuntimeError("Secret address at 19.938")

    ds.planner.plan = broken
    with TestClient(create_app(ds, data_dir=tmp_path)) as client:
        response = client.post(
            "/v1/routes",
            json={
                "origin": {"latitude": 50.06, "longitude": 19.938},
                "destination": {"latitude": 50.06, "longitude": 19.941},
                "departure_at": "2026-07-01T13:09:00+02:00",
            },
            headers={"X-Request-ID": "broken-test"},
        )
    assert response.status_code == 500
    assert response.headers["X-Request-ID"] == "broken-test"
    records = [json.loads(r.message) for r in caplog.records if r.name == "shady"]
    failed = next(r for r in records if r["event"] == "http.failed")
    assert failed["request_id"] == "broken-test"
    assert failed["error_type"] == "RuntimeError"
    assert failed["frames"][-1]["function"] == "broken"
    assert "Secret address" not in json.dumps(records)


def test_log_file_failure_does_not_stop_server_startup(tmp_path, monkeypatch, caplog):
    import logging

    caplog.set_level(logging.INFO, logger="shady")
    blocked = tmp_path / "file"
    blocked.write_text("not a directory")
    monkeypatch.setenv("SHADY_LOG_FILE", str(blocked / "shady.log"))
    with TestClient(create_app(dataset(), data_dir=tmp_path)) as client:
        assert client.get("/health").json()["ready"]
    assert any('"logging.file_unavailable"' in r.message for r in caplog.records)
