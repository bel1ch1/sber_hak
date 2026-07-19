# Capability map онбординга

Статус: 2026-07-19. Почта и календарь — **только Google** (`gmail`, `google_calendar`). Yandex mail/calendar MCP отключены.

Полные имена tools зависят от `server_id` в Ouroboros Settings (`gmail`, `google_calendar`).

## Обязательный preflight task

Перед первым этапом проверь наличие перечисленных tools в capability envelope. MCP недоступны в ephemeral-turn.

Не вызывай `*_verify` автоматически при каждом прогоне: это live-проверки внешних сервисов. Используй их только для диагностики или явного preflight, не для бизнес-действий.

**Не используй** `mcp_yandex_mail__*` и `mcp_yandex_calendar__*`, даже если они видны в envelope.

## Источники знаний

Основной production-вариант:

- `mcp_confluence__confluence_search(query, space_key?)`
- `mcp_confluence__confluence_get_page(page_id)`
- диагностика: `mcp_confluence__confluence_verify(space_key?)`

Demo fallback:

- `mcp_wiki__wiki_search(query, limit=5)`
- `mcp_wiki__wiki_get_page(slug)`
- `mcp_wiki__wiki_list_pages()`

Для одного артефакта выбери один источник. При конфликте не объединяй тексты, а остановись и сообщи руководителю.

## Этап 1 — доступы

Capability `{access_policy_read}`:

- Confluence search/get;
- fallback: `mcp_wiki__wiki_get_page(slug="access-policy")`.

Отдельного access-draft MCP нет. Черновик формирует `onboarding_access` только из утвержденной политики.

Capability `{mail_send_by_id}`:

- `mcp_gmail__gmail_send(to, subject, text, cc?, bcc?, attachments?)`.

Capability `{mail_reconcile}`:

- `mcp_gmail__gmail_list_folders()`;
- `mcp_gmail__gmail_list_messages(folder?, limit?, since?, unseen_only?)`;
- `mcp_gmail__gmail_get_message(folder?, uid)`.

Диагностика: `mcp_gmail__gmail_verify()`.

Для reconciliation выбери Sent label из `list_folders` (`SENT`), ограничь поиск `since` временем попытки, сопоставь action marker и адресата; при необходимости сравни тело через `get_message`. `uid` — Gmail message id (строка). Отсутствие письма не разрешает автоматический повтор после неоднозначного send.

Тело письма — plain text. Опционально `attachments` (до 3 файлов `{filename, content_base64, content_type?}`, ~5 MiB, xlsx/xls/pdf/md/txt/png/jpg/jpeg/csv). Для этапа ИС вложение .xlsx обязательно, если schema send содержит `attachments`.

## Этап 2 — бадди

Capability `{buddy_rank}`:

- `mcp_buddy__buddy_match(role, team, employee_id, limit=3)`.

Capability `{buddy_profile}`:

- `mcp_buddy__buddy_get_profile(buddy_id)`.

Диагностика:

- `mcp_buddy__buddy_verify()`.

Уведомление — `{mail_send_by_id}`.

## Этап 3 — приветствие

Capability `{company_knowledge}` — Confluence либо Wiki fallback.

Отдельного welcome-draft MCP нет. `onboarding_welcome` использует фиксированную структуру и только проверенные сведения источника.

Отправка — `{mail_send_by_id}`.

## Этап 4 — встречи

Capability `{calendar_availability}`:

- `mcp_google_calendar__google_calendar_check_availability(range_start, range_end, timezone?)`;
- если Ouroboros сократил имя — бери точное из live discovery.

Capability `{calendar_list}`:

- `mcp_google_calendar__google_calendar_list_events(range_start, range_end, timezone?)`.

Capability `{calendar_create_by_id}`:

- `mcp_google_calendar__google_calendar_create_event(title, start, duration_minutes|end, timezone?, attendees?, description?, location?, reminder_minutes?, client_token?)`.

Capability `{calendar_update_attendees}`:

- `mcp_google_calendar__google_calendar_update_event(uid, href, etag, patch)` с `patch.attendees` = полная замена opaque ID.

Диагностика: `mcp_google_calendar__google_calendar_verify()`.

`attendees` — opaque ID при `CALENDAR_OBFUSCATION=true`.

## Этап 5 — курсы

Capability `{course_recommend}`:

- `mcp_stepik__stepik_get_courses_by_role(role, include_soft_skills?)`;
- либо `mcp_stepik__stepik_suggest_onboarding(role, include_soft_skills?)`;
- нормализация роли: `mcp_stepik__stepik_match_role(role)`;
- диагностика каталога: `mcp_stepik__stepik_list_roles()`.

Capability `{course_enroll_by_id}`:

- `mcp_stepik__stepik_enroll` — локальный mock (`enrollments.json`), не Stepik.org API;
- после approve фиксируй `enrollment_id`, затем письмо сотруднику;
- не утверждай регистрацию на stepik.org.

## Этап 6 — испытательный срок

Capability `{probation_goals_xlsx}`:

- `mcp_jira__jira_build_probation_goals_xlsx(hire_id, role, start_date, team, manager_id, include_base64=true)`;
- источник формы: корпоративный шаблон «Задачи на ИС (обновление).xlsx» (`templates/probation_goals.xlsx`);
- содержание целей: `templates/<role>.yaml` → `goals[]` (SMART, вес, срок);
- в чат — только `preview` (таблица); `content_base64` — для артефакта и вложения.

Capability `{jira_plan_preview}`:

- `mcp_jira__jira_create_onboarding_plan(project_key, hire_id, role, start_date, team, assignee_id, dry_run=true)`.

Capability `{jira_plan_create}`:

- тот же tool с `dry_run=false`;
- `hire_id=employee_id`;
- `assignee_id=employee_id`.

Capability `{jira_plan_rollback}`:

- `mcp_jira__jira_rollback_plan(project_key, hire_id)`.

Диагностика и чтение:

- `mcp_jira__jira_verify(project_key?)`;
- `mcp_jira__jira_get_project(project_key)`;
- `mcp_jira__jira_search(jql)`.

Отправка плана — `{mail_send_by_id}` с `attachments: [{filename, content_base64, content_type}]` (до 3 файлов, ~5 MiB). Без поддержки `attachments` у send этап `BLOCKED`. Локально сохрани также `onboarding/<id>/Цели_ИС.xlsx` и `probation-plan.md`.

## Отсутствующая capability

При отсутствии обязательного tool:

1. Не подменяй его похожим инструментом (в т.ч. не подменяй Gmail на Yandex).
2. Не заявляй о выполнении.
3. Верни этапу `BLOCKED`.
4. Укажи точное имя отсутствующей capability и безопасный ручной следующий шаг.
