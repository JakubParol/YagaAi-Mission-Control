from sqlalchemy import Column, ForeignKey, Index, Integer, PrimaryKeyConstraint, Table, Text

from app.shared.db.metadata import metadata

orchestration_commands = Table(
    "orchestration_commands",
    metadata,
    Column("id", Text, primary_key=True),
    Column("command_type", Text, nullable=False),
    Column("schema_version", Text, nullable=False),
    Column("occurred_at", Text, nullable=False),
    Column("producer", Text, nullable=False),
    Column("correlation_id", Text, nullable=False),
    Column("causation_id", Text),
    Column("payload_json", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("created_at", Text, nullable=False),
)

orchestration_outbox = Table(
    "orchestration_outbox",
    metadata,
    Column("id", Text, primary_key=True),
    Column(
        "command_id",
        Text,
        ForeignKey("orchestration_commands.id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("event_type", Text, nullable=False),
    Column("schema_version", Text, nullable=False),
    Column("occurred_at", Text, nullable=False),
    Column("producer", Text, nullable=False),
    Column("correlation_id", Text, nullable=False),
    Column("causation_id", Text),
    Column("payload_json", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("retry_attempt", Integer, nullable=False, default=1),
    Column("max_attempts", Integer, nullable=False, default=5),
    Column("available_at", Text, nullable=False),
    Column("published_at", Text),
    Column("last_error", Text),
    Column("dead_lettered_at", Text),
    Column("dead_letter_payload_json", Text),
    Column("created_at", Text, nullable=False),
)

orchestration_consumer_offsets = Table(
    "orchestration_consumer_offsets",
    metadata,
    Column("stream_key", Text, nullable=False),
    Column("consumer_group", Text, nullable=False),
    Column("consumer_name", Text, nullable=False),
    Column("last_message_id", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    PrimaryKeyConstraint("stream_key", "consumer_group", "consumer_name"),
)

orchestration_processed_messages = Table(
    "orchestration_processed_messages",
    metadata,
    Column("stream_key", Text, nullable=False),
    Column("consumer_group", Text, nullable=False),
    Column("message_id", Text, nullable=False),
    Column("correlation_id", Text, nullable=False),
    Column("processed_at", Text, nullable=False),
    PrimaryKeyConstraint("stream_key", "consumer_group", "message_id"),
)

orchestration_runs = Table(
    "orchestration_runs",
    metadata,
    Column("run_id", Text, primary_key=True),
    Column("status", Text, nullable=False),
    Column("correlation_id", Text, nullable=False),
    Column("current_step_id", Text),
    Column("last_event_type", Text, nullable=False),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("run_type", Text, nullable=False, default="DEFAULT"),
    Column("lease_owner", Text),
    Column("lease_token", Text),
    Column("last_heartbeat_at", Text),
    Column("watchdog_timeout_at", Text),
    Column("watchdog_attempt", Integer, nullable=False, default=0),
    Column("watchdog_state", Text, nullable=False, default="NONE"),
    Column("terminal_at", Text),
)

orchestration_run_steps = Table(
    "orchestration_run_steps",
    metadata,
    Column("step_id", Text, nullable=False),
    Column(
        "run_id",
        Text,
        ForeignKey("orchestration_runs.run_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("status", Text, nullable=False),
    Column("last_event_type", Text, nullable=False),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("terminal_at", Text),
    PrimaryKeyConstraint("run_id", "step_id"),
)

orchestration_run_timeline = Table(
    "orchestration_run_timeline",
    metadata,
    Column("id", Text, primary_key=True),
    Column("run_id", Text, nullable=False),
    Column("step_id", Text),
    Column("message_id", Text),
    Column("event_type", Text, nullable=False),
    Column("decision", Text, nullable=False),
    Column("reason_code", Text),
    Column("reason_message", Text),
    Column("correlation_id", Text, nullable=False),
    Column("causation_id", Text),
    Column("payload_json", Text, nullable=False),
    Column("occurred_at", Text, nullable=False),
    Column("created_at", Text, nullable=False),
)

Index(
    "idx_orchestration_commands_created_at",
    orchestration_commands.c.created_at,
)
Index(
    "idx_orchestration_outbox_status_available_at",
    orchestration_outbox.c.status,
    orchestration_outbox.c.available_at,
)
Index(
    "idx_orchestration_outbox_command_id",
    orchestration_outbox.c.command_id,
)
Index(
    "idx_orchestration_processed_messages_correlation",
    orchestration_processed_messages.c.correlation_id,
)
Index(
    "idx_orchestration_runs_status_updated_at",
    orchestration_runs.c.status,
    orchestration_runs.c.updated_at,
)
Index(
    "idx_orchestration_run_steps_run_status",
    orchestration_run_steps.c.run_id,
    orchestration_run_steps.c.status,
    orchestration_run_steps.c.updated_at,
)
