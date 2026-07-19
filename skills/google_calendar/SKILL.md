---
name: google_calendar
description: Работа с Google Calendar через Calendar API MCP; opaque attendees из accounts.csv.
version: 0.1.0
type: instruction
when_to_use: User asks to schedule, list, update, cancel meetings or check availability via Google Calendar MCP (preferred with Gmail).
---

# Google Calendar (MCP)

## Роль
Планировать встречи в Google Calendar. Креды — те же OAuth, что у `gmail-mcp` (нужны calendar scopes).

## ВАЖНО: MCP только в задаче (task)

Tools доступны в **task**, не в ephemeral-чате. Yandex calendar MCP отключён — не используй `mcp_yandex_calendar__*`.

## Tools
| Шаг | Tool | autonomy |
|-----|------|----------|
| Проверить подключение | `mcp_google_calendar__google_calendar_verify` | auto |
| Создать встречу | `mcp_google_calendar__google_calendar_create_event` | draft |
| Список событий | `mcp_google_calendar__google_calendar_list_events` | auto |
| Изменить встречу | `mcp_google_calendar__google_calendar_update_event` | draft |
| Отменить встречу | `mcp_google_calendar__google_calendar_cancel_event` | approve |
| Проверить занятость | `mcp_google_calendar__google_calendar_check_availability` | auto |

Если Ouroboros сократит длинное имя — используй имя из live discovery.

## Правила
- `attendees` — opaque id (`usr_*`), не email.
- create: `client_token` для идемпотентности.
- update: `uid` + `href` + `etag` из list/create; `patch.attendees` = полный список.
- Почта — отдельно (`gmail-mcp`).
