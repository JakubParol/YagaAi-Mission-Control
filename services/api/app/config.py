import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env into os.environ so both MC_API_* (pydantic prefix) and
# shared vars (MC_DB_PATH, LANGFUSE_*, WORKFLOW_SYSTEM_PATH) are available.
_env_file = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_file, override=False)


class Settings(BaseSettings):
    app_name: str = "mission-control-api"
    env: str = "dev"
    log_level: str = "INFO"

    db_path: str = ""
    workflow_system_path: str = ""
    langfuse_host: str = ""
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3100"]

    model_config = SettingsConfigDict(env_prefix="MC_API_")

    @model_validator(mode="after")
    def resolve_shared_env_vars(self) -> "Settings":
        if not self.db_path:
            self.db_path = os.environ.get("MC_DB_PATH", "")
        if not self.workflow_system_path:
            self.workflow_system_path = os.environ.get(
                "WORKFLOW_SYSTEM_PATH", "/home/kuba/.openclaw/SUPERVISOR_SYSTEM"
            )
        if not self.langfuse_host:
            self.langfuse_host = os.environ.get("LANGFUSE_HOST", "")
        if not self.langfuse_public_key:
            self.langfuse_public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
        if not self.langfuse_secret_key:
            self.langfuse_secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")

        if not self.db_path:
            msg = "MC_API_DB_PATH or MC_DB_PATH must be set"
            raise ValueError(msg)
        if not self.workflow_system_path:
            msg = "MC_API_WORKFLOW_SYSTEM_PATH or WORKFLOW_SYSTEM_PATH must be set"
            raise ValueError(msg)
        return self


settings = Settings()
