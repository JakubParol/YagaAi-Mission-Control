import re
from urllib.parse import urlparse

_AVATAR_PATH_RE = re.compile(r"^(?:\.{1,2}/|/)?[A-Za-z0-9._~%-]+(?:/[A-Za-z0-9._~%-]+)*$")
_AVATAR_MAX_LEN = 1024
_NAME_MAX_LEN = 200
_INITIALS_MAX_LEN = 10
_INITIALS_RE = re.compile(r"^[A-Z]{1,10}$")


def normalize_optional_name_part(
    value: str | None,
    *,
    field_name: str,
    max_length: int = _NAME_MAX_LEN,
) -> str | None:
    if value is None:
        return None

    text = value.strip()
    if text == "":
        return None

    if len(text) > max_length:
        raise ValueError(f"{field_name} must be at most {max_length} characters")
    return text


def normalize_initials(value: str | None) -> str | None:
    normalized = normalize_optional_name_part(
        value,
        field_name="initials",
        max_length=_INITIALS_MAX_LEN,
    )
    if normalized is None:
        return None

    initials = normalized.upper()
    if not _INITIALS_RE.fullmatch(initials):
        raise ValueError("initials must contain only letters A-Z")
    return initials


def normalize_avatar(value: str | None) -> str | None:
    if value is None:
        return None

    avatar = value.strip()
    if avatar == "":
        return None

    if len(avatar) > _AVATAR_MAX_LEN:
        raise ValueError(f"avatar must be at most {_AVATAR_MAX_LEN} characters")

    if "://" in avatar:
        parsed = urlparse(avatar)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("avatar URL must use http/https and include a host")
        return avatar

    if not _AVATAR_PATH_RE.fullmatch(avatar):
        raise ValueError("avatar must be an http/https URL or a path-like value without spaces")
    return avatar
