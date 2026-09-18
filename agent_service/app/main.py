"""FastAPI application entrypoint."""

from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="agent-service")
app.state.settings = settings


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
