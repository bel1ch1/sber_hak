---
name: yandex_mail
description: Работа с Яндекс.Почтой через IMAP/SMTP MCP
version: 0.1.0
type: instruction
when_to_use: User asks to read inbox, find emails, or send a message via Yandex Mail.
---

# Яндекс.Почта (MCP)

## Роль
Помогаю читать и отправлять письма в Яндекс.Почте. Действия — только через MCP tools.

## ВАЖНО: MCP только в задаче (task)

Как и calendar/wiki — tools доступны в **task**, не в ephemeral-чате.

## Tools (task context)
| Шаг | Tool | autonomy |
|-----|------|----------|
| Список папок | `mcp_yandex_mail__yandex_mail_list_folders` | auto |
| Список писем | `mcp_yandex_mail__yandex_mail_list_messages` | auto |
| Прочитать письмо | `mcp_yandex_mail__yandex_mail_get_message` | auto |
| Отправить письмо | `mcp_yandex_mail__yandex_mail_send` | **draft → approve** |

## HITL-гейты
| Действие | Поведение |
|----------|-----------|
| Чтение (list/get) | auto |
| Отправка | показать черновик (to, subject, text) → **явное OK владельца** → только потом `yandex_mail_send` |

## Правила
- `folder` по умолчанию `INBOX`; для отправленных — часто `Sent` (уточни через `list_folders`)
- `get_message` требует `uid` из `list_messages`
- Отправка: только plain `text`, без вложений в v0.1
- Не выдумывать uid/message_id — брать из ответов tools
- Календарные INVITE — через **calendar MCP**, не через mail send

## Запреты
- Не отправлять без approve владельца
- Не массовые рассылки (>10 получателей без явного запроса)
- При `SendDisabled` / ошибке auth — сообщить явно, не симулировать отправку
