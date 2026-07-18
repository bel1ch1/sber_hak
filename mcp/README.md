# MCP-серверы хакатона

Папка для исходников MCP. Ouroboros подключается как **клиент** — сервер запускается отдельно.

## Docker Compose

Единый файл: [`docker-compose.mcp.yml`](../docker-compose.mcp.yml) в корне репо.

```powershell
# только MCP
docker compose -f docker-compose.mcp.yml up -d --build

# вместе с Ouroboros (локальный docker-compose.yml делает include)
docker compose up -d --build
```

| Сервис | Хост-порт | URL с хоста | URL из compose-сети |
|--------|-----------|-------------|---------------------|
| yandex-calendar-mcp | **3004** | `http://localhost:3004/mcp` | `http://yandex-calendar-mcp:3000/mcp` |
| yandex-mail-mcp | **3006** | `http://localhost:3006/mcp` | `http://yandex-mail-mcp:3000/mcp` |
| buddy-mcp | **3008** | `http://localhost:3008/mcp` | `http://buddy-mcp:3008/mcp` |
| stepik-mcp | **3007** | `http://localhost:3007/mcp` | `http://stepik-mcp:3000/mcp` |
| jira-mcp | **9101** | `http://localhost:9101/mcp` | `http://jira-mcp:9101/mcp` |
| wiki-mock-mcp | **9102** | `http://localhost:9102/mcp` | `http://wiki-mock-mcp:9102/mcp` |
| confluence-mcp | **9103** | `http://localhost:9103/mcp` | `http://confluence-mcp:9103/mcp` |

Удалены: `yandex-wiki-mcp`, `onboarding-mcp` (wiki — через `wiki-mock-mcp` или Confluence).

Секреты — в `.env` рядом с каждым MCP (`env_file` optional).

Проверка: `docker compose -f docker-compose.mcp.yml ps` — у всех `healthy`; Node: `GET /healthz`.

### Live `*_verify` (внешний API)

| MCP | Tool | Что дергает |
|-----|------|-------------|
| jira-mcp | `jira_verify` | REST get project (`JIRA_PROJECT_KEY`) |
| confluence-mcp | `confluence_verify` | list spaces (+ pages в space) |
| yandex-calendar-mcp | `yandex_calendar_verify` | CalDAV discovery |
| yandex-mail-mcp | `yandex_mail_verify` | IMAP LIST folders |
| buddy-mcp | `buddy_verify` | каталог accounts.csv / PRIMARY id |

### Анонимизация (id → логин внутри MCP)

| MCP | Есть? | Файл | Как агент передаёт |
|-----|-------|------|-------------------|
| yandex-mail | **да** (`MAIL_OBFUSCATION`) | `recipients.csv` | `to: ["usr_manager"]` |
| yandex-calendar | **да** (`CALENDAR_OBFUSCATION`) | `accounts.csv` | `attendees: ["usr_employee","usr_buddy"]` |
| jira | **да** | `accounts.csv` | `assignee_id` / `hire_id` → Jira accountId |
| buddy | **да** | `accounts.csv` | ответы только с `buddy_id` |
| confluence | **нет user-id в tools** | — | чтение/поиск страниц, без назначения людей |

Demo-логины: почта/календарь/бадди → `zvetshl@yandex.ru`; Jira assignee → `andreyzv5555@gmail.com`. PRIMARY buddy всегда `usr_buddy`.

**Без `*_verify` (нет внешнего API):** `wiki-mock-mcp`, `stepik-mcp`.

```powershell
docker compose -f docker-compose.mcp.yml up -d --build
cd mcp/jira-mcp
uv run --with mcp ..\verify_mcp_live.py
```

## yandex-mail-mcp

| Параметр | Значение |
|----------|----------|
| Папка | `mcp/yandex-mail-mcp/` |
| Режим | IMAP read + SMTP send (4 tools) |
| HTTP | `POST /mcp`, `GET /healthz` |
| Порт (хост) | `3002` |
| Порт (Docker) | `3006` → `3000` |
| ID в Ouroboros | `yandex-mail` |
| OAuth scopes | `mail:imap_ro` + `mail:smtp` (или app password) |

### Auth

`YANDEX_MAIL_LOGIN` + (`YANDEX_MAIL_OAUTH_TOKEN` **или** `YANDEX_MAIL_APP_PASSWORD`).

### Tools

- `mcp_yandex_mail__yandex_mail_list_folders`
- `mcp_yandex_mail__yandex_mail_list_messages`
- `mcp_yandex_mail__yandex_mail_get_message`
- `mcp_yandex_mail__yandex_mail_send`

### Регистрация в Ouroboros

```json
{
  "id": "yandex-mail",
  "name": "yandex-mail",
  "url": "http://yandex-mail-mcp:3000/mcp",
  "transport": "streamable_http",
  "enabled": true
}
```

Playbook: `skills/yandex_mail/SKILL.md`.

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

## jira-mcp (план ИС)

| Параметр | Значение |
|----------|----------|
| Папка | `mcp/jira-mcp/` |
| Режим | Python/FastMCP · mock или real (Jira Cloud REST v2) |
| HTTP | `POST /mcp` (streamable_http) |
| Порт (хост) | `9101` |
| ID в Ouroboros | `jira` |

### Auth
`.env` из `config.example.env`: `JIRA_BASE_URL` + `JIRA_EMAIL` + `JIRA_API_TOKEN` (Basic). Локально: `uv sync && uv run --env-file .env server.py`. Docker: сервис `jira-mcp` в `docker-compose.mcp.yml` (порт **9101**, mock по умолчанию).

### Tools
- `mcp_jira__jira_get_project`, `mcp_jira__jira_search` (read)
- `mcp_jira__jira_create_issue`, `mcp_jira__jira_bulk_create`
- `mcp_jira__jira_create_onboarding_plan` — Epic + ~20 задач из шаблона роли, `dry_run→approve→commit`, идемпотентность по label `onboarding:<hire_id>`
- `mcp_jira__jira_rollback_plan` — откат по label

### Регистрация в Ouroboros
```json
{ "id": "jira", "name": "jira", "url": "http://localhost:9101/mcp", "transport": "streamable_http", "enabled": true }
```
Playbook: `skills/onboarding/SKILL.md` (шаг 7). Гоча: Jira Cloud удалил `POST /rest/api/2/search` (410) — используем `/search/jql`.

## wiki-mock-mcp (мок корп-вики)

| Параметр | Значение |
|----------|----------|
| Папка | `mcp/wiki-mock-mcp/` |
| Режим | Python/FastMCP · read-only, локальные markdown-страницы |
| HTTP | `POST /mcp` (streamable_http) |
| Порт (хост) | `9102` |
| ID в Ouroboros | `wiki` |

### Auth
Не нужен (мок). Контент — `pages/*.md` (frontmatter: slug/title/parent/tags), 7 страниц о компании (доступы, команда, курсы, бадди, стандарты).

### Tools
- `mcp_wiki__wiki_list_pages`, `mcp_wiki__wiki_search` (полнотекстовый!), `mcp_wiki__wiki_get_page`

### Регистрация в Ouroboros
```json
{ "id": "wiki", "name": "wiki", "url": "http://localhost:9102/mcp", "transport": "streamable_http", "enabled": true }
```
Playbook: `skills/onboarding/SKILL.md` (шаг 0). Гоча Ouroboros: MCP-сервер, добавленный среди сессии, не попадает в envelope воркеров — нужен мягкий `/restart`.

## confluence-mcp (реальная вика)

| Параметр | Значение |
|----------|----------|
| Папка | `mcp/confluence-mcp/` |
| Режим | Python/FastMCP · Confluence Cloud REST v1 |
| HTTP | `POST /mcp` (streamable_http) |
| Порт (хост) | `9103` |
| ID в Ouroboros | `confluence` |

### Auth
Те же email+API-token, что для Jira (Basic). `.env` из `config.example.env` + `CONFLUENCE_SPACE_KEY`. Docker: сервис `confluence-mcp` в `docker-compose.mcp.yml` (порт **9103**). Verify: `confluence_verify` / `verify_confluence.py`.

### Tools
- `mcp_confluence__confluence_verify` — list spaces (+ pages)
- `mcp_confluence__confluence_list_spaces`, `…_list_pages`, `…_search` (CQL), `…_get_page` (read)
- `mcp_confluence__confluence_create_page` (markdown→storage)

### Регистрация в Ouroboros
```json
{ "id": "confluence", "name": "confluence", "url": "http://confluence-mcp:9103/mcp", "transport": "streamable_http", "enabled": true }
```
Playbook: `skills/onboarding/SKILL.md` (шаг 4 — письмо с инфо о компании).
