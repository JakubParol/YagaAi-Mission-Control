# Mission Control Runbook (DEV vs PROD)

> All commands assume you are running from the repo root unless noted otherwise.

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
bash ./install.sh
```

What it does:

- installs Docker + Compose and Node.js when missing
- creates `infra/dev/.env` and `/etc/mission-control/prod.env` when missing
- builds and installs the `mc` CLI wrapper in `/usr/local/bin/`
- installs and enables `mission-control-dev.service` and `mission-control-prod.service`
- brings up both DEV and PROD stacks once during bootstrap

## CLI usage

Bare `mc` is the single CLI entrypoint. It defaults to PROD (`http://127.0.0.1:5100`).

Override with `--api-base <url>` or `MC_API_BASE_URL` for any target.

Examples:

```bash
mc health                                          # hits PROD (default)
mc --api-base http://127.0.0.1:5000 project list   # explicit DEV target
mc --api-base http://127.0.0.1:5100 task update ..  # explicit PROD target
```

For agent execution, the dispatch/delivery context provides an explicit API target via `--api-base`. Execution target is a property of the dispatched run, not of the agent identity.

## DEV workflow (containerized dev runtime)

### Start full DEV runtime

```bash
./infra/dev/up.sh
```

### Stop DEV runtime

```bash
./infra/dev/down.sh
```

### Autostart DEV po restarcie VM (systemd)

Preferred path on fresh machines: `bash ./install.sh`

```bash
sudo cp infra/systemd/mission-control-dev.service /etc/systemd/system/mission-control-dev.service
sudo systemctl daemon-reload
sudo systemctl enable mission-control-dev.service
sudo systemctl start mission-control-dev.service
```

The checked-in unit file contains hardcoded paths. Prefer `install.sh`, which renders the unit from the current repo location.

Weryfikacja:

```bash
systemctl is-enabled mission-control-dev.service
systemctl is-active mission-control-dev.service
```

### Reset DEV runtime data (destructive)

```bash
./infra/dev/reset.sh
```

### Rebuild API in DEV with migrations

```bash
./infra/dev/rebuild-api.sh
```

This rebuilds the API image, runs PostgreSQL migrations, and then recreates `api` + `dapr-api`.

### Optional host debugging (manual)

If you want to debug API/Web outside containers, run host processes on different ports (e.g. `5001` / `3001`) to avoid collisions with DEV container ports.

## Control Plane dispatch (OpenClaw Gateway)

### Device-auth provisioning

Mission Control uses its own dedicated OpenClaw device-auth material, stored as
a single MC-owned file — **not** the host OpenClaw identity directory.

Provision with:

```bash
# PROD (run from repo root, or via install.sh)
./infra/scripts/setup-openclaw-client-auth.sh --target /etc/mission-control/openclaw-device-auth.json

# DEV (containerized runtime)
./infra/scripts/setup-openclaw-client-auth.sh --target ./infra/dev/secrets/openclaw-device-auth.json

# Local host dev
./infra/scripts/setup-openclaw-client-auth.sh --target ./services/api/.openclaw-device-auth.json
```

After running, approve the device: `openclaw devices approve --latest`

The auth file contains Ed25519 key pair + gateway token in a single JSON.
Permissions should be `0600`.

### Gateway connection (API env config)

The API acts as a privileged Gateway client to dispatch work. It needs both
a shared token AND an Ed25519 device identity (token-only auth grants read
scope only; `chat.send` requires `operator.write` which needs device auth).

All auth material is read from a single device-auth file:

| Var | Description | Example |
|---|---|---|
| `MC_API_OPENCLAW_GATEWAY_URL` | Gateway WebSocket URL | `ws://127.0.0.1:18789` |
| `MC_API_OPENCLAW_DEVICE_AUTH_PATH` | Combined device-auth JSON (key pair + token) | `/run/secrets/openclaw-device-auth.json` |

**Environment paths:**

| Environment | Host auth file | Container-internal path |
|---|---|---|
| PROD | `/etc/mission-control/openclaw-device-auth.json` | `/run/secrets/openclaw-device-auth.json` |
| DEV (containers) | `infra/dev/secrets/openclaw-device-auth.json` | `/run/secrets/openclaw-device-auth.json` |
| Local host dev | `services/api/.openclaw-device-auth.json` | N/A (direct path) |

Docker compose mounts the host file read-only into the container at `/run/secrets/openclaw-device-auth.json`.

Missing or wrong values → dispatch fails with:
- missing/bad auth file → `Failed to load OpenClaw device-auth`
- empty token in file → `Gateway token missing in device-auth file`
- wrong token → `Gateway connect failed: AUTH_TOKEN_MISMATCH`

### Agent routing data (Planning DB)

Each agent that should receive dispatched work needs `main_session_key` set
in the agents table (via `PATCH /v1/planning/agents/:id` or `mc agent update`).

Missing → dispatch fails with `MISSING_MAIN_SESSION_KEY` (entry reverts to QUEUED).

### Dispatch success semantics

A successful `chat.send` (Gateway returns `ok: true, status: started`) means
the Gateway accepted and injected the message into the target agent session.
It does NOT mean the agent acknowledged or started work — that arrives later
via runtime callbacks (`agent.assignment.accepted`, etc.).

## PROD workflow (full containers)

### One-time systemd install

Preferred path on fresh machines: `bash ./install.sh`

```bash
sudo mkdir -p /etc/mission-control
sudo cp infra/env/prod.env.example /etc/mission-control/prod.env
sudoedit /etc/mission-control/prod.env

sudo cp infra/systemd/mission-control-prod.service /etc/systemd/system/mission-control-prod.service
sudo systemctl daemon-reload
sudo systemctl enable mission-control-prod.service
```

The checked-in unit file contains hardcoded paths. Prefer `install.sh`, which renders the unit from the current repo location.

### Deploy

```bash
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
./infra/rollback.sh <image-tag>
```

## Data migration / refresh

### Backup PROD PostgreSQL

```bash
./infra/prod/postgres-backup.sh
```

Creates a dump in:

```bash
infra/prod/backups/mission-control-prod-postgres-YYYYMMDD-HHMMSS.sql
```

### Restore dump into PROD PostgreSQL

Recommended sequence:

```bash
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
./infra/dev/scripts/postgres-restore.sh /path/to/prod-backup.sql
```

This is useful after restoring old PROD onto the new VM, or whenever you want DEV to mirror current PROD data.

### Typical migration flow: old VM PROD → new VM PROD → new VM DEV

1. On the old VM:

```bash
./infra/prod/postgres-backup.sh
```

2. Copy the generated `.sql` dump to the new VM (for example with `scp` or Tailscale SSH/SCP).

3. On the new VM, restore into PROD:

```bash
docker compose -f infra/prod/docker-compose.prod.yml --env-file /etc/mission-control/prod.env stop api web worker dapr-api dapr-web dapr-worker
./infra/prod/postgres-restore.sh ~/mission-control-prod.sql
./infra/deploy.sh
```

4. On the new VM, refresh DEV from the same dump:

```bash
./infra/dev/scripts/postgres-restore.sh ~/mission-control-prod.sql
```

### One-command local migration on the new VM

If the dump file is already present on the new VM, you can run the full flow (PROD restore → deploy/migrations → DEV refresh) with:

```bash
./infra/migrate-prod-to-dev.sh ~/mission-control-prod.sql
```

## Local VS Code development alongside always-on DEV/PROD

Workflow goal:

- containerized DEV stays online on `3000/5000`
- containerized PROD stays online on `3100/5100`
- local VS Code development runs in parallel on `3001/5001`
- local DEV must never require stopping always-on DEV/PROD

Source of truth:

- local manual web: `apps/web/scripts/run-dev.sh`
- local manual api: `services/api/scripts/run-dev.sh`
- always-on DEV containers: `infra/dev/docker-compose.yml`
- always-on PROD containers: `infra/prod/docker-compose.prod.yml`

Start local API:

```bash
cd services/api
./scripts/run-dev.sh
```

Start local WEB:

```bash
cd apps/web
npm run dev
```

Helper reminder:

```bash
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
