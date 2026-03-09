import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load local env files into os.environ so both MC_API_* (pydantic prefix) and
# shared vars (MC_DB_PATH, LANGFUSE_*) are available.
#
# Precedence:
# 1) Process env (e.g. systemd EnvironmentFile in production)
# 2) services/api/.env.local (local developer overrides)
# 3) services/api/.env
_env_dir = Path(__file__).resolve().parent.parent
for _env_name in (".env.local", ".env"):
    load_dotenv(_env_dir / _env_name, override=False)


class Settings(BaseSettings):
    app_name: str = "mission-control-api"
    env: str = "dev"
    log_level: str = "INFO"

    db_path: str = ""
    postgres_dsn: str = ""
    db_engine: str = "sqlite"
    postgres_pool_max_size: int = 10
    openclaw_config_path: str = str(Path.home() / ".openclaw" / "openclaw.json")
    langfuse_host: str = ""
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3100"]
    orchestration_stream_prefix: str = "mc:orchestration"
    orchestration_stream_version: int = 1
    orchestration_stream_partitions: int = 8
    orchestration_worker_consumer_group: str = "orchestration-workers-v1"
    orchestration_watchdog_consumer_group: str = "orchestration-watchdog-v1"
    orchestration_retry_max_attempts: int = 5
    orchestration_retry_base_backoff_seconds: int = 5
    orchestration_retry_max_backoff_seconds: int = 300
    orchestration_watchdog_stale_lease_seconds: int = 90
    orchestration_watchdog_heartbeat_grace_seconds: int = 90
    orchestration_watchdog_default_timeout_seconds: int = 900
    orchestration_commands_enabled: bool = True
    orchestration_dapr_ingest_enabled: bool = True
    orchestration_watchdog_enabled: bool = True

    model_config = SettingsConfigDict(env_prefix="MC_API_")

    @model_validator(mode="after")
    def resolve_shared_env_vars(self) -> "Settings":
        if not self.db_path:
            self.db_path = os.environ.get("MC_DB_PATH", "")

        if not self.postgres_dsn:
            self.postgres_dsn = os.environ.get("MC_POSTGRES_DSN", "")

        self.db_engine = (self.db_engine or os.environ.get("MC_DB_ENGINE", "sqlite")).lower()
        if not self.openclaw_config_path:
            self.openclaw_config_path = os.environ.get(
                "OPENCLAW_CONFIG_PATH", str(Path.home() / ".openclaw" / "openclaw.json")
            )
        if not self.langfuse_host:
            self.langfuse_host = os.environ.get("LANGFUSE_HOST", "")
        if not self.langfuse_public_key:
            self.langfuse_public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
        if not self.langfuse_secret_key:
            self.langfuse_secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")

        if self.db_engine not in {"sqlite", "postgres"}:
            msg = "MC_API_DB_ENGINE must be one of: sqlite, postgres"
            raise ValueError(msg)

        if self.db_engine == "sqlite" and not self.db_path:
            msg = "MC_API_DB_PATH or MC_DB_PATH must be set when MC_API_DB_ENGINE=sqlite"
            raise ValueError(msg)

        if self.db_engine == "postgres" and not self.postgres_dsn:
            msg = (
                "MC_API_POSTGRES_DSN or MC_POSTGRES_DSN must be set when MC_API_DB_ENGINE=postgres"
            )
            raise ValueError(msg)

        if self.postgres_pool_max_size < 1:
            msg = "MC_API_POSTGRES_POOL_MAX_SIZE must be >= 1"
            raise ValueError(msg)

        return self


settings = Settings()
