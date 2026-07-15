# MCP-серверы хакатона

Папка для исходников MCP. Ouroboros подключается как **клиент** — сервер запускается отдельно.

## Минимальный контракт

1. Transport: `streamable_http`
2. URL в agent.env / Settings → Advanced → MCP
3. Имена tools в playbook: `mcp_<server_id>__<tool_name>`

## Пример регистрации в агенте

Settings → Advanced → MCP → Add server:

```json
{
  "id": "hackathon",
  "name": "hackathon",
  "url": "http://host.docker.internal:9999/mcp",
  "transport": "streamable_http",
  "enabled": true
}
```

## Правила проектирования tools

- Один tool = одно действие
- Side-effects явны: `create_draft` ≠ `submit`
- Ответ — структурированный JSON: `id`, `status`, `next_action`
- Auth — через Secrets/headers сервера, не в skill

## Запуск MCP на хосте (пример)

```bash
cd mcp/your-server
# uv run / python -m your_server --port 9999
```

Из контейнера Ouroboros используйте `host.docker.internal:9999`.
