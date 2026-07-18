---
name: onboarding_calendar
description: Готовит согласуемый план командных, HR- и 1:1-встреч, проверяет календарь и после подтверждения создаёт события с обезличенными attendee IDs.
version: 0.1.2
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 4 «Встречи» для нового сотрудника.
---

# Этап 4 — встречи

## Границы

Работай только над встречами текущего онбординга. Не раскрывай состав чужих календарей и детали событий сверх необходимого.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `manager_id`, `hr_id`, опциональный `buddy_id`, `role`, `team`, `start_date` в `YYYY-MM-DD`, доверенный `timezone`, `manager_feedback`, `operation_records`.

Если `start_date`, доверенный opaque `hr_id` или доверенный `timezone` отсутствует, верни оркестратору один вопрос со списком недостающих полей и статус `NEEDS_DATA`. Не проси email.

## Идемпотентность

Алгоритм ниже самодостаточен для этого skill pack; не требуй внешних файлов правил. Считай ключи отдельно для каждого создаваемого события.

1. Action marker события: `m_` + первые 16 hex-символов lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами и без payload:

```json
{
  "action": "calendar-create:<stable_event_slot>",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 4,
  "target_ids": ["<sorted opaque attendee ids>"]
}
```

Включи marker в `title` нового события до вычисления payload hash. `stable_event_slot` — стабильный ярлык слота из утвержденного плана, например `team-kickoff`, `hr-intro`, `1on1-manager`, `1on1-buddy`.

2. `payload_sha256` = lowercase SHA-256 canonical UTF-8 полного утвержденного payload события: `title`, `start`, `duration_minutes` или `end`, `timezone`, `attendees`, `description`.

3. Operation key: `op_` + lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами:

```json
{
  "action": "calendar-create:<stable_event_slot>",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "payload_sha256": "<payload_sha256>",
  "stage": 4,
  "target_ids": ["<sorted opaque attendee ids>"]
}
```

Строки не обрезай и не нормализуй кроме UTF-8; `target_ids` сортируй. `client_token` = первые 32 hex-символа operation key после префикса `op_`.

## Preflight интеграций

1. Проверь наличие и schemas calendar tools:
   - `mcp_yandex_calendar__yandex_calendar_verify`;
   - `mcp_yandex_calendar__yandex_calendar_list_events`;
   - `mcp_yandex_calendar__yandex_calendar_check_ava_a60a71`;
   - `mcp_yandex_calendar__yandex_calendar_create_event`.
2. Проверь, что доступен хотя бы один источник правил:
   - Confluence: `mcp_confluence__confluence_verify`, `mcp_confluence__confluence_search`, `mcp_confluence__confluence_get_page`;
   - Wiki fallback: `mcp_wiki__wiki_list_pages` и `mcp_wiki__wiki_get_page`.
3. Вызови read-only `mcp_yandex_calendar__yandex_calendar_verify()` и `mcp_confluence__confluence_verify()` либо `mcp_wiki__wiki_list_pages()` для выбранного источника.
4. Если calendar capability недоступна, schema несовместима или ни один источник правил не отвечает валидно, не формируй непроверенный план и не создавай события; верни `BLOCKED` с точной причиной.

## Подготовка

1. Получи правила и перечень встреч через `mcp_confluence__confluence_search(query=<team и onboarding meetings>)` → `mcp_confluence__confluence_get_page(page_id=<id из search>)`; Wiki fallback: `mcp_wiki__wiki_list_pages()` → `mcp_wiki__wiki_get_page(slug=<выбранный slug правил встреч>)`.
2. Определи ограниченный период планирования `range_start`/`range_end` из `start_date` и правил, не более 92 дней для availability.
3. Прочитай события через `mcp_yandex_calendar__yandex_calendar_list_events(range_start=<range_start>, range_end=<range_end>, timezone=<timezone>)`.
4. Проверь доступность через `mcp_yandex_calendar__yandex_calendar_check_ava_a60a71(range_start=<range_start>, range_end=<range_end>, timezone=<timezone>)` (сырой tool name сервера: `yandex_calendar_check_availability`).
5. Сформируй:
   - необходимые командные встречи;
   - HR-встречу;
   - 1:1 с `manager_id`;
   - 1:1 с `buddy_id`, если он выбран и предусмотрен правилами.
6. Для каждой встречи покажи название, назначение, дату, время, длительность, timezone и opaque attendee IDs.
   В название каждого нового события добавь уникальный `[<action_marker>]`, сформированный по разделу «Идемпотентность» этого файла.
7. Не утверждай доступность календарей, которые tool фактически не проверял.
8. Если чтение правил, списка событий или проверка доступности вернули ошибку либо malformed-ответ, верни `BLOCKED`; не подменяй результат предположениями и не переходи к созданию событий.
9. Проверь `busy_blocks` и `warnings`. Периоды с warning о нераскрытой recurrence или иной неполноте считай неизвестными и не планируй в них встречу без нового валидного availability-ответа.

## Ограничение существующих событий

`yandex_calendar_update_event` поддерживает полную замену `attendees` (opaque IDs). Предпочитай создавать новые онбординг-события; существующую командную встречу обновляй только если это явно в утвержденном плане. Не отменяй чужую встречу без отдельного решения руководителя. Если capability календаря недоступна — `BLOCKED`.

## Согласование и исполнение

Полная версия должна перечислять каждое создаваемое событие.

- Пока `approved_version != draft_version`, не создавай события.
- После правок увеличь версию и покажи весь список.
- Для каждого события сформируй action marker и operation key по разделу «Идемпотентность» этого файла.
- При совпадении версий сначала верни `PREPARED`, полный payload каждого события, key/hash и не создавай события. Только в следующем запуске с записью `PENDING`, совпадающими key/hash/version и `execute_authorized=true` вызови `mcp_yandex_calendar__yandex_calendar_create_event(title=<approved title with action marker>, start=<approved start>, duration_minutes=<approved duration>, timezone=<approved timezone>, attendees=<approved opaque IDs>, description=<approved description + " onboarding:<employee_id>">, client_token=<первые 32 hex-символа operation key после префикса op_>)`.
- Не передавай одновременно `duration_minutes` и `end`. Все аргументы должны точно соответствовать утвержденной версии.
- Успех создания подтвержден только при непустых `uid`, `href`, `etag` и `invite_status="scheduled"`. `warnings=["served_from_cache"]` допустим как подтвержденный идемпотентный результат. `invite_status="scheduled_with_warnings"` или иные warnings сохрани как частичный результат и верни `BLOCKED` с точным предупреждением.
- После timeout/неизвестного результата сначала вызови `list_events` для того же периода и сопоставь точные title с action marker, start и attendees. Если результат не определяется однозначно, не повторяй create даже после истечения cache `client_token`; верни `BLOCKED` для ручной проверки.
- Частичный успех отрази по каждому событию; не повторяй успешные или неоднозначные операции.

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
