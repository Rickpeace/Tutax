# Deploy des video-workers (Hetzner)

Der video-worker läuft auf dem Hetzner-Server als pm2-Prozess **`video-worker`**
(Code in **`/opt/tutax/video-worker`**, Repo `/opt/tutax`). Aktualisiert wird er –
genau wie die agent-bridge – über ein **`deploy.sh`**-Skript: `git pull` + `npm install`
+ `pm2 restart`.

## Aktualisieren (eine Zeile vom PC aus)

```powershell
ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax/video-worker && bash deploy.sh'"
```

Ablauf: Code-Änderung lokal → `git push` (staging + main) → obige Zeile ausführen.
Das ist **manuell** (jemand stößt `deploy.sh` an) – es gibt **bewusst keinen Cron und
keine GitHub-Action**.

> Hinweis: Beim allerersten Mal muss `deploy.sh` schon auf dem Server liegen – es kommt
> mit dem ersten `git pull` mit. Falls noch nicht da, einmalig direkt:
> `ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax && git pull --ff-only && pm2 restart video-worker'"`

## Die agent-bridge wird genauso deployt

```powershell
ssh root@23.88.98.172 "su - tutax -c 'cd /opt/agent-bridge && bash deploy.sh'"
```

(eigenes Repo `Rickpeace/agent-bridge`, eigenes `deploy.sh`).

Mehr Infra-Kontext: [../../INFRA.md](../../INFRA.md) §7.
