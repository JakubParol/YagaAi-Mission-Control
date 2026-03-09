# MC-367 Recovery Plan — runtime po refactorze

## TL;DR

Aktualny blocker nie wygląda na błąd logiki MC-367, tylko na **problem uruchomieniowy API**:

- `mission-control-api.service` wpada w restart-loop (`status=203/EXEC`),
- `mc` nie ma jak połączyć się z backendem (`TransportError: fetch failed`),
- web (`mission-control.service`) działa, ale endpointy API padają (500/404 przez proxy).

Najbardziej prawdopodobna przyczyna: uszkodzone / obce `.venv` po pracy w Dockerze/refactorze (shebang `#!/workspace/services/api/.venv/bin/python` + root-owned virtualenv).

---

## 1) Objawy i hipoteza root-cause

### Objawy

1. `systemctl status mission-control-api.service`:
   - `status=203/EXEC`
2. `head -n1 services/api/.venv/bin/uvicorn`:
   - `#!/workspace/services/api/.venv/bin/python` (ścieżka nie istnieje na hoście)
3. `.venv` jest root-owned (`root:root`), co blokuje normalne odtworzenie środowiska przez użytkownika.

### Root-cause (hipoteza robocza)

Virtualenv dla API został wygenerowany w innym kontekście ścieżek (np. kontener), przez co:

- shebang wskazuje nieistniejącą ścieżkę,
- systemd nie może wykonać `uvicorn`,
- API nie startuje,
- `mc` nie ma backendu.

---

## 2) Cel recovery

1. Przywrócić stabilny start `mission-control-api.service` na `127.0.0.1:5001`.
2. Przywrócić działanie `mc` (planning + orchestration).
3. Potwierdzić zdrowie runtime’u przez smoke testy (minimum happy path + fault paths).
4. Warstwa operacyjna MC-379 (rollback/runbook) jest domknięta; użyć jej jako baseline podczas recovery i rolloutu.

---

## 3) Procedura naprawy (krok po kroku)

> Zakładam repo: `/home/kuba/repos/mission-control`.

### Krok 0 — Bezpiecznik (backup DB)

```bash
cp /home/kuba/mission-control/data/mission-control.db \
   /home/kuba/mission-control/data/mission-control.db.bak.$(date +%Y%m%d-%H%M%S)
```

### Krok 1 — zatrzymaj API service

```bash
sudo systemctl stop mission-control-api.service
```

### Krok 2 — odłóż uszkodzone virtualenv

```bash
cd /home/kuba/repos/mission-control/services/api
if [ -d .venv ]; then
  mv .venv .venv.broken.$(date +%Y%m%d-%H%M%S)
fi
```

### Krok 3 — odtwórz czyste środowisko API

```bash
cd /home/kuba/repos/mission-control/services/api
poetry env use /usr/bin/python3.12
poetry install --only main --no-interaction
```

### Krok 4 — lokalny smoke start API (bez systemd)

```bash
cd /home/kuba/repos/mission-control/services/api
poetry run uvicorn app.main:app --host 127.0.0.1 --port 5001
```

W drugim terminalu:

```bash
curl -fsS http://127.0.0.1:5001/healthz
```

Jeśli `healthz` OK → zatrzymaj ręczny proces (`Ctrl+C`) i przejdź dalej.

### Krok 5 — podnieś service

```bash
sudo systemctl start mission-control-api.service
sudo systemctl status mission-control-api.service --no-pager -n 50
```

### Krok 6 — walidacja end-to-end CLI

```bash
mc --api-base http://127.0.0.1:5001 health --output json
mc --api-base http://127.0.0.1:5001 project list --limit 3 --output json
mc --api-base http://127.0.0.1:5001 epic list --project-key MC --limit 20 --output json
```

### Krok 7 — walidacja web ↔ api

```bash
curl -fsS http://127.0.0.1:3100 >/dev/null && echo "web ok"
curl -fsS http://127.0.0.1:5001/healthz && echo "api ok"
```

---

## 4) Walidacja MC-367 po naprawie runtime

### Minimalny acceptance smoke

```bash
cd /home/kuba/repos/mission-control
./infra/local-runtime/scripts/orchestration-smoke.py --skip-up
```

### Full smoke (z podniesieniem stacka)

```bash
cd /home/kuba/repos/mission-control
./infra/local-runtime/scripts/orchestration-smoke.py
```

### Dodatkowe kontrole operatorskie

```bash
mc run metrics --output json
mc run tail --run-id <run-id> --max-polls 5 --interval-ms 2000 --output json
```

---

## 5) Jeśli nadal nie działa — szybkie drzewko decyzji

### A) Nadal `203/EXEC`

- sprawdź shebang:
  ```bash
  head -n1 /home/kuba/repos/mission-control/services/api/.venv/bin/uvicorn
  ```
- sprawdź interpreter:
  ```bash
  ls -l /home/kuba/repos/mission-control/services/api/.venv/bin/python
  ```
- jeśli shebang/interpreter zły → wróć do kroku 2.

### B) Service startuje, ale `healthz` fail

- logi:
  ```bash
  sudo journalctl -u mission-control-api.service -n 200 --no-pager
  ```
- sprawdź `MC_DB_PATH` i uprawnienia do DB.

### C) API działa, ale web pokazuje 500 pod `/api/*`

- sprawdź `NEXT_PUBLIC_API_URL` i rewrites/proxy w web,
- zrestartuj web po potwierdzeniu API:
  ```bash
  sudo systemctl restart mission-control.service
  ```

---

## 6) Hardening, żeby to się nie powtórzyło

1. W deploy flow zawsze uruchamiać sekcję "heal stale/broken virtualenv" (jest już w `infra/deploy.sh`).
2. Nie trzymać hostowego `.venv` budowanego przez kontener.
3. Dodać preflight check do deploymentu:
   - weryfikacja shebang `uvicorn`,
   - `poetry run python -V`,
   - `curl /healthz` przed restartem web.
4. Utrzymywać aktualny runbook MC-379 i traktować go jako obowiązkowy playbook operacyjny przy rollback/recovery.

---

## 7) Powiązanie z MC-379 runbook

Rollout/recovery wykonujemy razem z:

- `docs/MC-379_ROLLOUT_OPERATIONS_RUNBOOK.md`

To jest aktualny, domknięty playbook dla:

- staged enablement,
- fallback levels (L1/L2/L3),
- rollback triggers,
- incident operations (queue/dead-letter/watchdog),
- release-readiness handoff.

## 8) Definition of Recovered

System uznajemy za odzyskany, gdy wszystkie punkty są spełnione:

1. `mission-control-api.service` = `active (running)` bez restart-loop.
2. `GET /healthz` na `127.0.0.1:5001` zwraca sukces.
3. `mc health`, `mc project list`, `mc epic list` działają.
4. Smoke orchestration przechodzi minimum w wariancie `--skip-up`.
5. Web i API działają razem (brak 500 na ścieżkach API po stronie web).
