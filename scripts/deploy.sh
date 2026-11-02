#!/usr/bin/env bash
# Build and publish to https://tracker.marylowd.com (Caddy on web-vps serves
# ~/web/vps/data/static/wordtracker; hosting config lives in ~/Projects/web).
# Needs .env.local with the Supabase URL and anon key; Vite bakes them into the build.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.local ] || { echo "missing .env.local (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)"; exit 1; }
npm run build
ssh web-vps 'mkdir -p ~/web/vps/data/static/wordtracker'
rsync -az --delete --chmod=D755,F644 dist/ web-vps:web/vps/data/static/wordtracker/
curl --fail --silent --show-error --retry 3 --retry-delay 2 https://tracker.marylowd.com/ -o /dev/null
echo "Deployed https://tracker.marylowd.com/"
