# Deploy des video-workers (Hetzner)

Der video-worker läuft auf dem Hetzner-Server als pm2-Prozess **`video-worker`**
(Code in **`/opt/tutax/video-worker`**, Repo `/opt/tutax`, Nutzer `tutax`). Aktualisiert
wird er – genau wie die agent-bridge – über ein **`deploy.sh`**-Skript:
`git pull --ff-only` (Repo `/opt/tutax`, **aktueller Branch = `staging`**) +
`npm install --omit=dev` + `pm2 restart video-worker --update-env`.

## Aktualisieren (eine Zeile vom PC aus)

```powershell
ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax/video-worker && bash deploy.sh'"
```

Ablauf: Code-Änderung lokal → **`main` pushen, erfolgreichen Vercel-Build abwarten,
dann `staging` auf denselben Stand pushen** (der Server-Checkout steht auf `staging` —
ohne diesen Schritt zieht `deploy.sh` alten Code) → obige Zeile ausführen.
Das ist **manuell** (jemand stößt `deploy.sh` an) – es gibt **bewusst keinen Cron und
keine GitHub-Action**. Der SSH-Key auf Richards PC öffnet nur **root** (der Nutzer
`tutax` hat keinen eigenen Login-Key); die Zeile führt deshalb Richard aus.

> **Branch:** Die agent-bridge arbeitet im selben Checkout und lässt ihn nach einer Bot-Aufgabe auf
> einem `agent/…`-Branch stehen. `deploy.sh` wechselt deshalb selbst auf `staging` und zieht nur
> `origin/staging`. Liegen gerade ungesicherte Änderungen im Checkout (Bot arbeitet), bricht es mit
> einem Hinweis ab — dann warten, bis der Bot fertig ist, und erneut ausführen.

> Hinweis: Das neue `deploy.sh` (mit Branch-Wechsel, 27.09.2026) kommt erst mit dem nächsten
> Pull auf den Server. Beim ersten Deploy danach deshalb einmalig direkt (nur wenn der Bot gerade
> nichts tut):
> `ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax && git checkout staging && git pull --ff-only origin staging && cd video-worker && npm install --omit=dev && pm2 restart video-worker --update-env'"`

## Laufzeit-Voraussetzungen (auf dem Server)

- `ffmpeg`/`ffprobe` und die DejaVu-Schriften (`fonts-dejavu-core`; Pfad per `FONT_PATH`
  überschreibbar) für Video-Export und Einblendungen.
- `video-worker/.env` (liegt nur auf dem Server, `npm start` = `node --env-file=.env index.mjs`)
  mit den Namen: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`,
  `NEXT_PUBLIC_APP_URL` (= `https://tutax-ivory.vercel.app`, für QR/Outro/Links), optional
  `RESEND_API_KEY` + `INVITE_FROM_EMAIL` (Fertig-Mail) und `FONT_PATH`.

## Die agent-bridge wird genauso deployt

```powershell
ssh root@23.88.98.172 "su - tutax -c 'cd /opt/agent-bridge && bash deploy.sh'"
```

(eigenes Repo `Rickpeace/agent-bridge`, Branch `main`, eigenes `deploy.sh`).

Mehr Infra-Kontext: [../../INFRA.md](../../INFRA.md) §7.
