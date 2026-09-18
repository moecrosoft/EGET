from pathlib import Path

# Place this file in the root of your EGET repository and run:
#     python template.py
#
# Existing files/directories are skipped and NEVER overwritten.

ROOT = Path(__file__).resolve().parent

DIRECTORIES = [
    "backend/app/api/routes",
    "backend/app/core",
    "backend/app/models",
    "backend/app/services/rag",
    "backend/app/services/agents",
    "backend/app/services/embeddings",
    "backend/app/services/llm",
    "backend/app/tools",
    "backend/app/repositories",
    "backend/app/utils",
    "backend/tests/unit",
    "backend/tests/integration",
    "backend/tests/evaluation",
    "frontend/src/components",
    "frontend/src/pages",
    "frontend/src/services",
    "frontend/src/hooks",
    "frontend/src/types",
    "frontend/src/utils",
    "frontend/public",
    "data/raw",
    "data/processed",
    "data/samples",
    "scripts",
    "configs",
    "docs",
    "infra/docker",
]

FILES = [
    # Backend
    "backend/app/__init__.py",
    "backend/app/main.py",
    "backend/app/api/__init__.py",
    "backend/app/api/routes/__init__.py",
    "backend/app/api/routes/chat.py",
    "backend/app/api/routes/documents.py",
    "backend/app/api/routes/health.py",
    "backend/app/api/dependencies.py",
    "backend/app/core/__init__.py",
    "backend/app/core/config.py",
    "backend/app/core/logging.py",
    "backend/app/core/security.py",
    "backend/app/models/__init__.py",
    "backend/app/models/schemas.py",
    "backend/app/models/database.py",
    "backend/app/services/__init__.py",
    "backend/app/services/rag/__init__.py",
    "backend/app/services/rag/pipeline.py",
    "backend/app/services/rag/ingestion.py",
    "backend/app/services/rag/chunking.py",
    "backend/app/services/rag/retrieval.py",
    "backend/app/services/rag/reranking.py",
    "backend/app/services/rag/generation.py",
    "backend/app/services/agents/__init__.py",
    "backend/app/services/agents/agent.py",
    "backend/app/services/agents/tools.py",
    "backend/app/services/agents/state.py",
    "backend/app/services/embeddings/__init__.py",
    "backend/app/services/embeddings/embeddings.py",
    "backend/app/services/llm/__init__.py",
    "backend/app/services/llm/provider.py",
    "backend/app/tools/__init__.py",
    "backend/app/tools/api_tools.py",
    "backend/app/tools/search.py",
    "backend/app/tools/database.py",
    "backend/app/repositories/__init__.py",
    "backend/app/repositories/vector_store.py",
    "backend/app/repositories/document_store.py",
    "backend/app/utils/__init__.py",
    "backend/app/utils/parsing.py",
    "backend/app/utils/helpers.py",
    "backend/pyproject.toml",
    "backend/tests/unit/__init__.py",
    "backend/tests/integration/__init__.py",
    "backend/tests/evaluation/__init__.py",
    "backend/tests/evaluation/test_retrieval.py",
    "backend/tests/evaluation/test_rag.py",

    # Frontend
    "frontend/src/services/api.ts",
    "frontend/src/types/index.ts",
    "frontend/src/App.tsx",
    "frontend/package.json",
    "frontend/tsconfig.json",
    "frontend/vite.config.ts",

    # Scripts
    "scripts/ingest.py",
    "scripts/seed.py",
    "scripts/evaluate.py",

    # Config
    "configs/development.yaml",
    "configs/production.yaml",

    # Documentation
    "docs/architecture.md",
    "docs/rag-pipeline.md",
    "docs/api.md",

    # Infrastructure
    "infra/docker/Dockerfile.backend",
    "infra/docker/Dockerfile.frontend",
    "infra/docker/docker-compose.yml",

    # Root
    ".env.example",
    "README.md",
]


def create_structure():
    created_dirs = []
    skipped_dirs = []
    created_files = []
    skipped_files = []

    # Create directories only if missing.
    for relative_dir in DIRECTORIES:
        path = ROOT / relative_dir

        if path.exists():
            skipped_dirs.append(relative_dir)
        else:
            path.mkdir(parents=True, exist_ok=True)
            created_dirs.append(relative_dir)

    # Create files only if missing.
    for relative_file in FILES:
        path = ROOT / relative_file

        # Make sure the parent directory exists.
        path.parent.mkdir(parents=True, exist_ok=True)

        if path.exists():
            skipped_files.append(relative_file)
        else:
            path.touch()
            created_files.append(relative_file)

    print("=" * 60)
    print("EGET RAG PROJECT STRUCTURE")
    print("=" * 60)

    print(f"\nCreated directories: {len(created_dirs)}")
    for item in created_dirs:
        print(f"  + {item}")

    print(f"\nCreated files: {len(created_files)}")
    for item in created_files:
        print(f"  + {item}")

    print(f"\nSkipped existing directories: {len(skipped_dirs)}")
    for item in skipped_dirs:
        print(f"  = {item}")

    print(f"\nSkipped existing files: {len(skipped_files)}")
    for item in skipped_files:
        print(f"  = {item}")

    print("\nDone.")
    print("Existing files were NOT modified or overwritten.")


if __name__ == "__main__":
    create_structure()
