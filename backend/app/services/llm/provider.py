from langchain.chat_models import init_chat_model, BaseChatModel
from functools import lru_cache
from backend.app.services.settings.config import get_settings

settings = get_settings()

@lru_cache(maxsize=1)
def set_model(
    temperature: float
) -> BaseChatModel:
    """Create LangChain ChatModel Instance"""
    return init_chat_model(
        model=settings.groq_model,
        temperature=temperature
    )