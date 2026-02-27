import os

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "mission-control-api"
    env: str = "dev"
    log_level: str = "INFO"

    db_path: str = ""
    supervisor_system_path: str = ""
    langfuse_host: str = ""
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3100"]

    model_config = SettingsConfigDict(env_prefix="MC_API_", env_file=".env")

    @model_validator(mode="after")
    def resolve_shared_env_vars(self) -> "Settings":
        if not self.db_path:
            self.db_path = os.environ.get("MC_DB_PATH", "")
        if not self.supervisor_system_path:
            self.supervisor_system_path = os.environ.get(
                "SUPERVISOR_SYSTEM_PATH", "/home/kuba/.openclaw/SUPERVISOR_SYSTEM"
            )
        if not self.langfuse_host:
            self.langfuse_host = os.environ.get("LANGFUSE_HOST", "")
        if not self.langfuse_public_key:
            self.langfuse_public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
        if not self.langfuse_secret_key:
            self.langfuse_secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "")
        return self


settings = Settings()
