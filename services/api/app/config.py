from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "mission-control-api"
    env: str = "dev"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(env_prefix="MC_API_", env_file=".env")


settings = Settings()
