# Shady citywide implementation ledger

Approved brief: citywide Kraków, Expo Go, Python, 25% detour, buildings-only snapshots, GPS/submitted search, Apple-style playful map UI, critical TDD gates.

Tasks: data + geometry; routing + API; interactive Expo UI; real-data preparation/demo/benchmarks; verification + review.

Ruling: this is a new repository, so initialize directly in the user-requested directory on codex/shady-mvp; no existing branch needs isolation.
Ruling: save source downloads and processed artifacts locally under ignored data/; include small real demo output in the mobile bundle.

Testing seams: normalizer; sun/shadow/tile engine; public route planner; HTTP contracts; mobile planning reducer/adapters. These were approved in planning.

Task data/geometry: complete. Official 1261/1206/1219 archives normalized to 199,526 footprints (91,260 intersect city), max height 62.51 m, CRS/height validation, source/artifact hashes. Projection/courtyard/time/tile tests watched fail on missing modules, then pass. Border test found inverse-projection spill; geographic clipping fixed it.
Task routing/API: complete. City graph 164,456 nodes / 407,949 edges / 2,341 components. Reverse geometry discontinuity regression RED→GREEN. Endpoint overlays preserve the shared graph; candidate cap and exact shaded segments tested. Submitted Nominatim cache/rate-limit/error contracts and malformed reply cap tested RED→GREEN.
Task mobile: complete for implementation. Expo SDK57 system date selector, map UI/sheet/search/GPS/cards/time, explicit saved mode, reduced-motion map transitions. Reducer, timezone/DST, permission/error and atomic snapshot tests RED→GREEN. RNTL screens verify submitted search, route selection and offline/live distinction.
Task real verification/demo: complete. Real routes in all required areas pass; cache-cleared/repeated outputs equivalent. Local routes cold <=2.61 s, warm <=0.11 s; 7.8 km cross-city cold 19.29 s/warm 2.51 s, targets missed and reported. Three 1 July scenarios plus compact SVG basemap/shadows packaged (~4.4 MB). Native exports succeed; physical checks pending because no device/simulator is connected.
Task final review: complete. One fresh reviewer independently passed both original suites. No Critical findings; five Important findings fixed in one TDD pass: restricted pedestrian access, pedestrian one-way import, city-side boundary fragments, stale search/GPS completions, and misleading retained route after failed replanning. All regressions were observed failing before their fixes; regenerated graph excludes restricted foot edges and preserves the real Smocza Jama one-way.

Ruling: use the Geofabrik regional PBF fallback with OSMnx XML import instead of relying on unavailable Overpass endpoints — both public providers timed out; preserve all components and explicit walking access filters — costs a ~200 MB regional download and an additional streaming dependency.
Ruling: create runtime STRtree indexes from locally normalized artifacts rather than serializing implementation-specific trees — index creation is cheap compared with graph loading; reproducible artifacts/source hashes remain on disk — startup is about 17 seconds.
Ruling: use a NetworkX 3.x isolated adjacency overlay and normalized edge-shade LRU instead of copying/merging the whole city per request — profile showed the original 16-second warm local route; regression tests preserve output and graph immutability — costs reliance on pinned NetworkX 3.x adjacency internals.
Ruling: use a Leaflet browser adapter for visual verification alongside the native platform map — react-native-maps has no web renderer; saved mode uses local SVG on both — browser tile provider is an additional online dependency.
Ruling: accept measured cross-city latency as an explicit MVP limitation, preserving arbitrary walking distance and the approved search space — shrinking the corridor would break the plan — long walks can exceed the 10s/2s targets.
Ruling: document native acceptance as pending rather than substitute browser/export checks for phone checks — no simulator/device available here — phone gesture/permission/accessibility behavior still needs verification.

Verification checkpoint: Python 33/33 passing, 98.80% line / 93.75% branch; mobile 24/24 passing, critical 100% line/branch; Expo lint and TypeScript clean; Expo doctor 21/21; iOS and Android production JS exports succeed (~8.5/8.8 MB). Backend readiness and submitted Wawel search verified live over HTTP. A 20.5-second browser walkthrough assembled from seven captured frames is packaged in docs/shady-walkthrough.gif (557×687). It records mode, route selection, departure controls and attribution, and establishes no native frame-rate claim. The native phone checklist remains pending.

Ruling: clear retained route/shade after failed replanning rather than carry a separately labeled previous itinerary — prevents new endpoint pins from presenting an old route as current — cost: the prior route must be recomputed or reselected after failure.
minor (deferred): automatic source/filter fingerprint invalidation for resumable processed artifacts. Current graph was explicitly rebuilt and source inputs unchanged for reused buildings; README documents moving cached artifacts aside before future source/import changes. Cost: a future operator must follow that step to avoid stale provenance.


## iOS feedback fixes and walking navigation — 3 October 2026

The earlier native-verification limitation is superseded by an installed Xcode simulator. Reproduced iOS black polygons and isolated them to MapKit overlays: explicit transparent strokes with a nonzero width remove the black rendering. Geometry-specific keys prevent reused polygon instances retaining old holes; memoized polygon elements avoid rebuilding geometry during GPS updates.

GPS now issues consumable camera commands after map readiness, including a fresh native map after saved mode. Motion preference changes do not replay an old command. Native errors become readable manual-start messages. Search uses keyboard avoidance inside its modal. The route-only legend follows the sheet on the animation thread. A noninteractive SVG gradient backs the wordmark, and the GPS control uses an arrow.

Start walk hands the selected immutable route/time/shade snapshot to an Expo Router navigation screen. Foreground GPS provides remaining distance/time, progress, arrival, off-route notices and follow/recenter controls. Inaccurate fixes do not invent progress. Watches and pending subscriptions are removed when the screen leaves. Saved navigation is a labeled static preview with no GPS. There are no voice/turn instructions, background tracking or automatic rerouting; arrival is at the mapped endpoint.

See DEVICE-CHECKS.md for simulator evidence and remaining physical-device checks. The requested Expo Codex plugin was installed and its native UI guidance applied. Backend data, routing and benchmark limits are unchanged.

Final verification for this change: 47 mobile tests pass, critical core coverage 100% lines and branches; TypeScript and Expo lint clean. iOS production JS export succeeds (8.6 MB). Backend was not changed. Native simulator screenshots confirm translucent shade, keyboard avoidance, GPS recentering, saved preview and live walking progress/off-route/arrival. Physical phone checks remain pending.
