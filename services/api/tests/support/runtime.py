from __future__ import annotations

from pytest import MonkeyPatch


async def _noop_async() -> None:
    return None


async def _noop_revision_check(*_args, **_kwargs) -> None:
    return None


def disable_runtime_postgres(monkeypatch: MonkeyPatch) -> None:
    import app.main as main_module

    monkeypatch.setattr(main_module, "init_db_engine", _noop_async)
    monkeypatch.setattr(main_module, "close_db_engine", _noop_async)
    monkeypatch.setattr(
        main_module,
        "assert_database_revision_is_current",
        _noop_revision_check,
    )
