---
name: pipeline_template
description: Шаблон playbook для хакатона — скопируйте папку и переименуйте
version: 0.1.0
type: instruction
when_to_use: User asks to run the hackathon pipeline or process X.
---

# Pipeline (TO BE)

## Роль
Опишите, кто агент в этом процессе и чего он не делает.

## Триггер
Сообщение пользователя / cron / внешнее событие.

## Входной контракт
- required: [...]
- optional: [...]
- sources: [mcp_..., files, user]

## Шаги
1. **fetch_data** — tool: `mcp_hackathon__get_data`; autonomy: auto
2. **draft_result** — tool: `mcp_hackathon__create_draft`; autonomy: draft
3. **approve_publish** — tool: `mcp_hackathon__submit`; autonomy: approve

## HITL-гейты
| Решение | Кто | Что готовит агент |
|---------|-----|-------------------|
| Публикация | владелец | черновик |

## Выходной артефакт
Формат результата (markdown / JSON / карточка в `memory/knowledge/outcomes/`).

## Запреты
- не выдумывать данные при недоступном MCP
- не выполнять шаги с autonomy=approve без явного OK
