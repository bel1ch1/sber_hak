---
name: onboarding_probation
description: Собирает цели на испытательный срок по корпоративной Excel-форме, показывает таблицу руководителю, создаёт задачи в Jira и отправляет утверждённый план письмом с вложением .xlsx.
version: 0.3.1
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 6 «План испытательного срока» для нового сотрудника.
---

# Этап 6 — план испытательного срока

## Границы

Работай только над: (1) Excel-формой целей ИС, (2) Jira Epic+задачами из тех же целей, (3) письмом руководителю с вложением. Не придумывай KPI, веса и формулировки — бери из preview MCP.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `manager_id`, `role`, `team`, `start_date`, `project_key`, `manager_feedback`, `operation_records`, `execute_authorized`.

Если `start_date` или `project_key` отсутствует, верни оркестратору один конкретный вопрос со списком недостающих полей до вызова Jira/Excel.

## Источники шаблона

- Каноническая HR-форма: корпоративный файл «Задачи на ИС (обновление).xlsx» (лист «Цели») — в MCP как `templates/probation_goals.xlsx`.
- Справочный пример наполнения: «План на ИС (шаблон).xlsx» — не заполнять как выход; использовать только если явно нужно сверить структуру (роль/команда).
- Содержание целей по роли: `mcp/jira-mcp/templates/<role>.yaml` (fallback `backend.yaml`), поля `goals[]` с `summary`, `expected_result`, `due_offset_days`, `weight` (сумма ≈ 1.0, максимум 10 целей).

В чат руководителю выводи **таблицу или текст** из `preview` (без base64). Excel — артефакт и вложение письма.

## Идемпотентность

Алгоритм ниже самодостаточен для этого skill pack; не требуй внешних файлов правил. Считай отдельные ключи для Jira-create и mail-send.

1. Action marker для письма: `m_` + первые 16 hex-символов lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами и без payload:

```json
{
  "action": "probation-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 6,
  "target_ids": ["<manager_id>"]
}
```

Включи marker в тему письма до вычисления mail payload hash.

2. Для Jira: `payload_sha256_jira` = lowercase SHA-256 canonical UTF-8 утвержденного create-payload (`project_key`, `hire_id`, `role`, `start_date`, `team`, `assignee_id`, `dry_run=false`). Operation key Jira: `op_` + lowercase SHA-256 от:

```json
{
  "action": "probation-jira-create",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "payload_sha256": "<payload_sha256_jira>",
  "stage": 6,
  "target_ids": ["<employee_id>"]
}
```

3. Для mail: `payload_sha256_mail` = lowercase SHA-256 canonical UTF-8 утвержденных `subject`, `text` и `attachments[].filename` (без пересчёта base64 в hash текста — base64 должен совпадать с утверждённым файлом той же версии). Operation key mail: `op_` + lowercase SHA-256 от:

```json
{
  "action": "probation-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "payload_sha256": "<payload_sha256_mail>",
  "stage": 6,
  "target_ids": ["<manager_id>"]
}
```

Строки не обрезай и не нормализуй кроме UTF-8; `target_ids` сортируй.

## Preflight интеграций

До preview:

1. Проверь, что capability envelope содержит:
   - `mcp_jira__jira_get_project`;
   - `mcp_jira__jira_search`;
   - `mcp_jira__jira_build_probation_goals_xlsx`;
   - `mcp_jira__jira_create_onboarding_plan`;
   - `mcp_gmail__gmail_verify`;
   - `mcp_gmail__gmail_list_folders`;
   - `mcp_gmail__gmail_list_messages`;
   - `mcp_gmail__gmail_get_message`;
   - `mcp_gmail__gmail_send` (с поддержкой `attachments`).
2. Проверь schemas: для Excel — `hire_id`, `role`, `start_date`, `team`, `manager_id`, `include_base64`; для Jira-плана — `project_key`, `hire_id`, `role`, `start_date`, `team`, `assignee_id`, `dry_run`; для send — `to`, `subject`, `text`, `attachments[{filename,content_base64,content_type?}]`.
3. Вызови read-only `mcp_jira__jira_get_project(project_key)`.
4. Вызови read-only `mcp_gmail__gmail_verify()`.
5. Если tool отсутствует, schema несовместима (нет `attachments` у send) или проверка вернула ошибку — `BLOCKED` с точной причиной. Не отправляй план без возможности вложить Excel.

## Preview

1. Собери Excel-цели **только** через MCP (не собирай xlsx вручную / openpyxl / «local generated»):

```text
mcp_jira__jira_build_probation_goals_xlsx(
  hire_id=<employee_id>,
  role=<role>,
  start_date=<start_date>,
  team=<team>,
  manager_id=<manager_id>,
  include_base64=true
)
```

Критерии валидного файла: ответ `ok=true`, непустой `content_base64`, `filename` вида `Цели_ИС_*.xlsx`, `size_bytes` ≥ 8000.
Если size меньше или base64 пуст — `BLOCKED`, не подставляй самодельный workbook.

2. Собери Jira-preview тех же целей **только** через:

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

Запрещено для плана ИС: `jira_create_issue` / bulk самодельных issues вместо `jira_create_onboarding_plan`.
В preview проверь блок `assignee` без `warning`. Если warning — `BLOCKED` (нужен `jira_account_id` в MCP accounts.csv).

3. В «Полный черновик» для оркестратора (и далее в чат руководителю) покажи **только**:
   - метаданные: роль, команда, даты ИС, контрольные точки 6/12 недели;
   - таблицу целей: Задача | Ожидаемый результат | Срок | Вес;
   - итог весов и примечание про порог ≥90%;
   - будущий Epic и список Jira-задач + opaque `assignee_id`;
   - имя файла Excel из MCP и факт, что письмо уйдёт с вложением;
   - единый список внешних действий (Jira create + mail send с xlsx).

Не вставляй `content_base64` в черновик чата. Сохрани workbook через файловый tool: `root="task_drive"`, путь `onboarding/<onboarding_id>/<filename из MCP>` (декодируй base64 как есть). Дублируй коротким именем `onboarding/<onboarding_id>/Цели_ИС.xlsx` тем же содержимым. Если `task_drive` недоступен — запроси artifact root.

Если `preview.weight_ok` = false — отметь предупреждение руководителю, но не блокируй preview.

## Правки

Применяй только правки, которые поддерживает контракт tools. Смена состава целей без параметра custom task list в MCP → `BLOCKED` (не симулируй правленое Excel вручную и не подменяй набором `jira_create_issue`).

## Итоговый артефакт (Markdown + Excel)

Markdown:

```text
# План испытательного срока — <employee_id>

Роль: <role>
Команда: <team>
Дата выхода: <start_date>
Дата окончания ИС: <end_date>
Проект Jira: <project_key>
Файл: <filename>

## Цели
| Задача | Ожидаемый результат | Срок | Вес |
| ... из утвержденного preview ... |

## Контрольные точки
...

## Jira
Epic + задачи из утвержденного preview
```

Путь MD: `onboarding/<onboarding_id>/probation-plan.md` (`root="task_drive"`).

## Согласование и исполнение

HITL только у оркестратора. Один draft-вызов, один execute после OK.

- Без совпадения версий / без `execute_authorized` → таблица целей + dry_run Jira preview, `AWAITING_APPROVAL`, без create/send.
- При `execute_authorized=true` и совпадении версий — в одном запуске:
  1. `jira_search` по `onboarding:<employee_id>` (идемпотентность).
  2. `jira_create_onboarding_plan(..., dry_run=false, assignee_id=<employee_id>)` если плана ещё нет.
     Assignee резолвится MCP через `accounts.csv` (`jira_account_id`).
  3. Успех Jira: `created=true` + Epic/issues + `assignee` без warning **или** `already_exists` с непустым `existing`. Не требуй search `assignee_id == hire_id`.
  4. Excel той же версии (сохранённый base64 или повторный `jira_build_probation_goals_xlsx`).
  5. `gmail_send(to=[manager_id], subject с marker, text=таблица, attachments=[xlsx])`.
- Уже `CONFIRMED` keys — не повторяй. План ИС создавай только через `jira_create_onboarding_plan` (не серией `jira_create_issue`).
- Успех mail: `messageId` + непустой `accepted` + пустой `rejected` (`manager_id` или `self`/shared-mailbox alias); желательно xlsx в `attachment_names`.
- Jira ok + mail fail → частичный `BLOCKED`, Jira не повторяй. Sent-reconcile только timeout.

## Повторный тест / очистка Jira

Для повторной записи плана после демо вызови (вне обычного happy path, по запросу оркестратора/руководителя):

```text
mcp_jira__jira_rollback_plan(project_key=<project_key>, hire_id=<employee_id>)
```

Удаляет все issues с label `onboarding:<employee_id>`. Письма и календарь rollback не откатывает.

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
