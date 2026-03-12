# Access Map (Tailnet-first)

Single source of truth for how to reach Mission Control/OpenClaw services from personal devices over Tailscale.

## Canonical host

- Tailnet DNS: `vm-kuba-02.tail94516c.ts.net`
- Tailnet IPv4: `100.106.117.41`

---

## Production (containers)

- Web PROD: `https://vm-kuba-02.tail94516c.ts.net:3100/`
- API PROD: `https://vm-kuba-02.tail94516c.ts.net:5100/`
- API PROD health: `https://vm-kuba-02.tail94516c.ts.net:5100/healthz`

Runtime bind policy (host): localhost-only for app endpoints, exposed externally via Tailscale Serve.

---

## OpenClaw / Ops

- OpenClaw dashboard: `https://vm-kuba-02.tail94516c.ts.net/`
- Portainer: `https://vm-kuba-02.tail94516c.ts.net:9000/`

---

## Development (local-runtime stack)

Target model:

- Web DEV (via tailnet https): `https://vm-kuba-02.tail94516c.ts.net:3000/`
- API DEV (via tailnet https): `https://vm-kuba-02.tail94516c.ts.net:5000/`

Current proxy mapping uses:

- `:3000 -> 127.0.0.1:3000`
- `:5000 -> 127.0.0.1:5000`

---

## PostgreSQL access (DBeaver)

Use tailnet IP + native PostgreSQL protocol (not HTTPS):

- PROD Postgres: `100.106.117.41:5432`
- DEV Postgres: `100.106.117.41:55432`
- DB: `mission_control`
- User: `mission_control`
- Password: `mission_control_dev`

---

## Quick checks

```bash
# Tailscale serve map
tailscale serve status

# Listening ports on host
ss -ltnp | grep -E ':(3000|3100|5000|5100|5432|55432|9000|18789)\\b'
```
