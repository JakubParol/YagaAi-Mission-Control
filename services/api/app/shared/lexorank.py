"""LexoRank — lexicographic ranking for ordered collections.

Pure functions using base-26 alphabet (a-z). Ranks are strings that sort
lexicographically, allowing O(1) insertions between any two adjacent items.
"""

_ALPHABET = "abcdefghijklmnopqrstuvwxyz"
_BASE = len(_ALPHABET)
_MID = _BASE // 2  # 13 → 'n'
_MIN_CHAR = _ALPHABET[0]  # 'a'
_MAX_CHAR = _ALPHABET[-1]  # 'z'


def _char_index(c: str) -> int:
    return ord(c) - ord("a")


def _index_char(i: int) -> str:
    return _ALPHABET[i]


def rank_initial() -> str:
    """Return a midpoint rank for the first item."""
    return _index_char(_MID)


def rank_between(before: str, after: str) -> str:
    """Return a rank lexicographically between *before* and *after*.

    Raises ``ValueError`` if ``before >= after``.
    """
    if before >= after:
        msg = f"before ({before!r}) must be < after ({after!r})"
        raise ValueError(msg)

    max_len = max(len(before), len(after))
    a_pad = before.ljust(max_len, _MIN_CHAR)
    b_pad = after.ljust(max_len, _MIN_CHAR)

    a_idx = [_char_index(c) for c in a_pad]
    b_idx = [_char_index(c) for c in b_pad]

    # Convert to a single base-26 integer, average, convert back.
    a_val = sum(v * (_BASE ** (max_len - 1 - i)) for i, v in enumerate(a_idx))
    b_val = sum(v * (_BASE ** (max_len - 1 - i)) for i, v in enumerate(b_idx))

    mid_val = (a_val + b_val) // 2

    if mid_val == a_val:
        # Adjacent at this length — extend by appending midpoint char.
        return before + _index_char(_MID)

    digits: list[int] = []
    remaining = mid_val
    for _ in range(max_len):
        digits.append(remaining % _BASE)
        remaining //= _BASE
    digits.reverse()

    result = "".join(_index_char(d) for d in digits).rstrip(_MIN_CHAR)
    return result or _index_char(0)


def rank_before(existing: str) -> str:
    """Return a rank before *existing*."""
    # Midpoint between "a" and existing.
    floor = _MIN_CHAR
    if existing <= floor:
        return _MIN_CHAR + _index_char(_MID)
    return rank_between(floor, existing)


def rank_after(existing: str) -> str:
    """Return a rank after *existing*."""
    # Append midpoint char — always lexicographically after existing.
    return existing + _index_char(_MID)


def rank_batch(count: int) -> list[str]:
    """Generate *count* evenly-spaced ranks across the alphabet space.

    Useful for initial data migration or full rebalancing.
    Returns an empty list when *count* is 0.
    """
    if count <= 0:
        return []
    if count == 1:
        return [rank_initial()]

    # Determine how many characters we need for sufficient spacing.
    # With base-26 and length L we have 26^L slots.
    length = 1
    while _BASE**length < count + 1:
        length += 1

    total_slots = _BASE**length
    step = total_slots / (count + 1)

    ranks: list[str] = []
    for i in range(1, count + 1):
        val = int(step * i)
        digits: list[int] = []
        remaining = val
        for _ in range(length):
            digits.append(remaining % _BASE)
            remaining //= _BASE
        digits.reverse()
        rank = "".join(_index_char(d) for d in digits).rstrip(_MIN_CHAR)
        ranks.append(rank or _MIN_CHAR)

    return ranks
