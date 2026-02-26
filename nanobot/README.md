# P7-A1

## VSCode (Dev Container)

.devcontainer/devcontainer.json

```json
{
    "name": "Python 3.11 App Environment",
    "image": "mcr.microsoft.com/devcontainers/python:3.11-bookworm",
    "features": {
        "ghcr.io/devcontainers-extra/features/uv:1": {},
        "ghcr.io/anthropics/devcontainer-features/claude-code:1": {}
    },
    "runArgs": [
        "--userns=keep-id"
    ],
    "containerEnv": {
        "UV_CACHE_DIR": "${containerWorkspaceFolder}/.uv-cache"
    },
    "remoteUser": "vscode"
}
```

## Claude Code

.claude/settings.json

```json
{
    "env": {
        "ANTHROPIC_AUTH_TOKEN": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx",
        "ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
        "API_TIMEOUT_MS": "3000000",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.5-air",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.7",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5"
    }
}

```

## 環境構築

```bash
uv python pin 3.11
uv sync --extra dev
source .venv/bin/activate
```
