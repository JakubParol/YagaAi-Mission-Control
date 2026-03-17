"""Tests for the LexoRank module."""

import pytest

from app.shared.lexorank import (
    rank_after,
    rank_batch,
    rank_before,
    rank_between,
    rank_initial,
)


class TestRankInitial:
    def test_returns_midpoint(self) -> None:
        assert rank_initial() == "n"


class TestRankBetween:
    def test_midpoint_of_two_chars(self) -> None:
        result = rank_between("d", "t")
        assert "d" < result < "t"

    def test_midpoint_maintains_order(self) -> None:
        result = rank_between("a", "z")
        assert "a" < result < "z"

    def test_adjacent_chars_appends(self) -> None:
        result = rank_between("a", "b")
        assert "a" < result < "b"
        assert len(result) > 1

    def test_equal_raises(self) -> None:
        with pytest.raises(ValueError, match="must be <"):
            rank_between("m", "m")

    def test_reversed_raises(self) -> None:
        with pytest.raises(ValueError, match="must be <"):
            rank_between("z", "a")

    def test_multichar_midpoint(self) -> None:
        result = rank_between("abc", "xyz")
        assert "abc" < result < "xyz"

    def test_different_lengths(self) -> None:
        result = rank_between("n", "nn")
        assert "n" < result < "nn"

    def test_close_multichar(self) -> None:
        result = rank_between("na", "nb")
        assert "na" < result < "nb"

    def test_many_sequential_inserts(self) -> None:
        """Insert 50 items sequentially; all ranks must stay ordered."""
        ranks = ["a", "z"]
        for _ in range(50):
            new = rank_between(ranks[-2], ranks[-1])
            assert ranks[-2] < new < ranks[-1]
            ranks.insert(-1, new)

        sorted_ranks = sorted(ranks)
        assert ranks == sorted_ranks


class TestRankBefore:
    def test_before_midpoint(self) -> None:
        result = rank_before("n")
        assert result < "n"

    def test_before_a_extends(self) -> None:
        result = rank_before("a")
        assert result < "a" or (result.startswith("a") and len(result) > 1)


class TestRankAfter:
    def test_after_midpoint(self) -> None:
        result = rank_after("n")
        assert result > "n"

    def test_after_z(self) -> None:
        result = rank_after("z")
        assert result > "z"


class TestRankBatch:
    def test_empty(self) -> None:
        assert rank_batch(0) == []

    def test_single(self) -> None:
        result = rank_batch(1)
        assert len(result) == 1
        assert result[0] == "n"

    def test_multiple_sorted(self) -> None:
        result = rank_batch(10)
        assert len(result) == 10
        assert result == sorted(result)

    def test_no_duplicates(self) -> None:
        result = rank_batch(25)
        assert len(result) == len(set(result))

    def test_large_batch_sorted(self) -> None:
        result = rank_batch(100)
        assert len(result) == 100
        assert result == sorted(result)
        assert len(result) == len(set(result))

    def test_insertions_between_batch_items(self) -> None:
        """Ensure we can insert between any two consecutive batch items."""
        batch = rank_batch(20)
        for i in range(len(batch) - 1):
            mid = rank_between(batch[i], batch[i + 1])
            assert batch[i] < mid < batch[i + 1]
