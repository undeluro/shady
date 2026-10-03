from datetime import datetime

import networkx as nx
from shapely.geometry import LineString, box

from shady.importer import Building
from shady.routing import RoutePlanner
from shady.tiles import ShadeEngine

AT = datetime.fromisoformat("2026-07-01T10:00:00+00:00")


def graph():
    g = nx.MultiDiGraph()
    for n, (x, y) in {1: (0, 0), 2: (100, 0), 3: (100, 20), 4: (0, 20)}.items():
        g.add_node(n, x=x, y=y)
    for a, b in [(1, 2), (1, 4), (4, 3), (3, 2)]:
        geom = LineString([(g.nodes[a]["x"], g.nodes[a]["y"]), (g.nodes[b]["x"], g.nodes[b]["y"])])
        g.add_edge(a, b, geometry=geom, length=geom.length)
        g.add_edge(b, a, geometry=LineString(list(geom.coords)[::-1]), length=geom.length)
    return g


def test_rejects_shady_candidate_above_twenty_five_percent_detour():
    engine = ShadeEngine([Building("shade", box(-10, 15, 110, 25), 1)], "v", lambda _: (90, 0))
    planner = RoutePlanner(graph(), box(-100, -100, 200, 200), engine)
    result = planner.plan((0, 0), (100, 0), AT)
    assert result["routes"][0]["distance_m"] == 100
    assert result["routes"][1]["distance_m"] == 100
    assert result["recommendation_status"] == "no_improvement"


def test_selects_real_shady_detour_within_limit():
    g = graph()
    g.nodes[3]["y"] = g.nodes[4]["y"] = 10
    for u, v, k, d in g.edges(keys=True, data=True):
        d["geometry"] = LineString(
            [(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])]
        )
        d["length"] = d["geometry"].length
    engine = ShadeEngine([Building("shade", box(-10, 5, 110, 15), 1)], "v", lambda _: (90, 0))
    result = RoutePlanner(g, box(-100, -100, 200, 200), engine).plan((0, 0), (100, 0), AT)
    assert result["routes"][1]["distance_m"] == 120
    assert result["routes"][1]["sunny_m"] == 10
    assert result["sunny_m_saved"] == 90
    assert result["recommendation_status"] == "improved"


def test_splits_both_endpoints_on_same_edge_without_extra_distance():
    p = RoutePlanner(graph(), box(-100, -100, 200, 200), ShadeEngine([], "v", lambda _: (45, 90)))
    result = p.plan((25, 1), (75, 1), AT)
    assert result["routes"][0]["distance_m"] == 50
    assert [p["offset_m"] for p in result["snapped_endpoints"]] == [1, 1]


def test_source_geometries_are_oriented_along_directed_edges():
    g = graph()
    for _, _, _, d in g.edges(keys=True, data=True):
        d["geometry"] = LineString(sorted(d["geometry"].coords))
    p = RoutePlanner(g, box(-100, -100, 200, 200), ShadeEngine([], "v", lambda _: (45, 90)))
    route = p.plan((75, 1), (25, 1), AT)["routes"][0]
    assert route["distance_m"] == 50
    assert route["geometry"]["coordinates"][0] == (75, 0)
    assert route["geometry"]["coordinates"][-1] == (25, 0)
    assert route["geometry"]["coordinates"] == ((75.0, 0.0), (25.0, 0.0))


def test_unmapped_and_disconnected_endpoints_raise_actionable_errors():
    import pytest

    from shady.routing import RouteError

    g = graph()
    g.add_node(9, x=300, y=0)
    g.add_node(10, x=310, y=0)
    g.add_edge(9, 10, length=10, geometry=LineString([(300, 0), (310, 0)]))
    p = RoutePlanner(g, box(-500, -500, 500, 500), ShadeEngine([], "v", lambda _: (45, 90)))
    for origin, dest, code in [
        ((501, 0), (0, 0), "outside_coverage"),
        ((0, 200), (0, 0), "snap_too_far"),
        ((0, 0), (300, 0), "no_path"),
    ]:
        with pytest.raises(RouteError) as caught:
            p.plan(origin, dest, AT)
        assert caught.value.code == code
    empty = RoutePlanner(nx.MultiDiGraph(), box(-1, -1, 1, 1), p.shade)
    with pytest.raises(RouteError) as caught:
        empty.plan((0, 0), (0, 0), AT)
    assert caught.value.code == "no_path"


def test_night_low_sun_and_zero_length_do_not_claim_full_shade():
    for elevation, status, sunny in [(-5, "night", 0), (3, "low_sun", None)]:
        p = RoutePlanner(
            graph(), box(-100, -100, 200, 200), ShadeEngine([], "v", lambda _: (elevation, 90))
        )
        result = p.plan((0, 0), (100, 0), AT)
        assert result["shade_status"] == status
        assert result["routes"][0]["shade_pct"] is None
        assert result["routes"][0]["sunny_m"] == sunny
    p = RoutePlanner(graph(), box(-100, -100, 200, 200), ShadeEngine([], "v", lambda _: (45, 90)))
    assert p.plan((25, 0), (25, 0), AT)["routes"][0]["distance_m"] == 0
    assert p.plan((0, 0), (0, 0), AT)["routes"][0]["shade_pct"] is None


def test_planning_virtual_endpoints_never_mutates_the_shared_city_graph():
    g = graph()
    before = {edge: dict(g.edges[edge]) for edge in g.edges(keys=True)}
    p = RoutePlanner(g, box(-100, -100, 200, 200), ShadeEngine([], "v", lambda _: (45, 90)))
    first = p.plan((25, 1), (75, 1), AT)
    assert p.plan((25, 1), (75, 1), AT) == first
    assert set(g.nodes) == {1, 2, 3, 4}
    assert {edge: dict(g.edges[edge]) for edge in g.edges(keys=True)} == before


def test_valid_detour_crosses_multiple_shadow_tiles():
    g = graph()
    for node in g.nodes:
        g.nodes[node]["x"] *= 10
        g.nodes[node]["y"] *= 5
    for u, v, k, d in g.edges(keys=True, data=True):
        line = LineString([(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])])
        d["geometry"] = line
        d["length"] = line.length
    shade = ShadeEngine([Building("long", box(-10, 50, 1010, 150), 1)], "v", lambda _: (90, 0))
    p = RoutePlanner(g, box(-100, -100, 1100, 200), shade)
    result = p.plan((0, 0), (1000, 0), AT)
    assert result["routes"][1]["distance_m"] == 1200
    assert result["routes"][1]["sunny_m"] == 100
    assert result["sunny_m_saved"] == 900
    assert len(shade.cache) >= 3
