# Control Plane Redis Stream Contract (MC-371)

Defines the v1 Redis stream topology and consumer-group naming used by control-plane producers and workers.

## Contract version

- Stream version: `v1`
- Prefix: `mc:control-plane` (configurable with `MC_API_CONTROL_PLANE_STREAM_PREFIX`)
- Partition count: `8` by default (`MC_API_CONTROL_PLANE_STREAM_PARTITIONS`)

## Stream keys

### Command stream (partitioned)

Pattern:

`mc:control-plane:commands:<topic>:v1:p<partition>`

Example:

`mc:control-plane:commands:control_plane_run_submit:v1:p3`

### Event stream (partitioned)

Pattern:

`mc:control-plane:events:<topic>:v1:p<partition>`

Example:

`mc:control-plane:events:control_plane_run_submit_accepted:v1:p3`

### Dead-letter stream (unpartitioned)

Pattern:

`mc:control-plane:dead-letter:v1`

## Partitioning strategy

- Partition index = `blake2b(partition_key) % partitions`.
- `partition_key` should be the run correlation key (`correlation_id`) to keep a run on one partition.
- Topic is sanitized to lowercase with non-alphanumeric characters converted to `_`.

## Consumer groups

- Worker group: `control-plane-workers-v1` (`MC_API_CONTROL_PLANE_WORKER_CONSUMER_GROUP`)
- Watchdog group: `control-plane-watchdog-v1` (`MC_API_CONTROL_PLANE_WATCHDOG_CONSUMER_GROUP`)

## Retry/dead-letter metadata contract

Workers should preserve these envelope metadata fields across retries:

- `correlation_id`
- `causation_id`
- `attempt`
- `max_attempts`
- `next_retry_at`
- `last_error_code`
- `last_error_message`

When `attempt > max_attempts`, event is moved to dead-letter stream with replay metadata:

- `dead_letter_reason`
- `dead_lettered_at`
- `source_stream`
- `source_message_id`
- `replay_hint`

The API outbox persists dead-letter details in queryable fields (`dead_lettered_at`, `dead_letter_payload_json`) for operator diagnostics and replay tooling.

## Restart/rebalance recovery contract

Consumer recovery state is persisted to support restart and rebalance scenarios:

- `control_plane_consumer_offsets`: checkpoint (`last_message_id`) per `stream_key + consumer_group + consumer_name`
- `control_plane_processed_messages`: idempotency ledger keyed by `stream_key + consumer_group + message_id`

Worker loop should:
1. Read checkpoint on startup (`0-0` fallback if missing).
2. Skip message processing when idempotency ledger already contains the message id.
3. After successful processing, append to idempotency ledger and advance checkpoint.

## Navigation

- ↑ [Docs Index](./INDEX.md)
- → [API Contracts](./API_CONTRACTS.md)
