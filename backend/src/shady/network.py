"""Public walking access, matching OSMnx walk exclusions with explicit access checks."""

import re

EXCLUDED = re.compile(
    "abandoned|bus_guideway|construction|cycleway|motor|no|planned|platform|proposed|raceway|razed|rest_area|services"
)


PUBLIC_FOOT = {"yes", "designated", "permissive"}
RESTRICTED = {
    "no",
    "private",
    "customers",
    "permit",
    "destination",
    "delivery",
    "agricultural",
    "forestry",
}


def walk_allowed(tags):
    highway = tags.get("highway", "")
    if not highway or EXCLUDED.search(highway) or tags.get("area") == "yes":
        return False
    if tags.get("foot") in RESTRICTED:
        return False
    if tags.get("access") in RESTRICTED and tags.get("foot") not in PUBLIC_FOOT:
        return False
    if tags.get("service") == "private":
        return False
    return all(
        tags.get(k) != "separate"
        for k in ("sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right")
    )


def pedestrian_graph(graph):
    """Filter unsimplified OSMnx bidirectional edges by pedestrian access/direction."""
    remove = []
    for u, v, key, tags in graph.edges(keys=True, data=True):
        reverse = tags.get("reversed", False)
        one_way = str(tags.get("oneway:foot", "no")).lower()
        side = "backward" if reverse else "forward"
        if (
            not walk_allowed(tags)
            or tags.get("foot:" + side) in RESTRICTED
            or (reverse and one_way in {"yes", "true", "1"})
            or (not reverse and one_way in {"-1", "reverse"})
        ):
            remove.append((u, v, key))
    graph.remove_edges_from(remove)
    return graph


def clip_graph(graph, boundary):
    """Keep every interior line part, sharing new boundary nodes across directions."""
    from shapely.geometry import LineString, Point

    next_id = max(graph.nodes, default=0) + 1
    boundary_nodes = {}

    def endpoint(xy, original):
        nonlocal next_id
        node = graph.nodes[original]
        if Point(node["x"], node["y"]).distance(Point(xy)) < 1e-7:
            return original
        key = tuple(round(value, 7) for value in xy)
        if key not in boundary_nodes:
            boundary_nodes[key] = next_id
            graph.add_node(next_id, x=xy[0], y=xy[1], boundary=True)
            next_id += 1
        return boundary_nodes[key]

    def lines(geometry):
        if geometry.geom_type == "LineString":
            yield geometry
        elif hasattr(geometry, "geoms"):
            for part in geometry.geoms:
                yield from lines(part)

    for u, v, key, data in list(graph.edges(keys=True, data=True)):
        line = data.get(
            "geometry",
            LineString(
                [
                    (graph.nodes[u]["x"], graph.nodes[u]["y"]),
                    (graph.nodes[v]["x"], graph.nodes[v]["y"]),
                ]
            ),
        )
        if Point(graph.nodes[u]["x"], graph.nodes[u]["y"]).distance(Point(line.coords[-1])) < Point(
            graph.nodes[u]["x"], graph.nodes[u]["y"]
        ).distance(Point(line.coords[0])):
            line = LineString(list(line.coords)[::-1])
        if boundary.covers(line):
            data.update(geometry=line, length=line.length)
            continue
        graph.remove_edge(u, v, key)
        for part in lines(line.intersection(boundary)):
            if part.length <= 1e-7:
                continue
            # GEOS intersection preserves source line orientation.
            start, end = endpoint(part.coords[0], u), endpoint(part.coords[-1], v)
            graph.add_edge(start, end, **{**data, "geometry": part, "length": part.length})
    graph.remove_nodes_from([node for node in graph if graph.degree(node) == 0])
    return graph
