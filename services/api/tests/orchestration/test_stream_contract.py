import pytest

from app.orchestration.domain.stream_contract import RedisStreamContract, partition_for_key


def _contract(partitions: int = 8) -> RedisStreamContract:
    return RedisStreamContract(
        prefix="mc:orchestration",
        version=1,
        partitions=partitions,
        worker_consumer_group="orchestration-workers-v1",
        watchdog_consumer_group="orchestration-watchdog-v1",
    )


def test_partition_for_key_is_deterministic() -> None:
    one = partition_for_key("corr-123", 8)
    two = partition_for_key("corr-123", 8)
    assert one == two
    assert 0 <= one < 8


def test_partition_for_key_validates_positive_partitions() -> None:
    with pytest.raises(ValueError, match="partitions must be > 0"):
        partition_for_key("corr-123", 0)


def test_command_stream_uses_partitioned_contract_shape() -> None:
    contract = _contract(partitions=8)
    key = contract.command_stream("orchestration.run.submit", "corr-123")
    assert key.startswith("mc:orchestration:commands:orchestration_run_submit:v1:p")
    assert key.count(":p") == 1


def test_event_stream_uses_partitioned_contract_shape() -> None:
    contract = _contract(partitions=4)
    key = contract.event_stream("orchestration.run.submit.accepted", "corr-123")
    assert key.startswith("mc:orchestration:events:orchestration_run_submit_accepted:v1:p")
    assert key[-1] in {"0", "1", "2", "3"}


def test_dead_letter_stream_contract_is_unpartitioned() -> None:
    contract = _contract()
    assert contract.dead_letter_stream == "mc:orchestration:dead-letter:v1"
