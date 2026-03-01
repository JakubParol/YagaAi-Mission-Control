"""Unit tests for resolve_project_key dependency."""

from unittest.mock import AsyncMock, patch

import pytest

from app.planning.domain.models import Project, ProjectStatus
from app.shared.api.errors import NotFoundError

FAKE_PROJECT = Project(
    id="uuid-mc",
    key="MC",
    name="Mission Control",
    description=None,
    status=ProjectStatus.ACTIVE,
    repo_root=None,
    created_by=None,
    updated_by=None,
    created_at="2026-01-01T00:00:00Z",
    updated_at="2026-01-01T00:00:00Z",
)


async def _call_resolver(
    *, project_id: str | None = None, project_key: str | None = None
) -> str | None:
    from app.planning.dependencies import resolve_project_key

    mock_db = AsyncMock()
    with patch(
        "app.planning.dependencies.SqliteProjectRepository"
    ) as mock_repo_cls:
        repo_instance = AsyncMock()
        mock_repo_cls.return_value = repo_instance

        async def fake_get_by_key(key: str) -> Project | None:
            if key.upper() == "MC":
                return FAKE_PROJECT
            return None

        repo_instance.get_by_key = fake_get_by_key

        return await resolve_project_key(
            project_id=project_id, project_key=project_key, db=mock_db
        )


@pytest.mark.asyncio
async def test_returns_none_when_no_params() -> None:
    result = await _call_resolver()
    assert result is None


@pytest.mark.asyncio
async def test_passes_through_project_id() -> None:
    result = await _call_resolver(project_id="uuid-123")
    assert result == "uuid-123"


@pytest.mark.asyncio
async def test_passes_through_null_sentinel() -> None:
    result = await _call_resolver(project_id="null")
    assert result == "null"


@pytest.mark.asyncio
async def test_resolves_project_key() -> None:
    result = await _call_resolver(project_key="MC")
    assert result == "uuid-mc"


@pytest.mark.asyncio
async def test_project_key_takes_precedence() -> None:
    result = await _call_resolver(project_id="other-uuid", project_key="MC")
    assert result == "uuid-mc"


@pytest.mark.asyncio
async def test_raises_not_found_for_unknown_key() -> None:
    with pytest.raises(NotFoundError):
        await _call_resolver(project_key="NOPE")
