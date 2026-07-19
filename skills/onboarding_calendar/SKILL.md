---
name: onboarding_calendar
description: Готовит согласуемый план онбординг-встреч (командные/HR/1:1), создаёт события или обновляет attendees существующих через calendar MCP с opaque IDs.
version: 0.3.1
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 4 «Встречи» для нового сотрудника.
---

# Этап 4 — встречи

## Границы

Работай только над встречами текущего онбординга. Не раскрывай состав чужих календарей и детали событий сверх необходимого.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `manager_id`, `hr_id`, опциональный `buddy_id`, `role`, `team`, `start_date` в `YYYY-MM-DD`, доверенный `timezone`, `manager_feedback`, `operation_records`.

Если `start_date`, доверенный opaque `hr_id` или доверенный `timezone` отсутствует, верни оркестратору один вопрос со списком недостающих полей и статус `NEEDS_DATA`. Не проси email.

## Идемпотентность

Алгоритм ниже самодостаточен для этого skill pack; не требуй внешних файлов правил. Считай ключи отдельно для каждого события/операции.

1. Action marker: `m_` + первые 16 hex-символов lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами и без payload:

Для **нового** события:

```json
{
  "action": "calendar-create:<stable_event_slot>",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 4,
  "target_ids": ["<sorted opaque attendee ids>"]
}
```

Для **обновления attendees** существующего:

```json
{
  "action": "calendar-update-attendees:<stable_event_slot>",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 4,
  "target_ids": ["<sorted opaque attendee ids>"]
}
```

Включи marker в `title` **нового** события до вычисления payload hash. `stable_event_slot` — например `team-kickoff`, `hr-intro`, `1on1-manager`, `1on1-buddy`.

2. `payload_sha256` = lowercase SHA-256 canonical UTF-8 полного утвержденного payload:
   - create: `title`, `start`, `duration_minutes` или `end`, `timezone`, `attendees`, `description`;
   - update: `uid`, `href`, `etag`, `patch.attendees` (полный список).

3. Operation key: `op_` + lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами (`action`, `approved_version`, `onboarding_id`, `payload_sha256`, `stage`, `target_ids`).

Строки не обрезай и не нормализуй кроме UTF-8; `target_ids` сортируй. Для create: `client_token` = первые 32 hex-символа operation key после префикса `op_`.

## Preflight интеграций

1. Проверь наличие и schemas calendar tools:
   - `mcp_google_calendar__google_calendar_verify`;
   - `mcp_google_calendar__google_calendar_list_events`;
   - `mcp_google_calendar__google_calendar_check_availability` (или сокращённое имя из live discovery);
   - `mcp_google_calendar__google_calendar_create_event`;
   - `mcp_google_calendar__google_calendar_update_event` (нужен, если план содержит join existing).
2. Проверь, что доступен хотя бы один источник правил:
   - Confluence: `mcp_confluence__confluence_verify`, `mcp_confluence__confluence_search`, `mcp_confluence__confluence_get_page`;
   - Wiki fallback: `mcp_wiki__wiki_list_pages` и `mcp_wiki__wiki_get_page`.
3. Вызови read-only `mcp_google_calendar__google_calendar_verify()` и `mcp_confluence__confluence_verify()` либо `mcp_wiki__wiki_list_pages()` для выбранного источника.
4. Если calendar capability недоступна, schema несовместима или ни один источник правил не отвечает валидно — `BLOCKED` с точной причиной.

## Подготовка

1. Получи правила встреч через Confluence search/get; Wiki fallback: `wiki_get_page` (демо: страница команды, напр. `team-payments`).
2. Определи период `range_start`/`range_end` из `start_date` и правил, не более 92 дней для availability.
3. `list_events` + `check_availability` (tool: `google_calendar_check_availability` или имя из discovery) для периода.
4. Сформируй план слотов:
   - онбординг-слоты (team-kickoff / intro, HR, 1:1 manager, 1:1 buddy при наличии);
   - при явном требовании правил — **добавление** `employee_id` в существующую командную встречу через update attendees (не разворачивай все recurring-инстансы на месяцы без явного правила).
5. Для каждой операции укажи тип (`create` | `update_attendees`), название/uid, дату-время, timezone, opaque attendees.
6. Не утверждай доступность календарей, которые tool не проверял.
7. При ошибке/malformed list/availability — `BLOCKED`. Периоды с warning о нераскрытой recurrence считай неизвестными.

## Create vs update

- **По умолчанию** создавай новые онбординг-события через `create_event` с opaque `attendees`.
- **Update attendees** (`update_event` + `patch.attendees` = полный список) — только если это явно в утвержденном плане и известны `uid`/`href`/`etag` из `list_events`.
- `patch.attendees: []` очищает участников — не используй без явного решения руководителя.
- Не отменяй чужую командную встречу без отдельного решения.

## Согласование и исполнение

HITL только у оркестратора. Полная версия перечисляет каждое create/update.
Один draft-вызов, один execute после OK — все утверждённые write в том же запуске.

- `approved_version` пуст/≠ `draft_version` → план встреч, `AWAITING_APPROVAL`, без write. Правки → `draft_version++`.
- `execute_authorized=false` при совпадении версий → `AWAITING_APPROVAL`.
- `execute_authorized=true` и версии совпали: выполни все утверждённые create/update. Уже `CONFIRMED` keys — не повторяй.
  - **create:** `google_calendar_create_event(title=<с action marker>, start, duration_minutes, timezone, attendees, description + " onboarding:<employee_id>", client_token)`;
  - **update:** `google_calendar_update_event(uid, href, etag, patch={attendees:[...]})`.
- Не передавай одновременно `duration_minutes` и `end`.
- Успех: `uid`/`href`/`etag`, `invite_status` ∈ `scheduled|scheduled_with_warnings`, opaque `attendees[]` = план.
- `shared_mailbox_collapsed` (и один email в Google UI) не BLOCK, если roster полный. Не устраивай серии update «на всякий случай»; не ставь `attendee_propagation_unconfirmed` при совпадении roster с планом.
- Timeout-reconcile: `list_events` по marker/uid; при неоднозначности не повторяй write.

## Выход

```text
Этап: 4 — Встречи
Статус:
Версия:
Источники:
Полный черновик:
Планируемые внешние действия:
Требуется подтверждение:
Результаты:
Блокер:
Следующий шаг:
```
