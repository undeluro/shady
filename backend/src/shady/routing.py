"""Routing on the mapped walking network; calculations stay in meter coordinates."""

import time

import networkx as nx
from shapely import STRtree
from shapely.geometry import LineString, Point, mapping
from shapely.ops import substring

from .diagnostics import event


class RouteError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class RoutePlanner:
    def __init__(self, graph, boundary, shade):
        self.graph, self.boundary, self.shade = graph, boundary, shade
        for u, v, k, data in graph.edges(keys=True, data=True):
            line = data["geometry"]
            start = Point(graph.nodes[u]["x"], graph.nodes[u]["y"])
            if start.distance(Point(line.coords[-1])) < start.distance(Point(line.coords[0])):
                data["geometry"] = LineString(list(line.coords)[::-1])
        self.edges = list(graph.edges(keys=True))
        self.tree = STRtree([graph.edges[e]["geometry"] for e in self.edges])

    def _snapped_graph(self, origin, destination):
        # Copy outer adjacency maps only; clone the two cut neighborhoods below.
        # NetworkX 3.x internals let virtual endpoint edits avoid a full-city copy.
        graph = nx.MultiDiGraph()
        graph.graph = self.graph.graph.copy()
        graph._node = self.graph._node.copy()
        graph._succ = self.graph._succ.copy()
        graph._pred = self.graph._pred.copy()
        graph._adj = graph._succ
        cuts = {}
        points = []
        next_id = -1
        for xy in (origin, destination):
            point = Point(xy)
            if not self.boundary.covers(point):
                raise RouteError("outside_coverage", "Choose a point inside Kraków.")
            index = self.tree.nearest(point)
            if index is None:
                raise RouteError("no_path", "No mapped walking paths are available.")
            edge = self.edges[int(index)]
            line = self.graph.edges[edge]["geometry"]
            snapped = line.interpolate(line.project(point))
            distance = point.distance(snapped)
            if distance > 100:
                raise RouteError(
                    "snap_too_far", "No mapped walking path within 100 m. Move the pin."
                )
            u, v, _ = edge
            if snapped.distance(Point(line.coords[0])) < 1e-6:
                node = u
            elif snapped.distance(Point(line.coords[-1])) < 1e-6:
                node = v
            else:
                matching = next((n for n, p, _ in points if p.distance(snapped) < 1e-6), None)
                node = matching if matching is not None else next_id
                if matching is None:
                    next_id -= 1
                    graph.add_node(node, x=snapped.x, y=snapped.y)
                cuts.setdefault(edge, []).append((node, snapped))
                for key, data in self.graph.get_edge_data(v, u, default={}).items():
                    if data["geometry"].equals(line):
                        cuts.setdefault((v, u, key), []).append((node, snapped))
            points.append((node, snapped, distance))
        affected = {n for u, v, k in cuts for n in (u, v)}
        for n in affected:
            graph._succ[n] = graph._succ[n].copy()
            graph._pred[n] = graph._pred[n].copy()
        for u, v in {(u, v) for u, v, k in cuts}:
            keys = graph._succ[u][v].copy()
            graph._succ[u][v] = keys
            graph._pred[v][u] = keys
        for edge, items in cuts.items():
            data = self.graph.edges[edge]
            line = data["geometry"]
            unique = {n: p for n, p in items}
            ordered = [
                (0, edge[0]),
                *[(line.project(p), n) for n, p in unique.items()],
                (line.length, edge[1]),
            ]
            ordered.sort()
            graph.remove_edge(*edge)
            for (start, u), (end, v) in zip(ordered, ordered[1:]):
                if end - start > 1e-8:
                    segment = substring(line, start, end)
                    graph.add_edge(u, v, **{**data, "geometry": segment, "length": segment.length})
        return graph, points

    def plan(self, origin, destination, departure):
        started = time.perf_counter()
        at, _, _, status = self.shade.context(departure)
        graph, points = self._snapped_graph(origin, destination)
        source, target = points[0][0], points[1][0]
        try:
            shortest = nx.shortest_path(graph, source, target, weight="length")
        except nx.NetworkXNoPath as error:
            raise RouteError(
                "no_path", "These points have no connected mapped walking route."
            ) from error
        distance = self._path_length(graph, shortest, 0)
        event(
            "routes.shortest",
            distance_m=round(distance, 2),
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        limit = distance * 1.25
        forward = nx.single_source_dijkstra_path_length(
            graph, source, cutoff=limit, weight="length"
        )
        backward = nx.single_source_dijkstra_path_length(
            graph.reverse(copy=False), target, cutoff=limit, weight="length"
        )
        eligible = nx.MultiDiGraph()
        eligible.add_nodes_from([source, target])
        for u, v, k, data in graph.edges(forward, keys=True, data=True):
            if (
                forward.get(u, float("inf")) + data["length"] + backward.get(v, float("inf"))
                <= limit + 1e-7
            ):
                shaded = (
                    min(data["length"], self.shade.shaded_length(data["geometry"], at))
                    if status == "available"
                    else 0
                )
                eligible.add_edge(
                    u, v, key=k, **{**data, "shaded": shaded, "sunny": data["length"] - shaded}
                )
        event(
            "routes.eligible",
            edges=eligible.number_of_edges(),
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        candidates = []
        for penalty in (0, 1, 2, 4, 8, 16, 32):
            path = nx.shortest_path(eligible, source, target, weight=self._weight(penalty))
            edges = self._path_edges(eligible, path, penalty)
            length = sum(data["length"] for data in edges)
            sunny = sum(data["sunny"] for data in edges)
            if length <= limit + 1e-7:
                candidates.append((sunny, length, edges))
        event(
            "routes.candidates",
            candidates=len(candidates),
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
        )
        shortest_edges = self._path_edges(eligible, shortest, 0)
        best = min(candidates, key=lambda p: (round(p[0], 7), round(p[1], 7)))[2]
        routes = [
            self._result(shortest_edges, "shortest", status, points, at),
            self._result(best, "shaded", status, points, at),
        ]
        improved = status == "available" and routes[1]["sunny_m"] < routes[0]["sunny_m"] - 0.01
        return {
            "effective_at": at.isoformat(),
            "dataset_version": self.shade.version,
            "shade_status": status,
            "shade_model": self.shade.model(at),
            "routes": routes,
            "recommendation_status": "improved" if improved else "no_improvement",
            "added_minutes": max(0, (routes[1]["duration_s"] - routes[0]["duration_s"]) / 60),
            "sunny_m_saved": round(routes[0]["sunny_m"] - routes[1]["sunny_m"], 2)
            if status == "available"
            else None,
            "snapped_endpoints": [
                {"coordinates": [p.x, p.y], "offset_m": round(d, 2)} for _, p, d in points
            ],
        }

    @staticmethod
    def _weight(penalty):
        return lambda u, v, edges: min(
            d["length"] + penalty * d.get("sunny", 0) for d in edges.values()
        )

    @staticmethod
    def _path_edges(graph, path, penalty):
        return [
            min(
                graph.get_edge_data(u, v).values(),
                key=lambda d: d["length"] + penalty * d.get("sunny", 0),
            )
            for u, v in zip(path, path[1:])
        ]

    def _path_length(self, graph, path, penalty):
        return sum(d["length"] for d in self._path_edges(graph, path, penalty))

    def _result(self, edges, profile, status, points, at):
        coordinates = []
        segments = []
        building_m = woodland_m = 0
        for edge in edges:
            line = edge["geometry"]
            coordinates.extend(list(line.coords) if not coordinates else list(line.coords)[1:])
            if status == "available":
                buildings, woodland = self.shade.layers_for(line.envelope.buffer(0.01), at)
                building_m += line.intersection(buildings).length
                woodland_m += line.intersection(woodland).length
                for geometry, label in [
                    (line.intersection(buildings), "shaded"),
                    (line.intersection(woodland), "woodland"),
                    (line.difference(buildings).difference(woodland), "sunny"),
                ]:
                    parts = (
                        [geometry]
                        if geometry.geom_type == "LineString"
                        else getattr(geometry, "geoms", [])
                    )
                    for part in parts:
                        if part.geom_type == "LineString" and part.length > 1e-7:
                            segments.append(
                                {
                                    "type": "Feature",
                                    "geometry": mapping(part),
                                    "properties": {"exposure": label},
                                }
                            )
            else:
                segments.append(
                    {
                        "type": "Feature",
                        "geometry": mapping(line),
                        "properties": {"exposure": "unavailable"},
                    }
                )
        if not coordinates:
            p = points[0][1]
            coordinates = [(p.x, p.y), (p.x, p.y)]
        length = sum(d["length"] for d in edges)
        shaded = sum(d["shaded"] for d in edges)
        return {
            "profile": profile,
            "shade_model": self.shade.model(at),
            "building_shaded_m": round(building_m, 2) if status == "available" else None,
            "woodland_m": round(woodland_m, 2) if status == "available" else None,
            "distance_m": round(length, 2),
            "duration_s": round(length / 1.3, 2),
            "shaded_m": round(shaded, 2) if status == "available" else None,
            "sunny_m": round(length - shaded, 2)
            if status == "available"
            else (0 if status == "night" else None),
            "shade_pct": round(shaded / length * 100, 1)
            if status == "available" and length
            else None,
            "geometry": mapping(LineString(coordinates)),
            "segments": {"type": "FeatureCollection", "features": segments},
        }
