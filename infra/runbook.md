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

### Reset DEV runtime data (destructive)

```bash
cd /home/kuba/repos/mission-control
./infra/dev/reset.sh
```

### Optional host debugging (manual)

If you want to debug API/Web outside containers, run host processes on different ports (e.g. `5001` / `3001`) to avoid collisions with DEV container ports.

## PROD workflow (full containers)

### One-time systemd install

```bash
sudo mkdir -p /etc/mission-control
sudo cp /home/kuba/repos/mission-control/infra/env/prod.env.example /etc/mission-control/prod.env
sudoedit /etc/mission-control/prod.env

sudo cp /home/kuba/repos/mission-control/infra/systemd/mission-control-prod.service /etc/systemd/system/mission-control-prod.service
sudo systemctl daemon-reload
sudo systemctl enable mission-control-prod.service
```

### Deploy

```bash
cd /home/kuba/repos/mission-control
./infra/deploy.sh
```

### Start/stop/status

```bash
sudo systemctl start mission-control-prod.service
sudo systemctl stop mission-control-prod.service
sudo systemctl status mission-control-prod.service --no-pager

docker compose -f infra/prod/docker-compose.prod.yml --env-file /etc/mission-control/prod.env ps
```

### Rollback

```bash
cd /home/kuba/repos/mission-control
./infra/rollback.sh <image-tag>
```

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
