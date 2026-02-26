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

## Env

```bash
uv python pin 3.11
uv sync --extra dev
source .venv/bin/activate
```

## Setup

```bash
# In container
mkdir -p /workspaces/p7-a1/.nanobot-data
ln -sf /workspaces/p7-a1/.nanobot-data ~/.nanobot
nanobot onboard 
```

.nanobot-data/config.json

```json
{
    "agents": {
        "defaults": {
            "workspace": "~/.nanobot/workspace",
            "model": "qwen35-35b-a3b",
            "provider": "custom",
            "maxTokens": 65536,
            "temperature": 0.7,
            "maxToolIterations": 50,
            "memoryWindow": 100
        }
    },
    "providers": {
        "custom": {
            "apiKey": "dummy",
            "apiBase": "http://host.containers.internal:8080/v1",
            "extraHeaders": null
        }
    }
}
```

```
nanobot status

nanobot agent
```
