# yandex-calendar-mcp

MCP-сервер для Яндекс Календаря через CalDAV (`caldav.yandex.ru`). Runtime: **Node.js** (tsx локально, esbuild-бандл в Docker).

| Инструмент | Что делает |
|---|---|
| `yandex_calendar_create_event` | Создать событие (+приглашения, идемпотентность по client_token) |
| `yandex_calendar_list_events` | События в диапазоне (до 366 дней), включая отменённые |
| `yandex_calendar_update_event` | Правка события по uid/href/etag (кроме recurring и attendees) |
| `yandex_calendar_cancel_event` | Отмена с iTIP CANCEL-письмом участникам |
| `yandex_calendar_check_availability` | Занятые блоки (до 92 дней), recurring разворачивается сервером |

## Локальный запуск (Node.js)

```powershell
cd mcp_servers/yandex-calendar-mcp
copy .env.example .env   # заполнить YANDEX_LOGIN, YANDEX_APP_PASSWORD
# для HTTP опционально: MCP_AUTH_TOKEN (пусто = без Bearer, только внутренняя сеть)

$env:Path = "C:\Users\zvonkov.a\nodejs\node-v24.14.0-win-x64;$env:Path"
npm install

# stdio (для Cursor / OpenCode MCP)
npm run server

# HTTP на :3000 — POST /mcp, GET /healthz (Bearer, если задан MCP_AUTH_TOKEN)
npm run server:http

# проверка discovery (без записи в календарь)
npm run smoke:discovery

# unit-тесты
npm test
```

Креды: `YANDEX_LOGIN` + `YANDEX_APP_PASSWORD` (пароль приложения со scope CalDAV).  
Каскад: `process.env` → `mcp_servers/yandex-calendar-mcp/.env` → `<workspace>/.opencode/.env` → `~/.config/opencode/.env` → `~/.openwork/.env`.

### Корпоративный TLS (Kaspersky и т.п.)

Если `smoke:discovery` падает с `fetch failed` / `self-signed certificate in certificate chain` — нужен CA в `certs/corp-ca.pem`. См. [certs/README.md](certs/README.md). npm-скрипты (`server`, `server:http`, `smoke:*`) подключают его через `with-ca.cmd`.

### Cursor / OpenCode (stdio)

```json
"yandex-calendar": {
  "type": "local",
  "command": ["node", "--import", "tsx", "<абсолютный-путь>/yandex-calendar-mcp/server.ts"],
  "enabled": true
}
```

Рабочая директория команды должна быть каталогом пакета (или задайте `PATH` к Node), чтобы `tsx` резолвился из `node_modules`.

## Docker

```bash
# из mcp_servers/
docker compose up -d --build yandex-calendar-mcp
curl http://localhost:3004/healthz
```

В `.env` обязательны `YANDEX_*`. `MCP_AUTH_TOKEN` опционален (пусто = без Bearer). Порт хоста: **3004**.

Подробности — в [HANDOFF.md](HANDOFF.md).
