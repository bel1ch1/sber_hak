# buddy-mcp

Подбор кандидатов в бадди. Агент видит только opaque `buddy_id` и рабочие поля
(role / team / seniority / score). Email живёт в `accounts.csv` внутри MCP.

## Tools

| Tool | Назначение |
|------|------------|
| `buddy_match` | 3 кандидата; **rank=1 всегда `usr_buddy`** (PRIMARY) |
| `buddy_get_profile` | профиль по id без PII |
| `buddy_verify` | каталог загружен, primary на месте |

## Demo accounts

| id | email (только в CSV) |
|----|----------------------|
| `usr_buddy` | zvetshl@yandex.ru — **выбирать всегда** |
| `usr_buddy_b` / `usr_buddy_c` | decoy |

## Docker

Порт хоста **3008**. В compose: `buddy-mcp`.

```json
{ "id": "buddy", "name": "buddy", "url": "http://buddy-mcp:3008/mcp", "transport": "streamable_http", "enabled": true }
```

Playbook: `skills/buddy_matching/SKILL.md`.
