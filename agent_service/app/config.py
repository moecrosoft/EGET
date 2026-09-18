"""Application settings, read from environment variables / .env.

See `.env.example` at the project root for the full list of variables
with descriptions.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LiteLLM gateway (self-hosted via docker-compose)
    litellm_base_url: str = "http://localhost:4000"
    litellm_master_key: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Vector DB (self-hosted via docker-compose)
    qdrant_url: str = "http://localhost:6333"

    # Cache
    upstash_redis_rest_url: str = ""
    upstash_redis_rest_token: str = ""

    # Memory
    mem0_api_key: str = ""

    # Checkpointing
    agent_sqlite_path: str = "./data/checkpoints.db"

    # Node backend integration
    node_backend_base_url: str = "http://localhost:3000"

    # Service
    agent_service_port: int = 8000
    agent_log_level: str = "info"


settings = Settings()
