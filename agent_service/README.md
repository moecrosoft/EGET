# agent_service

Python agentic-RAG backend for the commuter-companion app (Arjun persona). Built with
FastAPI + LangGraph, talking to a self-hosted LiteLLM proxy (OpenAI-compatible gateway
over Groq/OpenRouter/Anthropic/OpenAI) and a self-hosted Qdrant vector store.

This is currently a **scaffold only** (Task 1 of the build plan): folder structure,
dependencies, docker-compose infra for Qdrant + LiteLLM, and a `/health` endpoint.
No RAG/LLM/agent logic yet.

## Setup

```bash
cd agent_service
cp .env.example .env   # fill in real keys before running against live services
uv sync
```

`LITELLM_MASTER_KEY` is **required**, not optional — the app fails to start
without it, and it's what the LiteLLM proxy uses to reject unauthenticated
requests to your provider keys. Generate one with `openssl rand -hex 32` (a
placeholder value is fine for local dev, but the variable must be set).

## Run the API

```bash
uv run uvicorn app.main:app --reload --port 8000
```

`GET /health` returns `{"status": "ok"}`.

## Run tests

```bash
uv run pytest
```

Tests run with zero external services required — LiteLLM/Qdrant/Redis/mem0 are
mocked or not needed at all for this task's test suite.

## Infra (Qdrant + LiteLLM)

```bash
docker compose up -d
```

Starts:
- `qdrant` — vector DB on `localhost:6333` (persisted to a named volume).
- `litellm` — LiteLLM proxy on `localhost:4000`, configured via `litellm_config.yaml`
  with three named "tier" models (`tier-nano` / Groq, `tier-small` / OpenRouter,
  `tier-large` / Anthropic with an OpenAI fallback). Requires the provider API keys
  in `.env` to actually serve requests. `LITELLM_MASTER_KEY` must be set in `.env`
  before running `docker compose up` — the proxy uses it as its client auth key
  (`general_settings.master_key` in `litellm_config.yaml`), and without it the
  proxy would accept unauthenticated requests against your real provider keys.

The compose file has not been runtime-validated against a live `docker compose` in
this environment (no Docker available) — see the Task 1 report for details.

## Project layout

```
app/
  main.py            FastAPI app + /health
  config.py           pydantic Settings (env vars)
  llm/                 LiteLLM client + model router (Task 2+)
  graph/                LangGraph state + nodes (Task 4+)
  rag/                   Qdrant schema, embeddings, hybrid search (Task 3+)
  memory/                 mem0 integration (Task 10+)
  tools/                   Node backend HTTP client, tool nodes (Task 6+)
  cache/                   Redis caching (Task 9+)
  checkpoint/               LangGraph checkpointing (Task 10+)
scripts/              one-off/manual scripts (e.g. smoke_test.py, Task 4+)
tests/                pytest suite
```
