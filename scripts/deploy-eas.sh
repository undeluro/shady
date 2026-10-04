#!/usr/bin/env bash
set -euo pipefail
: "${EXPO_PUBLIC_API_URL:?Set EXPO_PUBLIC_API_URL to the verified HTTPS backend URL}"
if [[ "$EXPO_PUBLIC_API_URL" != https://* ]]; then
  echo "A public HTTPS backend URL is required." >&2
  exit 1
fi
curl --fail --silent --show-error "$EXPO_PUBLIC_API_URL/health"
cd mobile
npx expo export --platform web --clear
# Metro may reuse transforms across API environment changes; verify the released URL.
node <<'JS'
const fs = require("node:fs");
const path = require("node:path");
const directory = "dist/_expo/static/js/web";
const matches = fs.readdirSync(directory).filter(name => name.endsWith(".js"))
  .some(name => fs.readFileSync(path.join(directory, name), "utf8")
    .includes(process.env.EXPO_PUBLIC_API_URL));
if (!matches) throw new Error("Export does not contain the requested backend URL");
JS
# First deployment may ask for the expo.app subdomain. Preview and inspect before promotion.
npx eas-cli@latest deploy --export-dir=dist --no-source-maps "$@"
