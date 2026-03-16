# Mission Control Runbook (DEV vs PROD)

## Ports

- DEV (containers, dev runtime):
  - web: `3000`
  - api: `5000`
  - postgres: `55432`
- PROD (containers):
  - web: `3100`
  - api: `5100`
  - postgres: `5432`

## ENV files

- PROD runtime env (outside repo): `/etc/mission-control/prod.env`
  - bootstrap from: `infra/env/prod.env.example`
- DEV runtime env: `infra/dev/.env` (template: `.env.example`)

## Fresh Ubuntu bootstrap

```bash
cd /home/kuba/repos/mission-control
bash ./install.sh
```

What it does:

- installs Docker + Compose and Node.js when missing
- creates `infra/dev/.env` and `/etc/mission-control/prod.env` when missing
- builds and installs a global `mc` wrapper in `/usr/local/bin/mc`
- configures `mc` to target PROD by default via `MC_API_BASE_URL=http://127.0.0.1:5100`
- installs and enables `mission-control-dev.service` and `mission-control-prod.service`
- brings up both DEV and PROD stacks once during bootstrap

For DEV CLI calls after bootstrap, override the target explicitly:

```bash
mc --api-base http://127.0.0.1:5000 health
```

## DEV workflow (containerized dev runtime)

### Start full DEV runtime

```bash
cd /home/kuba/repos/mission-control
./infra/dev/up.sh
```

### Stop DEV runtime

```bash
cd /home/kuba/repos/mission-control
./infra/dev/down.sh
```

### Autostart DEV po restarcie VM (systemd)

Preferred path on fresh machines: `bash ./install.sh`

```bash
sudo cp /home/kuba/repos/mission-control/infra/systemd/mission-control-dev.service /etc/systemd/system/mission-control-dev.service
sudo systemctl daemon-reload
sudo systemctl enable mission-control-dev.service
sudo systemctl start mission-control-dev.service
```

The checked-in unit file is a path-specific example. If your repo is not under `/home/kuba/repos/mission-control`, adjust paths or use `install.sh`, which renders the unit from the current repo location.

Weryfikacja:

```bash
systemctl is-enabled mission-control-dev.service
systemctl is-active mission-control-dev.service
```

### Reset DEV runtime data (destructive)

```bash
cd /home/kuba/repos/mission-control
./infra/dev/reset.sh
```

### Rebuild API in DEV with migrations

```bash
cd /home/kuba/repos/mission-control
./infra/dev/rebuild-api.sh
```

This rebuilds the API image, runs PostgreSQL migrations, and then recreates `api` + `dapr-api`.

### Optional host debugging (manual)

If you want to debug API/Web outside containers, run host processes on different ports (e.g. `5001` / `3001`) to avoid collisions with DEV container ports.

## PROD workflow (full containers)

### One-time systemd install

Preferred path on fresh machines: `bash ./install.sh`

```bash
sudo mkdir -p /etc/mission-control
sudo cp /home/kuba/repos/mission-control/infra/env/prod.env.example /etc/mission-control/prod.env
sudoedit /etc/mission-control/prod.env

sudo cp /home/kuba/repos/mission-control/infra/systemd/mission-control-prod.service /etc/systemd/system/mission-control-prod.service
sudo systemctl daemon-reload
sudo systemctl enable mission-control-prod.service
```

The checked-in unit file is a path-specific example. If your repo is not under `/home/kuba/repos/mission-control`, adjust paths or use `install.sh`, which renders the unit from the current repo location.

### Deploy

```bash
cd /home/kuba/repos/mission-control
./infra/deploy.sh
```

`infra/deploy.sh` builds the production images, runs API PostgreSQL migrations, and only then recreates the PROD stack.

### Start/stop/status

```bash
sudo systemctl start mission-control-prod.service
sudo systemctl stop mission-control-prod.service
sudo systemctl status mission-control-prod.service --no-pager

docker compose -f infra/prod/docker-compose.prod.yml --env-file /etc/mission-control/prod.env ps
```

`mission-control-prod.service` also runs API migrations in `ExecStartPre`, so service starts after reboot use the same migration gate.

### Rollback

```bash
cd /home/kuba/repos/mission-control
./infra/rollback.sh <image-tag>
```

## Data migration / refresh

### Backup PROD PostgreSQL

```bash
cd /home/kuba/repos/mission-control
./infra/prod/postgres-backup.sh
```

Creates a dump in:

```bash
infra/prod/backups/mission-control-prod-postgres-YYYYMMDD-HHMMSS.sql
```

### Restore dump into PROD PostgreSQL

Recommended sequence:

```bash
cd /home/kuba/repos/mission-control

docker compose -f infra/prod/docker-compose.prod.yml --env-file /etc/mission-control/prod.env stop api web worker dapr-api dapr-web dapr-worker
./infra/prod/postgres-restore.sh /path/to/backup.sql
./infra/deploy.sh
```

Notes:

- The restore is logically destructive: dump files are created with `--clean --if-exists`
- `./infra/deploy.sh` reruns migrations and brings the PROD stack back to the current repo head
- Stopping API/web/worker before restore avoids concurrent writes during import

### Refresh DEV from a PROD dump

```bash
cd /home/kuba/repos/mission-control
./infra/dev/scripts/postgres-restore.sh /path/to/prod-backup.sql
```

This is useful after restoring old PROD onto the new VM, or whenever you want DEV to mirror current PROD data.

### Typical migration flow: old VM PROD → new VM PROD → new VM DEV

1. On the old VM:

```bash
cd /home/kuba/repos/mission-control
./infra/prod/postgres-backup.sh
```

2. Copy the generated `.sql` dump to the new VM (for example with `scp` or Tailscale SSH/SCP).

3. On the new VM, restore into PROD:

```bash
cd /home/kuba/repos/mission-control

docker compose -f infra/prod/docker-compose.prod.yml --env-file /etc/mission-control/prod.env stop api web worker dapr-api dapr-web dapr-worker
./infra/prod/postgres-restore.sh ~/mission-control-prod.sql
./infra/deploy.sh
```

4. On the new VM, refresh DEV from the same dump:

```bash
cd /home/kuba/repos/mission-control
./infra/dev/scripts/postgres-restore.sh ~/mission-control-prod.sql
```

### One-command local migration on the new VM

If the dump file is already present on the new VM, you can run the full flow (PROD restore → deploy/migrations → DEV refresh) with:

```bash
cd /home/kuba/repos/mission-control
./infra/migrate-prod-to-dev.sh ~/mission-control-prod.sql
```

## Local VS Code development alongside always-on DEV/PROD

Workflow goal:

- containerized DEV stays online on `3000/5000`
- containerized PROD stays online on `3100/5100`
- local VS Code development runs in parallel on `3001/5001`

Start local API:

```bash
cd /home/kuba/repos/mission-control/services/api
./scripts/run-dev.sh
```

Start local WEB:

```bash
cd /home/kuba/repos/mission-control/apps/web
npm run dev
```

Helper reminder:

```bash
cd /home/kuba/repos/mission-control
./infra/dev/local-dev.sh
```

Notes:

- `apps/web/scripts/run-dev.sh` uses `PORT=3001` by default and writes to `.next-vscode`, so it does not collide with containerized Next.js build artifacts.
- `services/api/scripts/run-dev.sh` uses `0.0.0.0:5001` by default, so it does not collide with containerized DEV API on port `5000`.
- Do **not** stop containerized DEV/PROD for normal local coding; local dev is intended to run alongside them.

## Troubleshooting quick checks

```bash
# API health
curl -fsS http://127.0.0.1:5100/healthz

# WEB reachability
curl -I http://127.0.0.1:3100

# Listening ports
ss -ltnp | grep -E '(:3000|:5000|:3100|:5100)\\b'
```

## Najczęstsze problemy i szybkie diagnozy

### 1) `ENOSPC` / `no space left on device` podczas builda

```bash
df -h /
docker system prune -af
docker builder prune -af
```

Potem ponów deploy:

```bash
cd /home/kuba/repos/mission-control
./infra/deploy.sh
```

### 2) DNS błędy w kontenerach (`Temporary failure in name resolution`)

```bash
# host
python - <<'PY'
import socket
for h in ['google.com','api.github.com']:
    print(h, socket.gethostbyname(h))
PY

# kontener API
docker exec mission-control-prod-api-1 python - <<'PY'
import socket
for h in ['google.com','api.github.com','redis','postgres']:
    print(h, socket.gethostbyname(h))
PY

docker exec mission-control-prod-api-1 cat /etc/resolv.conf
```

### 3) Upewnienie, że PROD nie współdzieli danych z LOCAL

```bash
# powinien wskazywać na mission-control-prod_postgres-data
# (lub nazwę z MC_PROD_POSTGRES_VOLUME_NAME)
docker inspect mission-control-prod-postgres-1 --format '{{range .Mounts}}{{println .Name "->" .Destination}}{{end}}'
```

### 4) Brak startu przez systemd po deploy

```bash
systemctl status mission-control-prod.service --no-pager
journalctl -u mission-control-prod.service -n 200 --no-pager
ls -la /etc/mission-control/prod.env
```
