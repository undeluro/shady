# OSM woodland implementation plan

Goal: add likely summer tree shade to Shady using real OSM wooded polygons, without claiming calculated canopy shadows.

Approved scope: the user's “okay plan and implement” refers to the in-chat woodland approximation. Execute in the existing checkout, test-first; no separate approval or delegated execution is needed.

Model: import natural=wood, landuse=forest and landcover=trees areas, including multipolygon relations and clearings. Exclude grass, generic parks, scrub and individual tree points. Clip to Kraków in EPSG:2180. Building shade remains full weight; woodland outside building shade receives a 0.5 routing weight during May–September in Europe/Warsaw. This is an explicit heuristic assumption, not measured foliage transmission. No time-dependent tree shadow projection or woodland benefit at night/below 5° solar elevation. Preserve 25% extra-distance bound. Display woodland separately and describe percentages/saved sunny distance as estimates.

Public test boundaries: OSM import from a miniature real-format XML fixture; ShadeEngine geometry/length; RoutePlanner.plan; HTTP metadata/routes/shade; rendered map and result explanation. These extend the already approved geometry/routing/API/native boundary tests.

- [x] Import: failing test for woodland vs grass/park; minimal streaming osmium area import; tests for relation holes, city clipping, invalid/empty data and dataset loading. Prepare and fingerprint local woodland.parquet with existing regional PBF.
- [x] Calculation: failing length test; minimal indexed woodland layer; tests for overlap without double count, tile boundaries, cold/warm equivalence, Warsaw seasonal boundaries, night and low sun. Expose source model and weighted metrics.
- [x] Routing/API: failing shaded-detour test; integrate source-separated route segments and viewport features, consistent metadata/snapshots. Test cap enforcement and polygon clipping.
- [x] Mobile: failing map/model-copy tests; subtle lighter woodland color distinct from building shade, source legend and estimated result labels. Retain MapKit overlay ordering and saved/live distinction. No new native dependency.
- [x] Delivery: regenerate real saved summer snapshots; benchmark district and cross-city routes plus a wooded-path scenario; run Python/mobile coverage gates, lint and type checks. Review on simulator if available. Update technical guide and concise README; commit verified work.

Risks under review: woodland polygons are land-cover approximations and may contain unmapped gaps; forest tags can describe managed areas; seasonal month gate is deliberately coarse and does not model evergreen trees; local data is a historical snapshot; long cross-city calculations may exceed existing targets. Missing woodland artifacts in older datasets must remain explicit building-only mode; declared-but-missing artifacts must fail loading.

Verification: 47 Python tests, 98.22% lines / 92.19% branches; 60 mobile tests, critical core 100% lines and branches; Ruff, Expo lint and TypeScript pass. Real city acceptance includes Las Wolski with 1,134.3 m woodland. Native iOS live July forest route and overlay on/off checked; saved July scenario labels checked. Physical iPhone and seasonal canopy calibration remain unverified. Cold cross-city 21.265 s / warm 2.691 s exceed original targets.
