# Уроки неоднозначностей онбординг-прогонов

Краткие запреты после e2e. Оркестратор и этапные skills обязаны учитывать.

## Зацикливание / zombie task

- Симптом: UI крутит «размышления», `task_results/<id>.json` → `status=running` >10 мин без tool-логов.
- Не чини сам через panic-циклы. Сообщи руководителю; после рестарта продолжай с `state.json`, не ретрай EXECUTED.
- Не уходи в Sent-аудит / privacy-расследование после успешного `gmail_send` (`messageId`+`accepted`).

## Почта

- Только `mcp_gmail__*`. Yandex mail отключён.
- Этап 1: `to=[manager_id]` (не `hr_id`). **Без `attachments`** — только `subject`+`text`; не прикладывай `access_draft.md`/HTML.
- Этап 6: `to=[manager_id]` + MCP xlsx attachment (единственный этап с вложением).
- Opaque id в subject/body на send раскрываются; на get_message маскируются обратно — это штатно.
- Demo shared mailbox: `accepted=["self"]` / SENT `to=["self"]` **не** значит «письмо не дошло до usr_hr/buddy/…». Успех = `messageId` + непустой `accepted`. Не открывай Sent после успешного send.

## Календарь

- Только `mcp_google_calendar__*`.
- Source of truth — opaque `attendees[]` в ответе MCP, не UI Google.

## Jira / Excel (этап 6)

- Excel: **только** `jira_build_probation_goals_xlsx`. Самодельный workbook (~3KB) = повреждённый/невалидный → BLOCKED.
- Сохраняй `content_base64` в `task_drive` как `Цели_ИС.xlsx` / filename из MCP.
- Jira-план: **только** `jira_create_onboarding_plan(assignee_id=<employee_id>)`.
- Запрет: серия `jira_create_issue` «вместо плана» (часто без assignee).
- Assignee резолвится в MCP по `accounts.csv` (`jira_account_id` обязателен для Cloud). Не передавай email.

## Проектные scope

- Ouroboros project scope (`onb`) ≠ Jira `project_key` (`SCRUM`).
- Не вызывай `ensure_project_scope` на `onboarding-<hire>` если task уже в `onb`.

## HITL

- Остановки: запуск + черновики 1/2/4/5/6. Welcome — auto.
- Старт ≠ OK на доступы; после запуска покажи черновик доступов и жди отдельный OK.
- Для чистой записи — новый hire/task.
- «ок» = один execute текущего draft; сразу следующий draft, без «продолжать?».
- Один authorized write-вызов на этап (без PREPARED→PENDING цепочки).
