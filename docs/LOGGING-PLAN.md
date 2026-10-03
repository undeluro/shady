# Logging and hackathon polish plan

Purpose: explain a slow or failed walk request from phone to backend, while keeping the app and README friendly for the demo.

1. Test the existing time-control seam, remove its chevron, and migrate the native picker to value-change/dismissal callbacks. Verify date selection and cancellation.
2. Add structured backend events with UTC timestamps, levels, request IDs and request durations. Propagate IDs through computation threads. Record dataset readiness, route stages, queue/compute time, cache hits/misses, search cache/provider outcomes and explicit errors. Save rotating JSON logs locally; suppress raw access URLs.
3. Add mobile diagnostics for HTTP requests, cancellation, location permission/fix outcomes, committed snapshots, mode/time changes and navigation status transitions. Console output plus a bounded in-memory buffer, adjustable log level. Do not record search text, coordinates, bodies, full URLs or exception messages.
4. Test through HTTP and client boundaries: correlation, failure classification, cancellation and exclusion of private input. Keep existing core coverage gates and run lint/type checks.
5. Replace the root README with the centered existing sun mascot, actual supplied route screenshots, slogan, problem/solution, simple launch/use instructions and attribution. Move full technical notes into docs/TECHNICAL.md.
6. Restart the backend with the new logger, retain the existing Expo Go session, smoke-test a live route and inspect its correlated logs. Review README rendering and links.

Logging is local diagnostics, not remote analytics. Backend files rotate at 5 MiB with three backups. Phone logs hold the last 200 events in memory, and reset on reload. No per-frame or continuous GPS-coordinate logging.
