"""Unit tests for key resolver dependencies."""

from unittest.mock import AsyncMock, patch

import pytest

from app.planning.domain.models import (
    Epic,
    EpicStatus,
    ItemStatus,
    Project,
    ProjectStatus,
    StatusMode,
    Story,
)
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

FAKE_EPIC = Epic(
    id="uuid-epic-1",
    project_id="uuid-mc",
    key="MC-1",
    title="Epic One",
    description=None,
    status=EpicStatus.TODO,
    status_mode=StatusMode.MANUAL,
    status_override=None,
    status_override_set_at=None,
    is_blocked=False,
    blocked_reason=None,
    priority=None,
    metadata_json=None,
    created_by=None,
    updated_by=None,
    created_at="2026-01-01T00:00:00Z",
    updated_at="2026-01-01T00:00:00Z",
)

FAKE_STORY = Story(
    id="uuid-story-1",
    project_id="uuid-mc",
    epic_id="uuid-epic-1",
    key="MC-10",
    title="Story One",
    intent=None,
    description=None,
    story_type="USER_STORY",
    status=ItemStatus.TODO,
    is_blocked=False,
    blocked_reason=None,
    priority=None,
    metadata_json=None,
    created_by=None,
    updated_by=None,
    created_at="2026-01-01T00:00:00Z",
    updated_at="2026-01-01T00:00:00Z",
    started_at=None,
    completed_at=None,
)


# ── resolve_project_key ─────────────────────────────────────────────


async def _call_project_resolver(
    *, project_id: str | None = None, project_key: str | None = None
) -> str | None:
    from app.planning.dependencies import resolve_project_key

    mock_db = AsyncMock()
    with patch("app.planning.dependencies.SqliteProjectRepository") as mock_repo_cls:
        repo_instance = AsyncMock()
        mock_repo_cls.return_value = repo_instance

        async def fake_get_by_key(key: str) -> Project | None:
            if key.upper() == "MC":
                return FAKE_PROJECT
            return None

        repo_instance.get_by_key = fake_get_by_key

        return await resolve_project_key(project_id=project_id, project_key=project_key, db=mock_db)


@pytest.mark.asyncio
async def test_project_returns_none_when_no_params() -> None:
    result = await _call_project_resolver()
    assert result is None


@pytest.mark.asyncio
async def test_project_passes_through_project_id() -> None:
    result = await _call_project_resolver(project_id="uuid-123")
    assert result == "uuid-123"


@pytest.mark.asyncio
async def test_project_passes_through_null_sentinel() -> None:
    result = await _call_project_resolver(project_id="null")
    assert result == "null"


@pytest.mark.asyncio
async def test_project_resolves_project_key() -> None:
    result = await _call_project_resolver(project_key="MC")
    assert result == "uuid-mc"


@pytest.mark.asyncio
async def test_project_key_takes_precedence() -> None:
    result = await _call_project_resolver(project_id="other-uuid", project_key="MC")
    assert result == "uuid-mc"


@pytest.mark.asyncio
async def test_project_raises_not_found_for_unknown_key() -> None:
    with pytest.raises(NotFoundError):
        await _call_project_resolver(project_key="NOPE")


# ── resolve_epic_key ────────────────────────────────────────────────


async def _call_epic_resolver(
    *, epic_id: str | None = None, epic_key: str | None = None
) -> str | None:
    from app.planning.dependencies import resolve_epic_key

    mock_db = AsyncMock()
    with patch("app.planning.dependencies.SqliteEpicRepository") as mock_repo_cls:
        repo_instance = AsyncMock()
        mock_repo_cls.return_value = repo_instance

        async def fake_get_by_key(key: str) -> Epic | None:
            if key.upper() == "MC-1":
                return FAKE_EPIC
            return None

        repo_instance.get_by_key = fake_get_by_key

        return await resolve_epic_key(epic_id=epic_id, epic_key=epic_key, db=mock_db)


@pytest.mark.asyncio
async def test_epic_returns_none_when_no_params() -> None:
    result = await _call_epic_resolver()
    assert result is None


@pytest.mark.asyncio
async def test_epic_passes_through_epic_id() -> None:
    result = await _call_epic_resolver(epic_id="uuid-123")
    assert result == "uuid-123"


@pytest.mark.asyncio
async def test_epic_resolves_epic_key() -> None:
    result = await _call_epic_resolver(epic_key="MC-1")
    assert result == "uuid-epic-1"


@pytest.mark.asyncio
async def test_epic_key_takes_precedence() -> None:
    result = await _call_epic_resolver(epic_id="other-uuid", epic_key="MC-1")
    assert result == "uuid-epic-1"


@pytest.mark.asyncio
async def test_epic_raises_not_found_for_unknown_key() -> None:
    with pytest.raises(NotFoundError):
        await _call_epic_resolver(epic_key="NOPE-99")


# ── resolve_story_key ───────────────────────────────────────────────


async def _call_story_resolver(
    *, story_id: str | None = None, story_key: str | None = None
) -> str | None:
    from app.planning.dependencies import resolve_story_key

    mock_db = AsyncMock()
    with patch("app.planning.dependencies.SqliteStoryRepository") as mock_repo_cls:
        repo_instance = AsyncMock()
        mock_repo_cls.return_value = repo_instance

        async def fake_get_by_key(key: str) -> Story | None:
            if key.upper() == "MC-10":
                return FAKE_STORY
            return None

        repo_instance.get_by_key = fake_get_by_key

        return await resolve_story_key(story_id=story_id, story_key=story_key, db=mock_db)


@pytest.mark.asyncio
async def test_story_returns_none_when_no_params() -> None:
    result = await _call_story_resolver()
    assert result is None


@pytest.mark.asyncio
async def test_story_passes_through_story_id() -> None:
    result = await _call_story_resolver(story_id="uuid-123")
    assert result == "uuid-123"


@pytest.mark.asyncio
async def test_story_resolves_story_key() -> None:
    result = await _call_story_resolver(story_key="MC-10")
    assert result == "uuid-story-1"


@pytest.mark.asyncio
async def test_story_key_takes_precedence() -> None:
    result = await _call_story_resolver(story_id="other-uuid", story_key="MC-10")
    assert result == "uuid-story-1"


@pytest.mark.asyncio
async def test_story_raises_not_found_for_unknown_key() -> None:
    with pytest.raises(NotFoundError):
        await _call_story_resolver(story_key="NOPE-99")
