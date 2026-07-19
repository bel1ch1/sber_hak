#!/usr/bin/env bash
# Запуск MCP-сервера против реальной Jira Cloud. Читает .env, секреты не печатает.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  echo "Нет .env — скопируй: cp config.example.env .env  и заполни."
  exit 1
fi
export JIRA_MODE=real
echo "[jira-mcp] real mode -> http://127.0.0.1:${MCP_PORT:-9101}/mcp"
exec uv run --env-file .env server.py
