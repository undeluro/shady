# Sharing Shady

The website runs on **Expo EAS Hosting**. A separate **Google Cloud Run** service
loads Kraków's real walking network, buildings and woodland, then calculates routes
and shade. Native Expo Go can use the same public backend URL.

## Deployment status

EAS project: [@undeluro/shady](https://expo.dev/accounts/undeluro/projects/shady).
The API is live at [shady-api](https://shady-api-434547199312.europe-west1.run.app/health).
Production website: **[shady-krakow.expo.app](https://shady-krakow.expo.app)**.
Live search, planning, route switching, saved demo and navigation preview were verified in the browser.
Google project: `shady-510606` in `europe-west1`. Google free trial verified on
4 October 2026: 90 days and zł1,152.77 credit remaining. The backend is deployed with the complete dataset. The registry image uses
336.51 MiB compressed; additional images and account-wide usage still matter for
the free storage allowance.

## Before publishing

Confirm an active Google project and billing account with remaining trial credits.
Expo uses the Free plan and an `expo.app` subdomain. Do not upgrade either account.
Google's free allowances do not guarantee a zero bill: image storage and network
traffic are billed separately, and trial credit can expire. Ordinary budget alerts
are not a spending cap. Google's preview spend caps pause eligible services but can
overshoot and do not cover persistent storage. Check billing before enabling resources.

The backend starts at 2 CPUs / 4 GiB, request-based billing, zero minimum instances,
one maximum instance, concurrency one and a 300-second request timeout to
accommodate a cold start followed by a longer route. Zero idle instances saves idle compute
cost but adds a cold start. Native dataset loading measured 18.9 seconds and a
2,440 MiB memory peak. The amd64 container under Mac emulation loaded in 49.4 seconds, peaking at
2.73 GiB. The central route took 4.09 s first / 0.15 s warm; the cross-city route
took 33.97 s first / 5.33 s warm. On Google, dataset startup measured 69.4 s; the central route measured
7.65 s first / 0.68 s warm, and the cross-city route 60.18 s first / 10.38 s warm.
Longer routes miss the original latency targets. First requests after idle periods
can wait for startup as well as computation; see [measurement details](deployment-benchmark.json).

## Publish

From the repository root, with Docker running and Google CLI signed in:

```bash
export SHADY_GCP_PROJECT=YOUR_APPROVED_PROJECT_ID
export SHADY_GCP_REGION=europe-west1
./scripts/deploy-cloud-run.sh
```

This enables the Run/Artifact Registry APIs, creates a Docker repository, builds an
amd64 image locally, pushes it and deploys a publicly accessible API. Only backend
source, locked production dependencies and five public dataset files are included.
The startup probe requires `/health` to report HTTP 200 after dataset loading.
Image tags use the Git commit; use `SHADY_IMAGE_TAG` for a distinct release tag.

Verify the returned service URL before exporting the website:

```bash
python3 scripts/smoke_deployment.py https://YOUR_SERVICE.run.app --search
python3 scripts/smoke_deployment.py https://YOUR_SERVICE.run.app --cross-city
```

```bash
export EXPO_PUBLIC_API_URL=https://YOUR_SERVICE.run.app
./scripts/deploy-eas.sh --dev-domain=shady-krakow --non-interactive
# Inspect the resulting preview, then promote the verified export:
./scripts/deploy-eas.sh --prod --non-interactive
```

The deployment script clears Metro’s cache and verifies the expected API URL is
in the generated bundle before uploading. The backend URL is compiled into the Expo web export. Changing it requires a new
export/deployment. EAS Hosting publishes a website; native distribution remains
Expo Go/development builds rather than an App Store release.

For an iPhone with Expo Go:

```bash
cd mobile
EXPO_PUBLIC_API_URL=https://YOUR_SERVICE.run.app npx expo start --go --clear
```

Open the QR code with the iPhone camera. Allow location only when you want GPS;
manual origins and **Saved demo** remain available.

## Check and observe

Verify health and dataset version, route and shade timestamps, a real address
search, and an invalid endpoint. Test the website on an iPhone as well as desktop.
Record first-request and repeated-request latency: citywide computations can take
longer than the original hackathon performance targets.

```bash
gcloud run services logs read shady-api --region=europe-west1 \
  --project="$SHADY_GCP_PROJECT" --limit=50
```

Application logs contain request IDs, operation durations and cache counts rather
than typed addresses or coordinates. Cloud platform request logs are separate and can include GET search/bbox query
strings. Set an exclusion for `run.googleapis.com/requests` if those URLs should
not be stored; retain the safe application log stream for diagnostics.
Containers keep search/cache state only for their lifetime. One worker and one
configured instance preserve the in-process Nominatim throttle during normal demo
operation. Cloud Run can briefly exceed scaling limits or overlap revisions; this
is not a distributed rate limiter. Avoid overlapping releases/search load and use a
shared limiter or a different geocoder before wider public usage.

## Stop and clean up

To stop serving while keeping the revision, use manual scaling to zero:

```bash
gcloud run services update shady-api --scaling=0 --region=europe-west1 \
  --project="$SHADY_GCP_PROJECT"
# Resume request-based autoscaling when needed:
gcloud run services update shady-api --scaling=auto --region=europe-west1 \
  --project="$SHADY_GCP_PROJECT"
```

Scaling to zero does not remove Artifact Registry storage charges. Remove unused
images through the registry after confirming which digest the live revision uses.
Do not delete a shared Google project or billing account as app cleanup.

## Sources

- [EAS Hosting](https://docs.expo.dev/eas/hosting/get-started/)
- [Cloud Run billing](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Cloud Run health checks](https://docs.cloud.google.com/run/docs/configuring/healthchecks)
- [Spend cap limitations](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
- [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)
- [App data and model details](TECHNICAL.md)
