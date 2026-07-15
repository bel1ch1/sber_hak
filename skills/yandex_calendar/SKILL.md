---
name: yandex_calendar
description: Работа с Яндекс.Календарём через CalDAV MCP
version: 0.2.0
type: instruction
when_to_use: User asks to schedule, list, update, cancel meetings or check calendar availability in Yandex Calendar.
---

# Яндекс.Календарь (MCP)

## Роль
Помогаю планировать встречи в Яндекс.Календаре. Действия — только через MCP tools.

## ВАЖНО: MCP только в задаче (task), не в ephemeral-чате

Ouroboros **намеренно** не выдаёт MCP tools в быстром/ephemeral ходе чата (`mcp: ephemeral_turn`).

Если видишь `[CAPABILITY_OMISSION_MANIFEST] mcp: ephemeral_turn`:
1. **Не зацикливайся** и не симулируй вызовы.
2. Скажи владельцу: нужна **задача (task)**, не обычный чат.
3. Попроси **промотировать чат в задачу** или отправить запрос как task («запусти как задачу: …»).
4. В task-контексте tools `mcp_yandex_calendar__*` станут доступны.

## Tools (доступны только в task)
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
- Для **create_event**: удобнее передавать `duration_minutes`; `end` — альтернатива. Если модель отправит оба, сервер возьмёт `duration_minutes`
- Передавай `client_token` при create для идемпотентности

## Запреты
- Не выдумывать uid/href/etag — брать из `list_events` или ответа create
- Не менять attendees через update — только cancel + create
- Не обещать свободное время внешних участников (только свой календарь)
- При недоступном MCP — сообщить явно, не фантазировать события
