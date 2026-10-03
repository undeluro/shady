import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from shapely.geometry import Point, box, mapping, shape
from shapely.ops import transform

from .dataset import TO_GEO, TO_LOCAL, load_dataset
from .diagnostics import configure_logging, event, failure, new_request_id, request_id
from .routing import RouteError
from .tiles import LEAF_ON_MONTHS, WOODLAND_WEIGHT

ROOT = Path(__file__).resolve().parents[3]


class Position(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RouteRequest(BaseModel):
    origin: Position
    destination: Position
    departure_at: AwareDatetime


class Geocoder:
    def __init__(self, boundary, cache_file=None, transport=None, clock=time.monotonic):
        self.boundary = boundary
        self.cache_file = Path(cache_file) if cache_file else None
        self.cache = (
            json.loads(self.cache_file.read_text())
            if self.cache_file and self.cache_file.exists()
            else {}
        )
        self.lock = asyncio.Lock()
        self.last = -1.0
        self.clock = clock
        self.client = httpx.AsyncClient(
            transport=transport,
            timeout=8,
            headers={"User-Agent": "ShadyHackathon/0.1 (Krakow walking MVP)"},
        )

    async def search(self, query):
        key = query.strip().casefold()
        async with self.lock:
            if key in self.cache:
                event("search.cache_hit", results=len(self.cache[key]))
                return self.cache[key]
            event("search.cache_miss")
            delay = 1 - (self.clock() - self.last)
            if delay > 0:
                event("search.rate_limit_wait", duration_ms=round(delay * 1000, 2))
                await asyncio.sleep(delay)
            self.last = self.clock()
            left, bottom, right, top = self.boundary.bounds
            started = time.perf_counter()
            response = await self.client.get(
                os.getenv("SHADY_GEOCODER_URL", "https://nominatim.openstreetmap.org/search"),
                params={
                    "q": query,
                    "format": "jsonv2",
                    "limit": 5,
                    "countrycodes": "pl",
                    "bounded": 1,
                    "viewbox": f"{left},{top},{right},{bottom}",
                },
            )
            event(
                "search.provider_response",
                status=response.status_code,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list) or not all(isinstance(p, dict) for p in payload):
                raise ValueError("Malformed search provider response.")
            places = [
                {
                    "id": str(p["osm_type"]) + str(p["osm_id"]),
                    "name": p["display_name"],
                    "latitude": float(p["lat"]),
                    "longitude": float(p["lon"]),
                }
                for p in payload
                if self.boundary.covers(Point(float(p["lon"]), float(p["lat"])))
            ]
            places = places[:5]
            self.cache[key] = places
            if self.cache_file:
                self.cache_file.parent.mkdir(parents=True, exist_ok=True)
                self.cache_file.write_text(json.dumps(self.cache))
            event("search.completed", results=len(places))
            return places

    async def close(self):
        await self.client.aclose()


def geographic_routes(result):
    for route in result["routes"]:
        route["geometry"] = mapping(transform(TO_GEO, shape(route["geometry"])))
        for feature in route["segments"]["features"]:
            feature["geometry"] = mapping(transform(TO_GEO, shape(feature["geometry"])))
    for endpoint in result["snapped_endpoints"]:
        endpoint["coordinates"] = list(TO_GEO(*endpoint["coordinates"]))
    return result


def create_app(dataset=None, data_dir=None, geocoder=None):
    directory = Path(data_dir or os.getenv("SHADY_DATA_DIR", str(ROOT / "data/processed")))

    @asynccontextmanager
    async def lifespan(app):
        configure_logging(ROOT / "work/shady.log")
        started = time.perf_counter()
        event("dataset.loading")
        app.state.dataset = dataset
        app.state.load_error = None
        if dataset is None:
            try:
                app.state.dataset = await asyncio.to_thread(load_dataset, directory)
            except (FileNotFoundError, OSError, ValueError) as error:
                app.state.load_error = str(error)
                failure("dataset.failed", error)
        ds = app.state.dataset
        event(
            "dataset.ready" if ds else "dataset.unavailable",
            duration_ms=round((time.perf_counter() - started) * 1000, 2),
            dataset_version=ds.manifest["dataset_version"] if ds else None,
        )
        app.state.compute_lock = asyncio.Lock()
        app.state.geocoder = geocoder
        if app.state.dataset and geocoder is None:
            app.state.geocoder = Geocoder(
                app.state.dataset.boundary_geo, directory / "search-cache.json"
            )
        yield
        if app.state.geocoder:
            await app.state.geocoder.close()
        event("server.stopped")

    app = FastAPI(title="Shady Kraków", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    @app.exception_handler(RouteError)
    async def route_error(request, error):
        event("request.rejected", level="WARNING", code=error.code)
        return JSONResponse(
            status_code=422, content={"error": {"code": error.code, "message": str(error)}}
        )

    def get_dataset(request):
        if request.app.state.dataset is None:
            raise RouteError(
                "dataset_unavailable",
                "Prepare the real dataset with scripts/prepare_data.py first.",
            )
        return request.app.state.dataset

    @app.middleware("http")
    async def missing_dataset(request, call_next):
        if request.url.path.startswith("/v1/") and request.app.state.dataset is None:
            return JSONResponse(
                status_code=503,
                content={
                    "error": {
                        "code": "dataset_unavailable",
                        "message": "The city dataset is not loaded. Run data preparation.",
                    }
                },
            )
        return await call_next(request)

    @app.middleware("http")
    async def diagnostics(request, call_next):
        correlation = new_request_id(request.headers.get("X-Request-ID"))
        token = request_id.set(correlation)
        started = time.perf_counter()
        # Restrict logged paths to known API names; never log a query or arbitrary URL.
        path = (
            request.url.path
            if request.url.path
            in {
                "/health",
                "/v1/metadata",
                "/v1/search",
                "/v1/routes",
                "/v1/shade",
                "/docs",
                "/openapi.json",
            }
            else "other"
        )
        event("http.started", path=path, method=request.method)
        try:
            try:
                response = await call_next(request)
            except Exception as error:
                failure("http.failed", error)
                response = JSONResponse(
                    status_code=500,
                    content={
                        "error": {
                            "code": "internal_error",
                            "message": "The server could not complete this request.",
                        }
                    },
                )
            response.headers["X-Request-ID"] = correlation
            event(
                "http.completed",
                path=path,
                method=request.method,
                status=response.status_code,
                duration_ms=round((time.perf_counter() - started) * 1000, 2),
                level="ERROR" if response.status_code >= 500 else "INFO",
            )
            return response
        finally:
            request_id.reset(token)

    async def compute(request, name, operation, *args):
        queued = time.perf_counter()
        event(name + ".queued")
        async with request.app.state.compute_lock:
            started = time.perf_counter()
            engine = request.app.state.dataset.planner.shade
            before = engine.stats.copy()
            event(name + ".started", queue_ms=round((started - queued) * 1000, 2))
            result = await asyncio.to_thread(operation, *args)
            event(
                name + ".completed",
                queue_ms=round((started - queued) * 1000, 2),
                compute_ms=round((time.perf_counter() - started) * 1000, 2),
                **{key: engine.stats[key] - before[key] for key in before},
            )
            return result

    @app.get("/health")
    async def health(request: Request):
        ds = request.app.state.dataset
        return {
            "ready": ds is not None,
            "dataset_version": ds.manifest["dataset_version"] if ds else None,
        }

    @app.get("/v1/metadata")
    async def metadata(request: Request):
        ds = get_dataset(request)
        return {
            **ds.manifest,
            "coverage_polygon": mapping(ds.boundary_geo),
            "coverage_bbox": list(ds.boundary_geo.bounds),
            "model": (
                "Building shade at departure plus weighted OSM woodland estimate; "
                "flat ground; no clouds or projected tree shadows."
                if ds.planner.shade.woodland
                else "Building shade estimate at departure; woodland data not loaded; no clouds."
            ),
            "woodland_model": {
                "available": bool(ds.planner.shade.woodland),
                "weight": WOODLAND_WEIGHT,
                "leaf_on_months": list(LEAF_ON_MONTHS),
                "assumption": "Heuristic woodland benefit, not measured canopy transmission.",
            },
            "walking_speed_m_s": 1.3,
            "detour_cap": 0.25,
            "demo_scenarios": ["10:00", "13:00", "16:00"],
        }

    @app.post("/v1/routes")
    async def routes(body: RouteRequest, request: Request):
        ds = get_dataset(request)
        origin = TO_LOCAL(body.origin.longitude, body.origin.latitude)
        destination = TO_LOCAL(body.destination.longitude, body.destination.latitude)
        result = await compute(
            request, "routes", ds.planner.plan, origin, destination, body.departure_at
        )
        event(
            "routes.result",
            effective_at=result["effective_at"],
            dataset_version=result["dataset_version"],
            shade_status=result["shade_status"],
            recommendation=result["recommendation_status"],
            distance_m=result["routes"][0]["distance_m"],
            sunny_m_saved=result["sunny_m_saved"],
        )
        return geographic_routes(result)

    @app.get("/v1/shade")
    async def shade(request: Request, bbox: str, departure_at: AwareDatetime, zoom: float = 16):
        ds = get_dataset(request)
        try:
            values = [float(v) for v in bbox.split(",")]
            if len(values) != 4 or not (
                -180 <= values[0] < values[2] <= 180 and -90 <= values[1] < values[3] <= 90
            ):
                raise ValueError()
        except ValueError:
            raise RouteError("invalid_bbox", "Supply west,south,east,north coordinates.") from None
        area = transform(TO_LOCAL, box(*values)).intersection(ds.planner.boundary)
        at, _, _, status = ds.planner.shade.context(departure_at)
        detail = zoom >= 14 and not area.is_empty and area.area <= 16_000_000
        features = []
        if detail and status == "available":
            layers = await compute(request, "shade", ds.planner.shade.layers_for, area, at)
            for source, geometry in zip(("building", "woodland"), layers):
                geometry = geometry.simplify(0.75, preserve_topology=True)
                geometry = transform(TO_GEO, geometry).intersection(ds.boundary_geo)
                parts = (
                    [geometry]
                    if geometry.geom_type == "Polygon"
                    else getattr(geometry, "geoms", [])
                )
                features.extend(
                    {"type": "Feature", "properties": {"source": source}, "geometry": mapping(p)}
                    for p in parts
                    if p.geom_type == "Polygon" and not p.is_empty
                )
        event(
            "shade.result",
            effective_at=at.isoformat(),
            detail_available=detail,
            shade_status=status,
            polygons=len(features),
        )
        return {
            "effective_at": at.isoformat(),
            "dataset_version": ds.manifest["dataset_version"],
            "detail_available": detail,
            "shade_status": status,
            "shade_model": ds.planner.shade.model(at),
            "shadows": {"type": "FeatureCollection", "features": features},
        }

    @app.get("/v1/search")
    async def search(request: Request, q: str = Query(min_length=2, max_length=200)):
        if len(q.strip()) < 2:
            raise RouteError("invalid_query", "Enter at least two characters.")
        try:
            return {"results": await request.app.state.geocoder.search(q)}
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            failure("search.failed", error)
            return JSONResponse(
                status_code=503,
                content={
                    "error": {
                        "code": "search_unavailable",
                        "message": "Address search is unavailable. Choose a landmark or map pin.",
                    }
                },
            )

    return app


app = create_app()
