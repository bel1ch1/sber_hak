# yandex-wiki-mcp (read-only)

MCP-сервер для **wiki.yandex.ru** через [Public API](https://yandex.ru/support/wiki/en/api-ref/).  
**Только чтение** — без create/update/append.

| Инструмент | Что делает |
|---|---|
| `yandex_wiki_get_page` | Прочитать страницу по `slug` или `page_id` |
| `yandex_wiki_list_descendants` | Список подстраниц раздела (навигация по дереву) |

> API **не поддерживает full-text search**. Для навигации: `list_descendants` + точный `slug`.

## Auth

Достаточно OAuth с правом **`wiki:read`**:

- `YANDEX_WIKI_OAUTH_TOKEN` — `Authorization: OAuth <token>`
- `YANDEX_WIKI_ORG_ID` — `X-Org-Id` (организация из wiki.yandex.ru / Трекера)

Справка: [Доступ к API](https://yandex.ru/support/wiki/ru/api-ref/access)

## Локальный запуск

```powershell
cd mcp/yandex-wiki-mcp
copy .env.example .env   # заполнить токен и org id
npm install
npm run server:http      # HTTP :3001
npm run smoke:discovery
npm test
```

## Ouroboros

```json
{
  "id": "yandex-wiki",
  "name": "yandex-wiki",
  "url": "http://host.docker.internal:3001/mcp",
  "transport": "streamable_http",
  "enabled": true
}
```

Tools: `mcp_yandex_wiki__yandex_wiki_get_page`, `mcp_yandex_wiki__yandex_wiki_list_descendants`.

Playbook: `skills/yandex_wiki/SKILL.md`.

## Docker

```bash
docker compose up -d --build yandex-wiki-mcp
curl http://localhost:3005/healthz
```

Порт хоста: **3005** → контейнер `3000`.
