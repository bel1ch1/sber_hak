---
name: onboarding_courses
description: Подбирает курсы по роли через Stepik MCP, фиксирует mock-зачисление stepik_enroll и отправляет учебный план сотруднику по opaque ID.
version: 0.3.1
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 5 «Курсы» или руководитель просит подобрать обучение для обезличенного employee_id.
---

# Этап 5 — курсы

## Границы

Работай только над подбором курсов, mock-зачислением и письмом сотруднику. `stepik_enroll` пишет локальный JSON (не Stepik.org): сохраняй `enrollment_id`, не утверждай регистрацию на stepik.org.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `role`, `team`, `additional_context`, `manager_feedback`, `operation_records`, `execute_authorized`.

## Идемпотентность

Алгоритм ниже самодостаточен для этого skill pack; не требуй внешних файлов правил. Веди **два** operation record: enroll и mail.

### Enroll

1. `payload_sha256_enroll` = lowercase SHA-256 canonical UTF-8 JSON утвержденного списка курсов (`employee_id`, `role`, `courses[{title,description,url?}]` в стабильном порядке).
2. Operation key enroll: `op_` + lowercase SHA-256 от:

```json
{
  "action": "courses-enroll",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "payload_sha256": "<payload_sha256_enroll>",
  "stage": 5,
  "target_ids": ["<employee_id>"]
}
```

### Mail

1. Action marker: `m_` + первые 16 hex-символов lowercase SHA-256 от:

```json
{
  "action": "courses-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 5,
  "target_ids": ["<employee_id>"]
}
```

Включи marker в тему письма до вычисления mail payload hash.

2. `payload_sha256_mail` = lowercase SHA-256 canonical UTF-8 `subject`, `text`, список course title/url в стабильном порядке (желательно включить `enrollment_id` после успешного enroll).
3. Operation key mail: `op_` + lowercase SHA-256 от JSON с `action=courses-mail`, `approved_version`, `onboarding_id`, `payload_sha256`, `stage`, `target_ids`.

Строки не обрезай и не нормализуй кроме UTF-8; `target_ids` сортируй.

## Preflight интеграций

1. Проверь наличие и schemas:
   - `mcp_stepik__stepik_list_roles`;
   - `mcp_stepik__stepik_match_role`;
   - `mcp_stepik__stepik_get_courses_by_role`;
   - `mcp_stepik__stepik_suggest_onboarding`;
   - `mcp_stepik__stepik_enroll`;
   - `mcp_gmail__gmail_verify`;
   - `mcp_gmail__gmail_list_folders`;
   - `mcp_gmail__gmail_list_messages`;
   - `mcp_gmail__gmail_get_message`;
   - `mcp_gmail__gmail_send`.
2. Вызови read-only `mcp_stepik__stepik_list_roles()` и `mcp_gmail__gmail_verify()`.
3. Если Stepik или mail capability недоступна — `BLOCKED` с точной причиной.

## Подбор

1. Нормализуй роль через `stepik_match_role(role=role)`.
2. `include_soft_skills=true` по умолчанию, если руководитель не исключил soft skills. Каталог: `stepik_get_courses_by_role` или `stepik_suggest_onboarding`.
3. Используй только title/description/url из ответа MCP.
4. Для каждого курса — краткое рабочее обоснование.
5. Не выбирай курс только из-за похожего названия роли.
6. При error/пустом/malformed ответе — `BLOCKED`; не выдумывай курсы.

## Письмо

```text
Тема: Учебный план онбординга [onboarding:<employee_id>] [<action_marker>]

Здравствуйте!

Для вашей роли <role> в команде <team> согласован следующий учебный план
(enrollment_id: <enrollment_id>):

1. <название курса>
   Ссылка: <проверенная ссылка>
   Цель: <краткое обоснование>

Пожалуйста, используйте указанные материалы в рамках онбординга.
```

## Согласование и исполнение

HITL только у оркестратора. Полная версия: курсы + mock-enroll + mail.
Один draft-вызов, один execute после OK.

- Без совпадения `approved_version` / без `execute_authorized` → `AWAITING_APPROVAL`, без write.
- При `execute_authorized=true` и совпадении версий — в одном запуске:
  1. `mcp_stepik__stepik_enroll(employee_id, courses=[{title, description, url?}], role)` — успех: `ok=true`, `enrollment_id`, `store="local"`.
  2. Затем `gmail_send(to=[employee_id], subject, text)`.
- Уже `CONFIRMED` keys — не повторяй соответствующие write.
- Успех mail: `messageId` + непустой `accepted` + пустой `rejected` (`employee_id` или `self`/shared-mailbox alias).
- Enroll ok + mail fail → частичный `BLOCKED`, enroll не повторяй. Sent-reconcile только timeout.
- В отчёте: mock-зачисление + письмо; не «зарегистрирован на stepik.org».

## Выход

```text
Этап: 5 — Курсы
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
