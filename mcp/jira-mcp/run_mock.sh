#!/usr/bin/env bash
# Запуск MCP-сервера в mock-режиме (без Jira).
set -euo pipefail
cd "$(dirname "$0")"
export JIRA_MODE=mock
echo "[jira-mcp] mock mode -> http://127.0.0.1:${MCP_PORT:-9101}/mcp"
exec uv run server.py
