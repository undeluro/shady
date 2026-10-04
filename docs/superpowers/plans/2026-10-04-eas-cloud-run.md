# Shady deployment: EAS Hosting + Google Cloud Run

Architecture approved by the user on 4 October 2026. Work in the existing
`codex/shady-mvp` checkout and preserve unrelated presentation assets.

## Constraints

- Use the personal Expo Free account and an `expo.app` domain.
- Google project and billing eligibility require confirmation before resource creation.
  The closed trial account cannot fund a deployment. Never upgrade billing automatically.
- Cloud Run starts with 2 CPUs / 4 GiB, request billing, minimum zero instances,
  maximum one instance and concurrency one. This limits usage but is not a spending cap.
- Native measurement: dataset loading 18.9 s, peak RSS 2,440 MiB.
- Include only public normalized data, never search history, raw downloads, credentials,
  local logs, native dependencies, or presentation assets.
- Website hosting publishes the web app. Native Expo Go remains a separate client.

## Delivery steps

- [x] Add a failing readiness-probe test; return HTTP 503 if the dataset cannot load.
- [x] Package Python 3.12, frozen production dependencies and five dataset artifacts.
- [x] Verify container startup, HTTP contracts and memory with the real dataset.
- [x] Authenticate Google locally through browser OAuth.
- [x] Create/link `@undeluro/shady` on EAS.
- [x] Confirm Google project `shady-510606` and active trial (90 days, zł1,152.77 credit).
- [x] Build/push the image; deploy Cloud Run with HTTP startup probe and bounded scaling.
- [x] Check hosted health, metadata, route/shade timestamps, search and failure responses.
- [x] Export Expo web against the hosted HTTPS API, deploy and verify in a browser.
- [x] Document URLs, cold-start limits, attribution, logs, shutdown and redeployment.
- [x] Run Python coverage gates, mobile coverage, lint and type checking; review and commit.

## Verification

Backend gate: 95% lines / 90% branches. Mobile critical logic: 90% lines / branches.
Readiness is tested through the public FastAPI endpoint before implementation.
Container and hosting configuration are verified with real startup and deployment,
not tests that mirror configuration text. Record cold/warm timings rather than claiming
performance targets. Confirm uploaded archives exclude private/local material.

## Release

- Website: https://shady-krakow.expo.app
- API: https://shady-api-434547199312.europe-west1.run.app
- Image tag: `20261004-mvp1`; timeout update revision `shady-api-00002-7cs`.
- Expo export cache regression reproduced, fixed with `--clear`, and guarded before upload.
- Local test URLs absent from the verified production bundle.
- Temporary unbilled project from account setup shut down; only `shady-510606` is used.
- Browser verified live search, route switching, saved summer mode and navigation preview.
- Longer walks and idle startup exceed initial performance targets; actual timings recorded.
- Independent review found no remaining important issues after status corrections.

Final checks: 48 Python tests (98.22% lines / 92.19% branches), 60 mobile tests
(100% critical logic coverage), Ruff, Expo lint, TypeScript and shell syntax passed.
Physical iPhone GPS/gesture checks remain a user device check, not a claimed deployment test.
