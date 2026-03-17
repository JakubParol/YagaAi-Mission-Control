from dataclasses import dataclass
from hashlib import blake2b


def _sanitize_topic(value: str) -> str:
    sanitized = "".join(ch if (ch.isalnum() or ch in {"-", "_"}) else "_" for ch in value.lower())
    return sanitized.strip("_") or "unknown"


def partition_for_key(partition_key: str, partitions: int) -> int:
    if partitions <= 0:
        msg = "partitions must be > 0"
        raise ValueError(msg)
    digest = blake2b(partition_key.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % partitions


@dataclass(frozen=True)
class RedisStreamContract:
    prefix: str
    version: int
    partitions: int
    worker_consumer_group: str
    watchdog_consumer_group: str

    @property
    def dead_letter_stream(self) -> str:
        return f"{self.prefix}:dead-letter:v{self.version}"

    def command_stream(self, command_type: str, partition_key: str) -> str:
        topic = _sanitize_topic(command_type)
        partition = partition_for_key(partition_key, self.partitions)
        return f"{self.prefix}:commands:{topic}:v{self.version}:p{partition}"

    def event_stream(self, event_type: str, partition_key: str) -> str:
        topic = _sanitize_topic(event_type)
        partition = partition_for_key(partition_key, self.partitions)
        return f"{self.prefix}:events:{topic}:v{self.version}:p{partition}"
