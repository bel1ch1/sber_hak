---
name: onboarding_probation
description: Собирает цели на испытательный срок по корпоративной Excel-форме, показывает таблицу руководителю, создаёт задачи в Jira и отправляет утверждённый план письмом с вложением .xlsx.
version: 0.2.1
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

1. Собери Excel-цели:

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

2. Собери Jira-preview тех же целей:

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

3. В «Полный черновик» для оркестратора (и далее в чат руководителю) покажи **только**:
   - метаданные: роль, команда, даты ИС, контрольные точки 6/12 недели;
   - таблицу целей: Задача | Ожидаемый результат | Срок | Вес;
   - итог весов и примечание про порог ≥90%;
   - будущий Epic и список Jira-задач;
   - имя файла Excel и факт, что письмо уйдёт с вложением;
   - единый список внешних действий (Jira create + mail send с xlsx).

Не вставляй `content_base64` в черновик чата. Сохрани workbook через файловый tool: `root="task_drive"`, путь `onboarding/<onboarding_id>/Цели_ИС.xlsx` (декодируй base64). Если `task_drive` недоступен — запроси artifact root.

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

- Пока `approved_version != draft_version`, не создавай Jira issues и не отправляй письмо.
- После правок увеличь версию и покажи весь план снова (таблица + действия).
- При совпадении версий сначала `mcp_jira__jira_search(jql="project = <project_key> AND labels = \"onboarding:<employee_id>\"")`.
- Сформируй Jira operation key → `PREPARED` без write.
- Только при `execute_authorized=true` и PENDING с совпадающими key/hash/version: `jira_create_onboarding_plan(..., dry_run=false, assignee_id=<employee_id>)`.
- Полный успех Jira — Epic + ожидаемые issue IDs. При `already_exists` сверь через search; assignee через search не подтверждается.
- После Jira: пересобери Excel той же версии (`jira_build_probation_goals_xlsx`) либо используй сохранённый base64 утверждённой версии; тема с action marker; тело — plain-text таблица целей (без base64).
- Mail `PREPARED`, затем при authorize:

```text
mcp_gmail__gmail_send(
  to=[manager_id],
  subject=<тема с action marker>,
  text=<plain-text план>,
  attachments=[{
    "filename": "<filename из preview>",
    "content_base64": "<из jira_build_probation_goals_xlsx>",
    "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }]
)
```

- Успех письма: непустой `message_id`, `accepted` содержит `manager_id`, `rejected` пуст; желательно `attachment_names` содержит имя xlsx. При timeout — reconciliation через Sent + action marker; при неоднозначности не повторяй send.
- При успехе Jira и ошибке почты — частичный результат, `BLOCKED`, Jira не повторяй.

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
