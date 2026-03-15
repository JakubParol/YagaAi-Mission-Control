from sqlalchemy import REAL, Column, Integer, Table, Text

from app.shared.db.metadata import metadata

imports = Table(
    "imports",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("started_at", Text, nullable=False),
    Column("finished_at", Text),
    Column("mode", Text, nullable=False),
    Column("from_timestamp", Text),
    Column("to_timestamp", Text, nullable=False),
    Column("status", Text, nullable=False),
    Column("error_message", Text),
)

langfuse_daily_metrics = Table(
    "langfuse_daily_metrics",
    metadata,
    Column("date", Text, primary_key=True),
    Column("model", Text, primary_key=True),
    Column("input_tokens", Integer, nullable=False, default=0),
    Column("output_tokens", Integer, nullable=False, default=0),
    Column("total_tokens", Integer, nullable=False, default=0),
    Column("request_count", Integer, nullable=False, default=0),
    Column("total_cost", REAL, nullable=False, default=0),
)

langfuse_requests = Table(
    "langfuse_requests",
    metadata,
    Column("id", Text, primary_key=True),
    Column("trace_id", Text),
    Column("name", Text),
    Column("model", Text),
    Column("started_at", Text),
    Column("finished_at", Text),
    Column("input_tokens", Integer, nullable=False, default=0),
    Column("output_tokens", Integer, nullable=False, default=0),
    Column("total_tokens", Integer, nullable=False, default=0),
    Column("cost", REAL),
    Column("latency_ms", Integer),
)
