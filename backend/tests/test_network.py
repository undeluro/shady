from shady.network import walk_allowed


def test_private_and_prohibited_ways_are_excluded_but_explicit_foot_permission_is_respected():
    assert not walk_allowed({"highway": "residential", "access": "private"})
    assert not walk_allowed({"highway": "footway", "foot": "no"})
    assert not walk_allowed({"highway": "primary", "sidewalk": "separate"})
    assert not walk_allowed({"highway": "motorway"})
    assert walk_allowed({"highway": "pedestrian"})
    assert walk_allowed({"highway": "service", "access": "no", "foot": "yes"})
    assert not walk_allowed({"highway": "service", "service": "private"})
    assert not walk_allowed({})
    assert not walk_allowed({"highway": "pedestrian", "area": "yes"})


def test_customer_permit_and_destination_access_require_explicit_public_foot_override():
    for restriction in (
        "customers",
        "permit",
        "destination",
        "delivery",
        "agricultural",
        "forestry",
    ):
        assert not walk_allowed({"highway": "footway", "foot": restriction})
        assert not walk_allowed({"highway": "footway", "access": restriction})
        assert walk_allowed({"highway": "footway", "access": restriction, "foot": "yes"})


def test_pedestrian_oneway_respects_osm_direction_without_vehicle_oneway():
    import networkx as nx

    from shady.network import pedestrian_graph

    g = nx.MultiDiGraph(crs="EPSG:4326")
    for u, v, tags in [
        (1, 2, {"oneway:foot": "yes"}),
        (2, 3, {"oneway:foot": "-1"}),
        (3, 4, {"oneway": True}),
        (4, 5, {"foot:backward": "no"}),
    ]:
        tags = {"highway": "footway", **tags}
        g.add_edge(u, v, **tags, reversed=False)
        g.add_edge(v, u, **tags, reversed=True)
    pedestrian_graph(g)
    assert set(g.edges()) == {(1, 2), (3, 2), (3, 4), (4, 3), (4, 5)}


def test_boundary_clip_retains_city_path_and_preserves_reverse_connectivity():
    from datetime import datetime, timezone

    import networkx as nx
    from shapely.geometry import LineString, box

    from shady.network import clip_graph
    from shady.routing import RoutePlanner
    from shady.tiles import ShadeEngine

    boundary = box(0, 0, 100, 100)
    g = nx.MultiDiGraph(crs="EPSG:2180")
    for n, x in [(1, -20), (2, 80), (3, 130)]:
        g.add_node(n, x=x, y=50)
    for u, v in [(1, 2), (2, 1), (2, 3), (3, 2)]:
        line = LineString([(g.nodes[u]["x"], 50), (g.nodes[v]["x"], 50)])
        g.add_edge(u, v, geometry=line, length=line.length)
    clip_graph(g, boundary)
    assert g.number_of_edges() == 4
    assert sum(d["length"] for _, _, d in g.edges(data=True)) == 200
    assert all(boundary.covers(d["geometry"]) for _, _, d in g.edges(data=True))
    planner = RoutePlanner(g, boundary, ShadeEngine([], "clip"))
    at = datetime(2026, 7, 1, 11, tzinfo=timezone.utc)
    result = planner.plan((5, 50), (95, 50), at)
    assert result["routes"][0]["distance_m"] == 90
    assert planner.plan((95, 50), (5, 50), at)["routes"][0]["distance_m"] == 90


def test_city_holes_keep_separate_directed_portions_without_connecting_outside_paths():
    import networkx as nx
    from shapely.geometry import LineString, Polygon, box

    from shady.network import clip_graph

    boundary = Polygon(
        [(0, 0), (100, 0), (100, 100), (0, 100)], holes=[[(40, 40), (60, 40), (60, 60), (40, 60)]]
    )
    g = nx.MultiDiGraph(crs="EPSG:2180")
    for n, xy in {
        1: (10, 50),
        2: (90, 50),
        3: (-10, -10),
        4: (0, 0),
        5: (10, 10),
        6: (20, 10),
    }.items():
        g.add_node(n, x=xy[0], y=xy[1])
    # Reversed source geometry is normalized before cutting; city hole divides this one-way path.
    g.add_edge(1, 2, geometry=LineString([(90, 50), (10, 50)]), length=80)
    # Only touches the boundary at one point: no walkable edge should remain.
    g.add_edge(3, 4, geometry=LineString([(-10, -10), (0, 0)]), length=14)
    # Entirely interior edge with no geometry gets normalized from its nodes.
    g.add_edge(5, 6, length=10)
    clip_graph(g, boundary)
    assert sorted(d["length"] for _, _, d in g.edges(data=True)) == [10, 30, 30]
    assert not nx.has_path(g, 1, 2)
    assert all(boundary.covers(d["geometry"]) for _, _, d in g.edges(data=True))
    empty = nx.MultiDiGraph()
    assert clip_graph(empty, box(0, 0, 1, 1)).number_of_nodes() == 0
