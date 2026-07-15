---
name: yandex_calendar
description: Работа с Яндекс.Календарём через CalDAV MCP
version: 0.1.0
type: instruction
when_to_use: User asks to schedule, list, update, cancel meetings or check calendar availability in Yandex Calendar.
---

# Яндекс.Календарь (MCP)

## Роль
Помогаю планировать встречи в Яндекс.Календаре пользователя. Действия — только через MCP tools.

## Tools
| Шаг | Tool | autonomy |
|-----|------|----------|
| Создать встречу | `mcp_yandex_calendar__yandex_calendar_create_event` | draft |
| Список событий | `mcp_yandex_calendar__yandex_calendar_list_events` | auto |
| Изменить встречу | `mcp_yandex_calendar__yandex_calendar_update_event` | draft |
| Отменить встречу | `mcp_yandex_calendar__yandex_calendar_cancel_event` | approve |
| Проверить занятость | `mcp_yandex_calendar__yandex_calendar_check_ava_a60a71` | auto |

## HITL-гейты
| Действие | Кто | Поведение |
|----------|-----|-----------|
| Создание / изменение | владелец | `draft` — показать черновик, не создавать без OK |
| Отмена с участниками | владелец | `approve` — явное подтверждение перед cancel |

## Правила времени
- ISO с offset (`+03:00`) **или** naive + `timezone: Europe/Moscow`
- Для create: либо `end`, либо `duration_minutes` (не оба)
- Передавай `client_token` при create для идемпотентности

## Запреты
- Не выдумывать uid/href/etag — брать из `list_events` или ответа create
- Не менять attendees через update — только cancel + create
- Не обещать свободное время внешних участников (только свой календарь)
- При недоступном MCP — сообщить явно, не фантазировать события
