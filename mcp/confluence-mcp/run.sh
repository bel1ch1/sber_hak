#!/usr/bin/env bash
# Запуск Confluence MCP-сервера. Читает .env, секреты не печатает.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  echo "Нет .env — cp config.example.env .env  и заполни."
  exit 1
fi
set -a; source .env; set +a
echo "[confluence-mcp] -> http://127.0.0.1:${MCP_PORT:-9103}/mcp  (space=${CONFLUENCE_SPACE_KEY:-any})"
exec ../.venv/bin/python server.py
