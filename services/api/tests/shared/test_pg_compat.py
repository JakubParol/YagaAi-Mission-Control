import logging

import pytest

from app.shared.api import deps
from app.shared.db import pg_compat
from app.shared.db.pg_compat import AsyncPgCompatConnection


class _FakePool:
    def __init__(self) -> None:
        self.conn = object()
        self.releases: list[tuple[object, bool]] = []

    async def acquire(self) -> object:
        return self.conn

    async def release(self, conn: object, *, discard: bool = False) -> None:
        self.releases.append((conn, discard))


class _FakeCompatDb:
    fail_commit = False
    fail_rollback = False
    instances: list["_FakeCompatDb"] = []

    def __init__(self, conn: object) -> None:
        self.conn = conn
        self.commits = 0
        self.rollbacks = 0
        _FakeCompatDb.instances.append(self)

    async def commit(self) -> None:
        self.commits += 1
        if _FakeCompatDb.fail_commit:
            raise RuntimeError("commit failed")

    async def rollback(self) -> None:
        self.rollbacks += 1
        if _FakeCompatDb.fail_rollback:
            raise RuntimeError("rollback failed")


def _setup_fake_postgres(monkeypatch: pytest.MonkeyPatch) -> _FakePool:
    pool = _FakePool()
    _FakeCompatDb.instances.clear()
    _FakeCompatDb.fail_commit = False
    _FakeCompatDb.fail_rollback = False
    monkeypatch.setattr(deps.settings, "db_engine", "postgres")
    monkeypatch.setattr(deps, "_postgres_pool", pool)
    monkeypatch.setattr(deps, "AsyncPgCompatConnection", _FakeCompatDb)
    return pool


@pytest.mark.asyncio
async def test_get_db_commits_and_releases_connection_on_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool = _setup_fake_postgres(monkeypatch)

    gen = deps.get_db()
    await gen.__anext__()
    with pytest.raises(StopAsyncIteration):
        await gen.__anext__()

    db = _FakeCompatDb.instances[0]
    assert db.commits == 1
    assert db.rollbacks == 0
    assert pool.releases == [(pool.conn, False)]


@pytest.mark.asyncio
async def test_get_db_rolls_back_and_releases_connection_on_exception(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool = _setup_fake_postgres(monkeypatch)

    gen = deps.get_db()
    await gen.__anext__()
    with pytest.raises(RuntimeError, match="boom"):
        await gen.athrow(RuntimeError("boom"))

    db = _FakeCompatDb.instances[0]
    assert db.commits == 0
    assert db.rollbacks == 1
    assert pool.releases == [(pool.conn, False)]


@pytest.mark.asyncio
async def test_get_db_discards_connection_when_commit_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pool = _setup_fake_postgres(monkeypatch)
    _FakeCompatDb.fail_commit = True

    gen = deps.get_db()
    await gen.__anext__()
    with pytest.raises(RuntimeError, match="commit failed"):
        await gen.__anext__()

    db = _FakeCompatDb.instances[0]
    assert db.commits == 1
    assert pool.releases == [(pool.conn, True)]


def test_translate_query_replaces_only_unquoted_qmarks() -> None:
    query = "SELECT '?', ?, \"column?\", '--?'; -- ?\n/* ? */ SELECT ?"
    translated = AsyncPgCompatConnection._translate_query(query)

    assert translated == "SELECT '?', %s, \"column?\", '--?'; -- ?\n/* ? */ SELECT %s"


def test_translate_query_logs_for_untranslated_sqlite_constructs_once(
    caplog: pytest.LogCaptureFixture,
) -> None:
    pg_compat._LOGGED_TRANSLATION_WARNINGS.clear()
    caplog.set_level(logging.WARNING)

    query = "INSERT OR REPLACE INTO custom_table (id, note) VALUES (?, 'What?')"
    AsyncPgCompatConnection._translate_query(query)
    AsyncPgCompatConnection._translate_query(query)

    records = [
        record
        for record in caplog.records
        if "SQLite-to-Postgres translation may be incomplete" in record.message
    ]
    assert len(records) == 1
