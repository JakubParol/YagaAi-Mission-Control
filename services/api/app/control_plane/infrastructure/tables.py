from sqlalchemy import Column, ForeignKey, Index, Integer, PrimaryKeyConstraint, Table, Text

from app.shared.db.metadata import metadata

control_plane_commands = Table(
    "control_plane_commands",
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

control_plane_outbox = Table(
    "control_plane_outbox",
    metadata,
    Column("id", Text, primary_key=True),
    Column(
        "command_id",
        Text,
        ForeignKey("control_plane_commands.id", ondelete="CASCADE"),
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

control_plane_consumer_offsets = Table(
    "control_plane_consumer_offsets",
    metadata,
    Column("stream_key", Text, nullable=False),
    Column("consumer_group", Text, nullable=False),
    Column("consumer_name", Text, nullable=False),
    Column("last_message_id", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    PrimaryKeyConstraint("stream_key", "consumer_group", "consumer_name"),
)

control_plane_processed_messages = Table(
    "control_plane_processed_messages",
    metadata,
    Column("stream_key", Text, nullable=False),
    Column("consumer_group", Text, nullable=False),
    Column("message_id", Text, nullable=False),
    Column("correlation_id", Text, nullable=False),
    Column("processed_at", Text, nullable=False),
    PrimaryKeyConstraint("stream_key", "consumer_group", "message_id"),
)

control_plane_runs = Table(
    "control_plane_runs",
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

control_plane_run_steps = Table(
    "control_plane_run_steps",
    metadata,
    Column("step_id", Text, nullable=False),
    Column(
        "run_id",
        Text,
        ForeignKey("control_plane_runs.run_id", ondelete="CASCADE"),
        nullable=False,
    ),
    Column("status", Text, nullable=False),
    Column("last_event_type", Text, nullable=False),
    Column("created_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("terminal_at", Text),
    PrimaryKeyConstraint("run_id", "step_id"),
)

control_plane_run_timeline = Table(
    "control_plane_run_timeline",
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

control_plane_agent_queue = Table(
    "control_plane_agent_queue",
    metadata,
    Column("id", Text, primary_key=True),
    Column("work_item_id", Text, nullable=False),
    Column("work_item_key", Text, nullable=False),
    Column("work_item_type", Text, nullable=False),
    Column("work_item_title", Text, nullable=False, server_default=""),
    Column("agent_id", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("queue_position", Integer, nullable=False),
    Column("correlation_id", Text, nullable=False),
    Column("causation_id", Text),
    Column("enqueued_at", Text, nullable=False),
    Column("updated_at", Text, nullable=False),
    Column("cancelled_at", Text),
)

control_plane_dispatch_records = Table(
    "control_plane_dispatch_records",
    metadata,
    Column("id", Text, primary_key=True),
    Column("queue_entry_id", Text, nullable=False),
    Column("run_id", Text, nullable=False),
    Column("agent_id", Text, nullable=False),
    Column("work_item_id", Text, nullable=False),
    Column("work_item_key", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("envelope_json", Text, nullable=False),
    Column("session_id", Text),
    Column("process_id", Integer),
    Column("error_message", Text),
    Column("dispatched_at", Text),
    Column("created_at", Text, nullable=False),
)

Index(
    "idx_control_plane_commands_created_at",
    control_plane_commands.c.created_at,
)
Index(
    "idx_control_plane_outbox_status_available_at",
    control_plane_outbox.c.status,
    control_plane_outbox.c.available_at,
)
Index(
    "idx_control_plane_outbox_command_id",
    control_plane_outbox.c.command_id,
)
Index(
    "idx_control_plane_processed_messages_correlation",
    control_plane_processed_messages.c.correlation_id,
)
Index(
    "idx_control_plane_runs_status_updated_at",
    control_plane_runs.c.status,
    control_plane_runs.c.updated_at,
)
Index(
    "idx_control_plane_run_steps_run_status",
    control_plane_run_steps.c.run_id,
    control_plane_run_steps.c.status,
    control_plane_run_steps.c.updated_at,
)
Index(
    "idx_cp_agent_queue_agent_status",
    control_plane_agent_queue.c.agent_id,
    control_plane_agent_queue.c.status,
    control_plane_agent_queue.c.queue_position,
)
Index(
    "idx_cp_agent_queue_work_item_active",
    control_plane_agent_queue.c.work_item_id,
    unique=True,
    postgresql_where=control_plane_agent_queue.c.status.in_(
        ("QUEUED", "DISPATCHING", "ACK_PENDING")
    ),
)
Index(
    "idx_cp_dispatch_records_queue_entry",
    control_plane_dispatch_records.c.queue_entry_id,
)
Index(
    "idx_cp_dispatch_records_run_id",
    control_plane_dispatch_records.c.run_id,
)
