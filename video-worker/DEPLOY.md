# Auto-Deploy des video-workers (Hetzner)

Der Worker wird per **GitHub Action** deployt (`.github/workflows/deploy-worker.yml`):
GitHub verbindet sich nach jedem Push auf `main` (der `video-worker/` ändert) per SSH
mit dem Server und macht `git pull` + `pm2 restart video-worker`. Manuell auslösbar über
**Actions → "Deploy video-worker (Hetzner)" → Run workflow**.

GitHub führt das aus — kein Agent, keine Berechtigungs-Sperre, du machst nichts von Hand.

## Einmalige Einrichtung (2 Schritte)

### 1) Deploy-Key auf dem Server erzeugen + beim tutax-Nutzer hinterlegen

Diese eine Zeile in PowerShell (erzeugt einen eigenen Deploy-Key, trägt den öffentlichen
Teil bei `tutax` ein und gibt den **privaten** Teil aus):

```powershell
ssh root@23.88.98.172 "su - tutax -c 'test -f ~/.ssh/ci_deploy || ssh-keygen -t ed25519 -f ~/.ssh/ci_deploy -N \"\" -q; grep -qF \"\$(cat ~/.ssh/ci_deploy.pub)\" ~/.ssh/authorized_keys 2>/dev/null || cat ~/.ssh/ci_deploy.pub >> ~/.ssh/authorized_keys; chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys; echo ===PRIVATER_KEY_FUER_GITHUB_SECRET===; cat ~/.ssh/ci_deploy; echo ===ENDE==='"
```

Kopiere den Block **zwischen** `===PRIVATER_KEY...===` und `===ENDE===`
(inkl. `-----BEGIN...-----` und `-----END...-----`).

### 2) Privaten Key als GitHub-Secret anlegen

GitHub → Repo **Rickpeace/Tutax** → **Settings → Secrets and variables → Actions →
New repository secret**:

- **Name:** `HETZNER_SSH_KEY`
- **Secret:** den kopierten privaten Key einfügen → **Add secret**

Fertig. Ab jetzt: Push auf `main` mit Worker-Änderung → Auto-Deploy. Oder jederzeit
manuell über den **Run workflow**-Button.

## Manueller Deploy (Notfall / sofort, ohne Action)

```powershell
ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax && git pull --ff-only && pm2 restart video-worker'"
```
