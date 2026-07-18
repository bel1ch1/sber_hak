# Capability map онбординга

Статус: проверено по live discovery 2026-07-18. Полные имена зависят от сохраненных `server_id` в Ouroboros Settings.

## Обязательный preflight task

Перед первым этапом проверь наличие перечисленных tools в capability envelope. MCP недоступны в ephemeral-turn.

Не вызывай `*_verify` автоматически при каждом прогоне: это live-проверки внешних сервисов. Используй их только для диагностики или явного preflight, не для бизнес-действий.

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

- `mcp_yandex_mail__yandex_mail_send(to, subject, text, cc?, bcc?)`.

Ограничение: mail MCP отправляет plain text и не поддерживает вложения.

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

- `mcp_yandex_calendar__yandex_calendar_check_ava_a60a71(range_start, range_end, timezone?)`.

Сырой tool name сервера — `yandex_calendar_check_availability`, но Ouroboros публикует сокращенное provider-safe имя с hash-суффиксом. Используй имя из live discovery.

Capability `{calendar_list}`:

- `mcp_yandex_calendar__yandex_calendar_list_events(range_start, range_end, timezone?)`.

Capability `{calendar_create_by_id}`:

- `mcp_yandex_calendar__yandex_calendar_create_event(title, start, duration_minutes|end, timezone?, attendees?, description?, location?, reminder_minutes?, client_token?)`.

`attendees` принимает opaque ID при включенной `CALENDAR_OBFUSCATION`. Update не меняет attendees; для изменения состава нужна отмена и новое событие после отдельного подтверждения.

## Этап 5 — курсы

Capability `{course_recommend}`:

- `mcp_stepik__stepik_get_courses_by_role(role, include_soft_skills?)`;
- либо `mcp_stepik__stepik_suggest_onboarding(role, include_soft_skills?)`;
- нормализация роли: `mcp_stepik__stepik_match_role(role)`;
- диагностика каталога: `mcp_stepik__stepik_list_roles()`.

Capability `{course_enroll_by_id}` отсутствует. Не утверждай, что сотрудник записан на курс. В MVP утвержденный список отправляется сотруднику письмом.

## Этап 6 — испытательный срок

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

Отправка плана — `{mail_send_by_id}`. Ограничение: файл нельзя приложить через текущий mail MCP; допустима отправка plain-text плана и создание отдельного локального артефакта.

## Отсутствующая capability

При отсутствии обязательного tool:

1. Не подменяй его похожим инструментом.
2. Не заявляй о выполнении.
3. Верни этапу `BLOCKED`.
4. Укажи точное имя отсутствующей capability и безопасный ручной следующий шаг.
