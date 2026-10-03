# Shady — Technical guide

[← Back to Shady](../README.md) · [Logging plan](LOGGING-PLAN.md)


## Run on a phone
Prerequisites: Node 22+, uv, Python 3.12, and an Expo Go version supporting SDK 57 (or an Expo development build). Phone and laptop must share Wi-Fi or a hotspot.

```sh
cd ~/Developer/shady/backend
uv sync --locked
uv run uvicorn shady.api:app --host 0.0.0.0 --port 8000 --no-access-log
```
The prepared local dataset is already in `data/processed`. Startup loads it into memory and takes roughly 17 seconds on the development laptop. Check `http://localhost:8000/health` for `ready: true`.

In another terminal:
```sh
cd ~/Developer/shady/mobile
npm ci
EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_LAN_IP:8000 npx expo start --go --lan
```
Scan the QR code using Expo Go. On macOS, `ipconfig getifaddr en0` usually shows the Wi-Fi IP. If Ethernet is also connected, prefix the Expo command with `REACT_NATIVE_PACKAGER_HOSTNAME=YOUR_LAPTOP_LAN_IP` so the QR advertises Wi-Fi rather than Ethernet. Use the active hotspot/network interface if different. Allow incoming connections to Python when macOS asks. A phone cannot reach the laptop through `localhost`. No API key is needed on iOS; Android development builds using Google Maps need the usual platform API-key configuration. Expo Go uses its bundled map configuration.

On macOS with Xcode installed, `npx expo start --ios` opens the simulator. In Xcode 26 Device Hub, choose **Device → Location → Custom Coordinates…** and use latitude `50.0617`, longitude `19.9373` for a Kraków GPS test. Older Simulator versions use **Features → Location**. Enable the software keyboard through **Device → Keyboard → Toggle Software Keyboard** when testing address entry. A simulated position is a test fixture, not your real location.

Browser preview: `npm run web`. It uses Leaflet with visible OpenStreetMap attribution. Native uses `react-native-maps`. Saved demo uses the bundled local SVG map on both platforms.

## Use
- Submit a destination search, choose your start, or long press the map to place a pin. Browser: right click to place a pin.
- Tap the arrow to use your current location and recenter the camera. Permission denial or an unavailable fix leaves manual start selection available.
- Compare **Shortest** and **More shade**; tap a card to change the displayed route. Yellow segments are sunny; teal segments are shaded. The legend appears just above the sheet when a route is displayed.
- Tap **Start walk** to follow the selected route with foreground GPS, remaining distance/time, progress, off-route notices and arrival. Panning pauses camera following; the arrow resumes it. Keep Shady open during the walk. Saved routes offer a clearly labeled **Preview saved walk** with GPS off.
- Drag the results sheet through 15%, 35%, and 70%. Select departure time; its label follows the slider and calculations commit on release. Dates and times are in **Europe/Warsaw**.
- Select a 10:00, 13:00, or 16:00 saved summer walk. **Saved demo** is visibly labeled and works without the backend after Expo has loaded the bundle. Live failures stay explicit; they never silently use a demo.

## Rebuild the real data
Run from the project root. Acquisition occurs only here, never during routing requests.
```sh
uv run --directory backend python "$PWD/scripts/download_data.py"
uv run --directory backend python "$PWD/scripts/extract_walk.py"
uv run --directory backend python "$PWD/scripts/prepare_data.py"
uv run --directory backend python "$PWD/scripts/verify_city.py"
```
The download is about 280 MB: Kraków plus neighboring county building archives, and the Małopolskie regional OSM snapshot. Raw and processed files are ignored by Git. The small real demo geometry/results are versioned in the app. Rebuilding overwrites generated demo and benchmark files. Preparation resumes by reusing existing GraphML/Parquet artifacts; automatic invalidation is a deferred limitation. When raw inputs or import rules change, move `data/processed/walk.graphml` and/or `buildings.parquet` into a backup directory before running preparation, so the corresponding artifact is regenerated. The current delivered graph was explicitly regenerated after the access/direction/boundary fixes.

Overpass timed out in this environment. The implemented fallback streams the regional Geofabrik PBF, applies OSMnx walking exclusions plus explicit access checks, and uses OSMnx's XML importer with `retain_all=True`. It preserves disconnected components. Pedestrian direction restrictions (`oneway:foot`, `foot:forward/backward`) are preserved; vehicle-only one-way restrictions do not constrain walking. Customer-only, permit-only, private and other restricted pedestrian paths are excluded unless there is explicit public pedestrian permission. Walking edges are projected to EPSG:2180 and clipped into city-side portions with boundary nodes against the actual city polygon. Nodes outside it or paths with no connected route produce explicit errors. Origins/destinations snap to edges within 100 m; displayed offsets are connectors, not validated walking paths. The graph contains 2,341 disconnected components; coverage is not a promise of access to every address.

The building parser preserves ground footprints and courtyard holes, using measured heights or roof-ground differences. LoD1 is a simplified historical model. Tile halos include neighboring buildings; city output is clipped to the boundary. 500 m shadow tiles and exact edge shade fractions are cached by the dataset and ten-minute snapshot. Endpoint insertion uses isolated adjacency overlays, leaving the shared graph unchanged.

## Model and limits
Shadows sweep vertical building footprints opposite the sun, by `height / tan(solar elevation)`. Solar position is computed with pvlib at central Kraków. Ground is approximately flat. Trees, terrain, clouds, and changes during a walk are excluded. Below 5° sun elevation, shade estimates are unavailable. At night no artificial 100% shade is shown. Walking speed is 1.3 m/s. Walking navigation follows the highlighted route while the app is open. There are no voice/turn instructions, background tracking or automatic rerouting. Arrival refers to the mapped route endpoint; pin-to-path offsets remain unvalidated connectors.

Shortest distance D is computed first. Eligible directed edges satisfy `distance_from_start + edge_length + distance_to_finish <= 1.25 D`. Candidates use penalties 0, 1, 2, 4, 8, 16, and 32 on sunny length. Over-cap candidates are rejected; choose least sunny length, then shortest distance. This is a heuristic, not a globally optimal constrained-path solver. There is no walk-distance cap. Long routes may take substantially longer.

## Verification and performance
```sh
cd backend
uv run pytest --cov=shady --cov-branch --cov-report=json --cov-report=term-missing
uv run python ../scripts/check_coverage.py coverage.json
uv run ruff check src tests
cd ../mobile
npm run test:coverage
npm run typecheck
npm run lint
npx expo-doctor
```
Python core gates: **95% lines / 90% branches**. Mobile critical logic: **90% lines / branches**. Tests cover actual geometry/routing; external HTTP and native services are mocked at their boundaries.

Real dataset acceptance and timings are recorded in [measured benchmarks](benchmark.json): Stare Miasto, Podgórze, Nowa Huta, western Kraków, and a cross-district walk. Cold clears tile and edge caches; warm repeats the same request. Timings measure the planning core, excluding startup, network latency, and phone rendering. The current cross-city route exceeds the 10-second cold / 2-second warm targets; local district routes meet them. These are measured examples, not worst-case guarantees.

See [device checks](DEVICE-CHECKS.md) for native acceptance checks. A browser review does not establish native gesture smoothness, GPS accuracy, or frame rate.

## Sources and attribution
- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Administrative relation 449696; walking data from [Geofabrik Małopolskie](https://download.geofabrik.de/europe/poland/malopolskie.html).
- [GUGiK LoD1 2024 buildings](https://www.geoportal.gov.pl/en/data/other-data/3d-models-of-building/), CC BY 4.0; normalized for shade modeling. Archives: [Kraków 1261](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/12/1261.zip), [Krakowski 1206](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/12/1206.zip), [Wielicki 1219](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/12/1219.zip).
- Search: [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), server-side submitted searches only, identifying User-Agent, disk cache, one upstream request/second across the **single demo server process**. Do not run multiple workers against the public endpoint; use a shared limiter or another provider for deployment. Configure `SHADY_GEOCODER_URL` to change provider.
- Browser tiles follow the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). Only visible map tiles are requested. Offline demo geometry is generated from the OSM dataset, not downloaded tiles.

## API
`GET /health`, `GET /v1/metadata`, `GET /v1/search?q=…`, `POST /v1/routes`, `GET /v1/shade?bbox=west,south,east,north&departure_at=ISO8601&zoom=16`. Interactive schemas: `http://localhost:8000/docs`.

## Diagnostics: what happened to my walk?

Backend events are JSON lines in the backend terminal and `work/shady.log` at the project root. Files rotate at **5 MiB**, retaining **three backups**. Start without raw Uvicorn access logs so submitted addresses are not printed as query strings:

```sh
cd ~/Developer/shady/backend
uv run uvicorn shady.api:app --host 0.0.0.0 --port 8000 --no-access-log
```

Set `SHADY_LOG_LEVEL=DEBUG|INFO|WARNING|ERROR` (default INFO). Set `SHADY_LOG_FILE=/path/to/shady.log` to change the file, or `SHADY_LOG_FILE=` for terminal-only logs. Keep the demo server on a single worker, as required by the public search provider limiter. Avoid enabling raw HTTP debug/access logs when collecting these diagnostics.

Phone events appear as JSON lines in the Expo/Metro terminal. Set `EXPO_PUBLIC_LOG_LEVEL=debug|info|warn|error|off` before starting Expo. Default is `info` in development and `warn` in production. Debug includes cancelled/stale planning work. All levels use `console.info` to avoid turning expected failures into native warning banners. `diagnostics.read()` in `mobile/src/diagnostics/logger.ts` returns a copy of the last **200** enabled events in memory; reload clears it. There is no remote telemetry or persistent phone log upload.

Find an `http.started` event on the phone and copy its `request_id` (e.g. `mobile-...`). The same ID is sent as `X-Request-ID`, returned in the response, and attached to backend events—including computation threads. Backend-generated IDs cover browser/manual clients without that header. Browser CORS exposes the header.

```sh
# From the project root; paste the ID from the phone's event.
rg 'mobile-REQUEST-ID' work/shady.log
```

| Events | What they explain |
| --- | --- |
| `dataset.loading`, `dataset.ready`, `dataset.failed` | Startup, readiness and load time. |
| `http.started`, `http.completed`, `http.failed`, `request.rejected` | Request ID, method, API endpoint, status and total time; explicit domain error code. |
| `routes.queued/started/completed`, `shade.queued/started/completed` | Time waiting for the computation lock, computation time, tile/edge cache hits and misses. |
| `routes.shortest`, `routes.eligible`, `routes.candidates`, `routes.result` | Cumulative routing stage timings, eligible edge/candidate counts, distance, sun saved and effective timestamp. |
| `search.cache_hit/cache_miss`, `search.provider_response`, `search.failed` | Local cache versus upstream search, provider status, latency and rate-limit waits. |
| Phone `http.failed`, `http.cancelled` | Failure phase (`network`, `response`, `http`) versus intentional cancellation. |
| Phone `location.*`, `tracking.*` | Permission, successful fix, unavailable GPS, tracking start/stop. |
| Phone `planning.*`, `snapshot.*`, `time.committed`, `route.selected`, `mode.changed`, `navigation.*` | Which snapshot was committed, selected route, saved mode and navigation state transitions. |

Logs intentionally omit search text, raw URLs/query strings, request/response bodies, GPS coordinates, geometry and exception messages. Unexpected backend failures include exception type and stack locations (file/function/line), without source literals. No per-frame, slider-drag or continuous location-fix events are emitted. Queue/compute events describe work done; an aborted phone fetch does not necessarily cancel an already-running backend computation.

For troubleshooting: no backend event for a phone `http.started` points to Wi-Fi/API-address reachability; a high `queue_ms` means another calculation is holding the lock; tile/edge misses explain cold calculations; `request.rejected` gives a mapped-path/coverage error; `location.failed` points to native GPS rather than routing.

## Native route overlay ordering

Apple Maps in react-native-maps 1.27.2 removes and re-adds an overlay when its geometry or style changes. Re-added overlays go above unchanged overlays; `zIndex` is supported by Google Maps, not MapKit. Updating only the route outline could cover shared colored segments, and a viewport shade refresh could tint the route.

`MapCanvas` memoizes one complete, keyed overlay snapshot: shade polygons, white route casing, then all exposure segments. Changing the displayed route or shade geometry replaces these overlays together in that order. Camera/UI renders retain their coordinate objects, and the native map stays mounted, preserving its camera and gestures. Explicit z-index values also maintain the hierarchy on Google Maps.

Regression tests model the native overlay boundary for shared-path switching, viewport updates, shade toggles and camera-only renders. The photographed Old Town route was verified in the iOS simulator with shade on/off, with the previously hidden start section visible.
