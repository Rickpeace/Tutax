#!/usr/bin/env bash
# Aktualisiert den Steply video-worker auf den neuesten Stand und startet ihn neu.
# Laeuft als App-Nutzer tutax. Aufruf vom PC aus:
#   ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax/video-worker && bash deploy.sh'"
set -euo pipefail
cd "$(dirname "$0")"            # .../video-worker

echo "→ git pull (Repo /opt/tutax, aktueller Branch)"
git -C .. pull --ff-only

echo "→ npm install (video-worker)"
npm install --omit=dev

echo "→ pm2 restart video-worker"
pm2 restart video-worker --update-env

echo "✓ video-worker deployed: $(git -C .. rev-parse --short HEAD)"
