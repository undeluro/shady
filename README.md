# Shady ☀︎
A cooler walk through Kraków. React Native + Expo, with a Python citywide shade-routing backend.

## Run on a phone
Prerequisites: Node 22+, uv, Python 3.12, and an Expo Go version supporting SDK 57 (or an Expo development build). Phone and laptop must share Wi-Fi or a hotspot.

```sh
cd ~/Developer/shady/backend
uv sync --locked
uv run uvicorn shady.api:app --host 0.0.0.0 --port 8000
```
The prepared local dataset is already in `data/processed`. Startup loads it into memory and takes roughly 17 seconds on the development laptop. Check `http://localhost:8000/health` for `ready: true`.

In another terminal:
```sh
cd ~/Developer/shady/mobile
npm ci
EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_LAN_IP:8000 npx expo start --lan
```
Scan the QR code using Expo Go. On macOS, `ipconfig getifaddr en0` usually shows the Wi-Fi IP. Use the active hotspot/network interface if different. Allow incoming connections to Python when macOS asks. A phone cannot reach the laptop through `localhost`. No API key is needed on iOS; Android development builds using Google Maps need the usual platform API-key configuration. Expo Go uses its bundled map configuration.

Browser preview: `npm run web`. It uses Leaflet with visible OpenStreetMap attribution. Native uses `react-native-maps`. Saved demo uses the bundled local SVG map on both platforms.

## Use
- Submit a destination search, choose your start, or long press the map to place a pin. Browser: right click to place a pin.
- Tap GPS to use your current location. Permission denial leaves manual start selection available.
- Compare **Shortest** and **More shade**; tap a card to change the displayed route. Yellow segments are sunny; teal segments are shaded.
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
Shadows sweep vertical building footprints opposite the sun, by `height / tan(solar elevation)`. Solar position is computed with pvlib at central Kraków. Ground is approximately flat. Trees, terrain, clouds, and changes during a walk are excluded. Below 5° sun elevation, shade estimates are unavailable. At night no artificial 100% shade is shown. Walking speed is 1.3 m/s. This is route planning, not turn-by-turn navigation.

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

Real dataset acceptance and timings are recorded in `docs/benchmark.json`: Stare Miasto, Podgórze, Nowa Huta, western Kraków, and a cross-district walk. Cold clears tile and edge caches; warm repeats the same request. Timings measure the planning core, excluding startup, network latency, and phone rendering. The current cross-city route exceeds the 10-second cold / 2-second warm targets; local district routes meet them. These are measured examples, not worst-case guarantees.

See `docs/DEVICE-CHECKS.md` for native acceptance checks. A browser review does not establish native gesture smoothness, GPS accuracy, or frame rate.

## Sources and attribution
- © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Administrative relation 449696; walking data from [Geofabrik Małopolskie](https://download.geofabrik.de/europe/poland/malopolskie.html).
- [GUGiK LoD1 2024 buildings](https://www.geoportal.gov.pl/en/data/other-data/3d-models-of-building/), CC BY 4.0; normalized for shade modeling. Archives: [Kraków 1261](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/12/1261.zip), [Krakowski 1206](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/12/1206.zip), [Wielicki 1219](https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/12/1219.zip).
- Search: [Nominatim](https://operations.osmfoundation.org/policies/nominatim/), server-side submitted searches only, identifying User-Agent, disk cache, one upstream request/second across the **single demo server process**. Do not run multiple workers against the public endpoint; use a shared limiter or another provider for deployment. Configure `SHADY_GEOCODER_URL` to change provider.
- Browser tiles follow the [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). Only visible map tiles are requested. Offline demo geometry is generated from the OSM dataset, not downloaded tiles.

## API
`GET /health`, `GET /v1/metadata`, `GET /v1/search?q=…`, `POST /v1/routes`, `GET /v1/shade?bbox=west,south,east,north&departure_at=ISO8601&zoom=16`. Interactive schemas: `http://localhost:8000/docs`.
