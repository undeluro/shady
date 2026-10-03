# Native acceptance — pending physical phone verification
No native simulator is available on this laptop. Automated tests, native exports, and browser checks are separate evidence.

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
