# Shady citywide implementation ledger

Approved brief: citywide Kraków, Expo Go, Python, 25% detour, buildings-only snapshots, GPS/submitted search, Apple-style playful map UI, critical TDD gates.

Tasks: data + geometry; routing + API; interactive Expo UI; real-data preparation/demo/benchmarks; verification + review.

Ruling: this is a new repository, so initialize directly in the user-requested directory on codex/shady-mvp; no existing branch needs isolation.
Ruling: save source downloads and processed artifacts locally under ignored data/; include small real demo output in the mobile bundle.

Testing seams: normalizer; sun/shadow/tile engine; public route planner; HTTP contracts; mobile planning reducer/adapters. These were approved in planning.

Task data/geometry: complete. Official 1261/1206/1219 archives normalized to 199,526 footprints (91,260 intersect city), max height 62.51 m, CRS/height validation, source/artifact hashes. Projection/courtyard/time/tile tests watched fail on missing modules, then pass. Border test found inverse-projection spill; geographic clipping fixed it.
Task routing/API: complete. City graph 165,275 nodes / 411,796 edges / 2,003 components. Reverse geometry discontinuity regression RED→GREEN. Endpoint overlays preserve the shared graph; candidate cap and exact shaded segments tested. Submitted Nominatim cache/rate-limit/error contracts and malformed reply cap tested RED→GREEN.
Task mobile: complete for implementation. Expo SDK57 system date selector, map UI/sheet/search/GPS/cards/time, explicit saved mode, reduced-motion map transitions. Reducer, timezone/DST, permission/error and atomic snapshot tests RED→GREEN. RNTL screens verify submitted search, route selection and offline/live distinction.
Task real verification/demo: complete. Real routes in all required areas pass; cache-cleared/repeated outputs equivalent. Local routes cold <=2.5 s, warm <=0.11 s; 7.8 km cross-city cold 19.4 s/warm 2.6 s, targets missed and reported. Three 1 July scenarios plus compact SVG basemap/shadows packaged (~4.4 MB). Native exports succeed; physical checks pending because no device/simulator is connected.
Task final review: pending fresh reviewer.

Ruling: use the Geofabrik regional PBF fallback with OSMnx XML import instead of relying on unavailable Overpass endpoints — both public providers timed out; preserve all components and explicit walking access filters — costs a ~200 MB regional download and an additional streaming dependency.
Ruling: create runtime STRtree indexes from locally normalized artifacts rather than serializing implementation-specific trees — index creation is cheap compared with graph loading; reproducible artifacts/source hashes remain on disk — startup is about 17 seconds.
Ruling: use a NetworkX 3.x isolated adjacency overlay and normalized edge-shade LRU instead of copying/merging the whole city per request — profile showed the original 16-second warm local route; regression tests preserve output and graph immutability — costs reliance on pinned NetworkX 3.x adjacency internals.
Ruling: use a Leaflet browser adapter for visual verification alongside the native platform map — react-native-maps has no web renderer; saved mode uses local SVG on both — browser tile provider is an additional online dependency.
Ruling: accept measured cross-city latency as an explicit MVP limitation, preserving arbitrary walking distance and the approved search space — shrinking the corridor would break the plan — long walks can exceed the 10s/2s targets.
Ruling: document native acceptance as pending rather than substitute browser/export checks for phone checks — no simulator/device available here — phone gesture/permission/accessibility behavior still needs verification.

Verification checkpoint: Python 29/29 passing, 98.89% line / 93.38% branch; mobile 21/21 passing, critical 100% line/branch; Expo lint and TypeScript clean; Expo doctor 21/21; iOS and Android production JS exports succeed (~8.6/8.8 MB). Backend readiness and submitted Wawel search verified live over HTTP. Final graphical recording still being packaged; native phone checklist remains pending.
