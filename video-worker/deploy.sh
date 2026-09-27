#!/usr/bin/env bash
# Aktualisiert den Steply video-worker auf den neuesten Stand und startet ihn neu.
# Laeuft als App-Nutzer tutax. Aufruf vom PC aus:
#   ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax/video-worker && bash deploy.sh'"
set -euo pipefail
cd "$(dirname "$0")"            # .../video-worker

# Der Telegram-Bot (agent-bridge) arbeitet im selben Checkout und lässt ihn nach einer Aufgabe
# auf seinem agent/…-Branch stehen. Der Worker soll aber immer staging-Code fahren.
branch="$(git -C .. rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "staging" ]; then
  if [ -n "$(git -C .. status --porcelain)" ]; then
    echo "✗ Checkout steht auf '$branch' mit offenen Änderungen — der Bot arbeitet vermutlich gerade."
    echo "  Bitte warten, bis der Bot fertig ist, dann erneut ausführen."
    exit 1
  fi
  echo "→ Checkout stand auf '$branch' — wechsle auf staging"
  git -C .. checkout staging
fi

echo "→ git pull (Repo /opt/tutax, staging)"
git -C .. pull --ff-only origin staging

echo "→ npm install (video-worker)"
npm install --omit=dev

echo "→ pm2 restart video-worker"
pm2 restart video-worker --update-env

echo "✓ video-worker deployed: $(git -C .. rev-parse --short HEAD)"
