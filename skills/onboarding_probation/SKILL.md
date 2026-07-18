---
name: onboarding_probation
description: Получает dry-run плана испытательного срока из Jira, согласует его с руководителем, создаёт задачи для employee_id и отправляет утверждённый план руководителю.
version: 0.1.0
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 6 «План испытательного срока» для нового сотрудника.
---

# Этап 6 — план испытательного срока

## Границы

Работай только над Jira-планом, итоговым артефактом и письмом руководителю. Задачи бери из Jira template/preview, не придумывай KPI, сроки и содержание.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `manager_id`, `role`, `team`, `start_date`, `project_key`, `manager_feedback`, `operation_ids`.

Если `start_date` или `project_key` отсутствует, верни один конкретный вопрос руководителю до вызова Jira.

## Preflight интеграций

До preview:

1. Проверь, что capability envelope содержит:
   - `mcp_jira__jira_get_project`;
   - `mcp_jira__jira_create_onboarding_plan`;
   - `mcp_yandex_mail__yandex_mail_verify`;
   - `mcp_yandex_mail__yandex_mail_send`.
2. Проверь текущую schema `jira_create_onboarding_plan`: обязательны или поддерживаются `project_key`, `hire_id`, `role`, `start_date`, `team`, `assignee_id`, `dry_run`.
3. Вызови read-only `mcp_jira__jira_get_project(project_key)` для проверки проекта и Jira auth.
4. Вызови read-only `mcp_yandex_mail__yandex_mail_verify()` для проверки почтового соединения.
5. Если tool отсутствует, schema несовместима или проверка вернула ошибку, не начинай preview и верни `BLOCKED` с точной отсутствующей capability.

## Preview

Вызови:

```text
mcp_jira__jira_create_onboarding_plan(
  project_key=<project_key>,
  hire_id=<employee_id>,
  role=<role>,
  start_date=<start_date>,
  team=<team>,
  assignee_id=<employee_id>,
  dry_run=true
)
```

Покажи:

- структуру плана;
- задачи и сроки;
- ожидаемые результаты из preview;
- будущий Epic/issues;
- письмо руководителю;
- создание Jira-плана и отправку письма как единый список действий.

## Правки

Применяй только правки, которые поддерживает фактический Jira contract.

Если руководитель меняет состав задач, а `jira_create_onboarding_plan` не принимает измененный task list, не подтверждай, что dry-run=false создаст показанную версию. Верни `BLOCKED` и укажи несовпадение контракта. Не заменяй это несвязанными `jira_create_issue` без явного нового плана.

## Итоговый артефакт

Сформируй Markdown:

```text
# План испытательного срока — <employee_id>

Роль: <role>
Команда: <team>
Дата выхода: <start_date>
Проект Jira: <project_key>

## Цели и ожидаемые результаты
<только из утвержденного preview>

## Задачи и контрольные точки
<только из утвержденного preview>
```

Сохрани локальную копию только в разрешенном artifact root текущей задачи. Используй файловый tool с `root="task_drive"` и относительным путем `onboarding/<onboarding_id>/probation-plan.md`. Если `task_drive` недоступен, запроси у оркестратора разрешенный artifact root; не используй абсолютный путь.

## Согласование и исполнение

- Пока `approved_version != draft_version`, не создавай Jira issues и не отправляй письмо.
- После правок увеличь версию и покажи весь план снова.
- При совпадении версий сначала проверь label `onboarding:<employee_id>` и operation key.
- Создай план тем же вызовом с `dry_run=false` и `assignee_id=<employee_id>`.
- Проверь, что ответ подтверждает Epic/issues и назначение; не делай вывод только из запроса.
- После успешного Jira-вызова отправь план plain text через `mcp_yandex_mail__yandex_mail_send(to=[manager_id])`.
- Текущий mail MCP не поддерживает вложения: не утверждай, что Markdown-файл приложен. Укажи относительный путь и artifact root локального артефакта, а также факт отправки текста.
- При успехе Jira и ошибке почты сохрани частичный результат и не повторяй Jira.

## Выход

```text
Этап: 6 — План испытательного срока
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
