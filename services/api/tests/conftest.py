import os

os.environ.setdefault(
    "MC_API_POSTGRES_DSN",
    "postgresql://mission-control:mission-control@127.0.0.1:5432/mission_control_test",
)
