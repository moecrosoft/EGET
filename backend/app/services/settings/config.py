from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file='.env',
        env_file_encoding="utf-8",
        case_sensitive=False
    )

    groq_api_key: str = Field("",description="groq api key")
    groq_model: str = Field("openai/gpt-oss-20b",description="groq llm")

    openrouter_api_key: str = Field("",description="openrouter api")
    # openrouter_model: str = Field("")

    onemap_token: str = Field("",description="onemap token")
    lta_api_key: str = Field("",description="lta api key")

    qdrant_api: str = Field("",description="qdrant api")
    qdrant_collection: str = Field("eteg",description="qdrant collection name")


@lru_cache(maxsize=1)
def get_settings():
    return Settings()

    
