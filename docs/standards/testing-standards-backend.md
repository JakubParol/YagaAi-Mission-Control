# Testing Standards — Backend

Extends [coding-standards.md](./coding-standards.md). Everything in the parent applies here.

---

## Test Types

Integration, service, and unit — see [Test Strategy](../../services/api/docs/TEST_STRATEGY.md#3-test-types) for definitions, examples, and when to use each.

---

## Test Infrastructure

### Database: Real PostgreSQL via Testcontainers

Tests run against a real PostgreSQL 16 container, started once per session. No SQLite, no mocks, no in-memory databases.

```
Session start → PostgresContainer("postgres:16-alpine") → Alembic upgrade head
Each test    → TRUNCATE all tables (fast, ~5ms)
Session end  → Container destroyed
```

### Key fixtures (root `conftest.py`)

| Fixture | Scope | Purpose |
|---|---|---|
| `database_url` | session | Starts container, runs migrations, yields URL |
| `_configure_database` | session | Sets `settings.postgres_dsn`, disposes engine on teardown |
| `_reset_database` | function (autouse) | TRUNCATE all tables before each test |
| `restore_schema` | function | Use on tests that modify DDL (DROP TABLE/INDEX) — runs full DROP/CREATE after test |

### Test helpers (`tests/support/postgres_compat.py`)

| Function | Use for |
|---|---|
| `pg_connect(url)` | Context manager — sync psycopg connection for seeding/asserting |
| `run_script(url, sql)` | Execute multi-statement SQL (used in module conftest seed fixtures) |
| `execute_query(url, sql, params)` | Single query, returns rows |
| `truncate_all_tables(url, table_names)` | TRUNCATE CASCADE with RESTART IDENTITY |

---

## Test Layout

```
tests/
├── conftest.py              # Root: container, reset, engine lifecycle
├── test_health.py           # Smoke test (no DB)
├── planning/
│   ├── conftest.py          # Seed data: projects, backlogs, stories, tasks, agents
│   └── test_<entity>_routes.py
├── control_plane/
│   ├── conftest.py          # db_path fixture (alias for database_url)
│   └── test_<feature>_routes.py
├── observability/
│   ├── conftest.py          # Langfuse settings mock
│   └── test_observability_routes.py
└── support/
    ├── postgres_compat.py   # DB helpers
    └── runtime.py           # Lifespan patching for non-DB tests
```

---

## Writing Tests

### Integration test pattern

```python
def test_create_entity(client) -> None:
    resp = client.post("/v1/planning/stories", json={...})
    assert resp.status_code == 201
    data = resp.json()["data"]
    assert data["key"] == "P1-1"
```

### Seeding data directly

When seed data beyond the module conftest is needed (labels, extra rows):

```python
def test_with_extra_seed(client, _setup_test_db) -> None:
    with pg_connect(_setup_test_db) as conn:
        conn.execute(
            "INSERT INTO labels (id, project_id, name, color, created_at) "
            "VALUES (%s, %s, %s, %s, %s)",
            ["lbl-1", "p1", "bug", "red", TS],
        )
        conn.commit()

    resp = client.post(...)
    assert resp.status_code == 201
```

### Asserting DB side effects

```python
def test_side_effect(client, _setup_test_db) -> None:
    client.patch(f"/v1/planning/stories/{story_id}", json={...})

    with pg_connect(_setup_test_db) as conn:
        row = conn.execute(
            "SELECT event_data_json FROM activity_log "
            "WHERE entity_id = %s",
            [story_id],
        ).fetchone()

    assert row is not None
```

### Tests that modify schema

If a test drops a table or index, add `restore_schema` to restore DDL for subsequent tests:

```python
def test_rollback_without_table(client, _setup_test_db, restore_schema) -> None:
    with pg_connect(_setup_test_db) as conn:
        conn.execute("DROP TABLE activity_log")
        conn.commit()
    # ... test continues, schema is restored after
```

---

## Rules

- **PostgreSQL only.** No SQLite, no aiosqlite, no sqlite3 imports anywhere.
- **No monkey-patching DB access.** Tests use the same DB path as production (AsyncSession → PostgreSQL).
- **Seed via SQL, not via API.** Module conftest inserts baseline data with `run_script()`. Individual tests seed extra rows with `pg_connect()`.
- **`%s` placeholders.** PostgreSQL uses `%s`, not `?`. Params are lists, not tuples.
- **One assertion concern per test.** Test one behavior, not five. Multiple asserts on the same response are fine.
- **No test interdependence.** Each test gets a clean DB via TRUNCATE. No test relies on state from a previous test.
- **Envelope-aware assertions.** API responses wrap in `{"data": ..., "meta": ...}`. Assert through `resp.json()["data"]`.

---

## Running Tests

```bash
cd services/api
python -m pytest tests/ -q                       # all tests
python -m pytest tests/planning/ -q              # one module
python -m pytest tests/planning/test_task_routes.py::test_create_task_with_project -q  # one test
python -m pytest --rootdir=/path/to/repo tests/  # from any CWD (VSCode compat)
```

---

## Related

- [Test Strategy — Services API](../../services/api/docs/TEST_STRATEGY.md) — project-level coverage map and quality expectations

## Navigation

- ↑ [coding-standards.md](./coding-standards.md)
- ↑ [coding-standards-backend.md](./coding-standards-backend.md)
