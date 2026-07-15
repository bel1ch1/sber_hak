# MCP-серверы хакатона

Папка для исходников MCP. Ouroboros подключается как **клиент** — сервер запускается отдельно.

## yandex-wiki-mcp (read-only)

| Параметр | Значение |
|----------|----------|
| Папка | `mcp/yandex-wiki-mcp/` |
| Режим | **read-only** (2 tools) |
| HTTP | `POST /mcp`, `GET /healthz` |
| Порт (хост) | `3001` |
| Порт (Docker) | `3005` → `3000` |
| ID в Ouroboros | `yandex-wiki` |
| OAuth scope | `wiki:read` достаточно |

### Auth

`YANDEX_WIKI_OAUTH_TOKEN` + `YANDEX_WIKI_ORG_ID` (организация wiki.yandex.ru).

### Tools

- `mcp_yandex_wiki__yandex_wiki_get_page`
- `mcp_yandex_wiki__yandex_wiki_list_descendants`

### Регистрация в Ouroboros

```json
{
  "id": "yandex-wiki",
  "name": "yandex-wiki",
  "url": "http://host.docker.internal:3001/mcp",
  "transport": "streamable_http",
  "enabled": true
}
```

Playbook: `skills/yandex_wiki/SKILL.md`.

## yandex-calendar-mcp

| Параметр | Значение |
|----------|----------|
| Папка | `mcp/yandex-calendar-mcp/` |
| HTTP | `POST /mcp`, `GET /healthz` |
| Порт (хост) | `3000` (`npm run server:http`) |
| Порт (Docker) | `3004` → `3000` (сервис в `docker-compose.yml`) |
| ID в Ouroboros | `yandex-calendar` |
| Tools prefix | `mcp_yandex_calendar__*` |

### Запуск на хосте (альтернатива)

```powershell
cd mcp/yandex-calendar-mcp
npm run server:http
```

### Запуск в Docker (рекомендуется)

```powershell
# из корня sber_hak
docker compose up -d --build yandex-calendar-mcp
curl http://localhost:3004/healthz
```

Ouroboros в том же compose подключается к `http://yandex-calendar-mcp:3000/mcp`.

### Регистрация в Ouroboros

Settings → Advanced → MCP → Add server:

```json
{
  "id": "yandex-calendar",
  "name": "yandex-calendar",
  "url": "http://host.docker.internal:3000/mcp",
  "transport": "streamable_http",
  "enabled": true
}
```

Также включите **MCP_ENABLED** в Advanced. Playbook: `skills/yandex_calendar/SKILL.md`.

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
