# Native acceptance — pending physical phone verification
## iOS simulator verification — 3 October 2026

Xcode Device Hub, iPhone 17 Pro, iOS 26.2, Expo Go / Expo SDK 57. Simulator evidence is separate from physical phone performance and outdoor GPS accuracy.

- [x] Reproduced black shadow polygons, isolated the overlay by toggling it, and confirmed transparent teal rendering after suppressing MapKit's default stroke. Also checked a real 1 July 13:00 native-map route.
- [x] Legend hidden before planning; positioned immediately above the sheet and follows 35%/70% dragging.
- [x] Top gradient improves the wordmark contrast without blocking map gestures.
- [x] Software keyboard open: typed Wawel, submitted search and selected a result with the input and results visible above the keyboard.
- [x] Simulated Rynek GPS recenters using the arrow; repeated camera requests and fresh-map readiness have regression tests.
- [x] Start walk opens a separate route-following screen. Moving simulated GPS along a real route changes progress, distance and time; route endpoint reports arrival. An off-route simulated fix shows its distance from the path; returning to the route clears the notice. Panning pauses following and the arrow resumes it.
- [x] Saved summer walk preview stays explicitly labeled with GPS off; returning to live planning restores the native map.
- [x] Reduce Motion and one step larger text checked; simulator preferences restored afterwards. Fixed replay of stale camera commands when motion preference changes.
- [x] Unavailable location and permission denial produce readable errors in boundary tests; tracking cleanup, late callbacks and inaccurate/off-route fixes are covered.

Screenshots delivered with the task: corrected native map, address entry with keyboard, walking progress and arrival. This does not establish measured frame rate, physical GPS accuracy, extreme accessibility text sizes, or Android behavior.

## Physical phone and remaining acceptance checks

- [ ] Open on iOS/Android, check map provider and initial sheet position.
- [ ] Drag sheet through 15/35/70%, interrupt a spring, reverse direction, and release with momentum.
- [ ] Rapidly switch route cards without dropped frames or wrong metrics.
- [ ] Drag time slider; labels follow continuously, request commits on release; retain old results labeled Updating.
- [ ] While a cross-city request runs, pan/zoom the map and verify it remains responsive.
- [ ] Open/close keyboard, submit search, change start, return to the map.
- [ ] Deny location permission, then grant it; confirm manual start still works.
- [ ] Turn on Reduce Motion and larger system text; verify controls and route cards remain usable.
- [ ] Enable Saved demo, stop the backend / disconnect internet after loading Expo, switch 10/13/16 scenarios and routes; verify local map, shadows and metrics.
- [ ] Live mode offline gives an explicit failure and never substitutes a saved scenario.
- [ ] Validate route access and shadow direction outdoors. Building data is historical and tree shade is absent.

Record device model, OS, Expo/runtime version, results, and remaining issues here before the hackathon.
