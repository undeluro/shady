"""Verify a deployed API using a public hackathon route; prints timings as JSON."""

import argparse
import json
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument("base_url")
parser.add_argument("--search", action="store_true", help="Also submit one public address search")
parser.add_argument(
    "--cross-city", action="store_true", help="Route to Plac Centralny in Nowa Huta"
)
args = parser.parse_args()
base = args.base_url.rstrip("/")


def request(path, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = Request(base + path, data=body, headers={"Content-Type": "application/json"})
    started = time.perf_counter()
    try:
        with urlopen(req, timeout=300) as response:
            assert response.headers.get("X-Request-ID")
            return response.status, json.load(response), round(time.perf_counter() - started, 3)
    except HTTPError as error:
        return error.code, json.load(error), round(time.perf_counter() - started, 3)


code, health, health_s = request("/health")
assert code == 200 and health["ready"], health
code, metadata, _ = request("/v1/metadata")
assert code == 200 and metadata["dataset_version"] == health["dataset_version"]
payload = {
    "origin": {"longitude": 19.9373, "latitude": 50.0617},
    "destination": {"longitude": 19.9356, "latitude": 50.0542},
    "departure_at": "2026-07-01T13:00:00+02:00",
}
if args.cross_city:
    payload["destination"] = {"longitude": 20.0372, "latitude": 50.0713}
code, route, cold_s = request("/v1/routes", payload)
assert code == 200 and route["routes"], route
shortest = min(r["distance_m"] for r in route["routes"])
assert all(r["distance_m"] <= 1.25 * shortest + 0.02 for r in route["routes"])
code, warm, warm_s = request("/v1/routes", payload)
assert code == 200 and warm == route
code, shade, shade_s = request(
    "/v1/shade?"
    + urlencode(
        {
            "bbox": "19.932,50.052,19.941,50.064",
            "departure_at": route["effective_at"],
            "zoom": 16,
        }
    )
)
assert code == 200 and shade["shadows"]["features"], shade
assert shade["effective_at"] == route["effective_at"]
assert shade["dataset_version"] == route["dataset_version"] == metadata["dataset_version"]
code, invalid, _ = request(
    "/v1/routes",
    {
        **payload,
        "origin": {"latitude": 51, "longitude": 20},
    },
)
assert code == 422 and invalid["error"]["code"] == "outside_coverage", invalid
result = {
    "base_url": base,
    "cross_city": args.cross_city,
    "dataset_version": route["dataset_version"],
    "health_s": health_s,
    "first_route_s": cold_s,
    "repeated_route_s": warm_s,
    "shade_s": shade_s,
    "routes": len(route["routes"]),
    "shadow_polygons": len(shade["shadows"]["features"]),
    "effective_at": route["effective_at"],
}
if args.search:
    code, search, search_s = request("/v1/search?" + urlencode({"q": "Wawel Kraków"}))
    assert code == 200 and search["results"], search
    result.update(search_results=len(search["results"]), search_s=search_s)
print(json.dumps(result, indent=2))
