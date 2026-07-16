# Confluence (real wiki) MCP-коннектор для Ouroboros

Коннектор к **реальной корпоративной вики** на Confluence Cloud. Переиспользует
тот же Atlassian-аккаунт и API-token, что и Jira (Basic auth). Агент читает
реальные страницы компании и на их основе собирает онбординг.

Настройка вики: см. [SETUP_CONFLUENCE.md](SETUP_CONFLUENCE.md).

## Запуск
```bash
cd hackathon/confluence_mcp
../.venv/bin/python verify_confluence.py   # проверка + список space
./run.sh                                   # -> http://127.0.0.1:9103/mcp
```

## Подключение к Ouroboros
```json
{ "id": "confluence", "name": "confluence", "url": "http://localhost:9103/mcp", "transport": "streamable_http", "enabled": true }
```
Тулзы: `mcp_confluence__confluence_search`, `…_list_pages`, `…_get_page`,
`…_list_spaces`, `…_create_page`.

## Тулзы
| Тул | Тип | Что делает |
|-----|-----|-----------|
| `confluence_list_spaces` | read | список space (key, name) |
| `confluence_list_pages` | read | страницы в space (id, title, url) |
| `confluence_search` | read | полнотекстовый CQL-поиск |
| `confluence_get_page` | read | текст страницы по id |
| `confluence_create_page` | write | создать страницу из markdown |

## Файлы
```
confluence_mcp/
├── server.py             # FastMCP-сервер, 5 тулзов, :9103
├── confluence_client.py  # Confluence Cloud REST v1 (Basic auth) + md<->storage
├── verify_confluence.py  # проверка подключения (секрет маскируется)
├── seed_confluence.py    # (опц.) залить 7 мок-страниц в space через API
├── run.sh
├── config.example.env
└── SETUP_CONFLUENCE.md
```

## Связка с Jira
Агент: читает вики (`mcp_confluence__*`) → понимает контекст (доступы, команда,
курсы) → собирает план в Jira (`mcp_jira__*`). Мозг + руки по реальным данным.
