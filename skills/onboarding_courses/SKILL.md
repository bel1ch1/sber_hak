---
name: onboarding_courses
description: Подбирает курсы по роли через Stepik MCP, проводит версионное согласование списка и отправляет утверждённый учебный план сотруднику по opaque ID.
version: 0.1.3
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 5 «Курсы» или руководитель просит подобрать обучение для обезличенного employee_id.
---

# Этап 5 — курсы

## Границы

Работай только над подбором курсов, mock-зачислением и письмом сотруднику. `stepik_enroll` пишет локальный JSON (не Stepik.org): сохраняй `enrollment_id`, но не утверждай регистрацию на stepik.org.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `role`, `team`, `additional_context`, `manager_feedback`, `operation_records`, `execute_authorized`.

## Идемпотентность

Алгоритм ниже самодостаточен для этого skill pack; не требуй внешних файлов правил.

1. Action marker: `m_` + первые 16 hex-символов lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами и без payload:

```json
{
  "action": "courses-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 5,
  "target_ids": ["<employee_id>"]
}
```

Включи marker в тему письма до вычисления payload hash.

2. `payload_sha256` = lowercase SHA-256 canonical UTF-8 полного утвержденного payload: `subject`, `text`, список course ID/title/url в стабильном порядке.

3. Operation key: `op_` + lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами:

```json
{
  "action": "courses-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "payload_sha256": "<payload_sha256>",
  "stage": 5,
  "target_ids": ["<employee_id>"]
}
```

Строки не обрезай и не нормализуй кроме UTF-8; `target_ids` сортируй. Для одного утвержденного действия ключ обязан совпадать у всех запусков.

## Preflight интеграций

1. Проверь наличие и текущие schemas:
   - `mcp_stepik__stepik_list_roles`;
   - `mcp_stepik__stepik_match_role`;
   - `mcp_stepik__stepik_get_courses_by_role`;
   - `mcp_stepik__stepik_suggest_onboarding`;
   - `mcp_stepik__stepik_enroll`;
   - `mcp_yandex_mail__yandex_mail_verify`;
   - `mcp_yandex_mail__yandex_mail_list_folders`;
   - `mcp_yandex_mail__yandex_mail_list_messages`;
   - `mcp_yandex_mail__yandex_mail_get_message`;
   - `mcp_yandex_mail__yandex_mail_send`.
2. Вызови read-only `mcp_stepik__stepik_list_roles()` и `mcp_yandex_mail__yandex_mail_verify()`.
3. Если Stepik или mail capability недоступна, schema несовместима либо preflight вернул ошибку, не подбирай неподтвержденные курсы и не планируй отправку; верни `BLOCKED` с точной причиной.

## Подбор

1. Нормализуй роль через `mcp_stepik__stepik_match_role(role=role)` и используй только возвращенную каноническую роль.
2. Передавай `include_soft_skills` явно: по умолчанию `include_soft_skills=true`, если руководитель не попросил исключить soft skills. Получи каталог через `mcp_stepik__stepik_get_courses_by_role(role=<matched role>, include_soft_skills=<bool>)` либо готовое предложение через `mcp_stepik__stepik_suggest_onboarding(role=<matched role>, include_soft_skills=<bool>)`.
3. Используй только course IDs, названия и ссылки из ответа MCP.
4. Для каждого курса дай краткое рабочее обоснование.
5. Не выбирай курс только из-за похожего названия роли.
6. Если роль не поддержана, верни `NEEDS_DATA` или `BLOCKED`, не выдумывай курсы.
7. При error, пустом или malformed-ответе match/catalog/suggestion, отсутствии непустых course ID/title либо непроверенной Stepik URL верни `BLOCKED`; не формируй и не отправляй список.

## Письмо

```text
Тема: Учебный план онбординга [onboarding:<employee_id>] [<action_marker>]

Здравствуйте!

Для вашей роли <role> в команде <team> согласован следующий учебный план:

1. <название курса>
   Ссылка: <проверенная ссылка>
   Цель: <краткое обоснование>

Пожалуйста, используйте указанные материалы в рамках онбординга.
```

## Согласование и исполнение

Полная версия включает список, обоснования, mock-зачисление, письмо и действия `stepik_enroll` + send.

- Пока `approved_version != draft_version`, не вызывай enroll и не отправляй письмо.
- После правок увеличь версию и покажи полный вариант.
- Сформируй action marker и operation key по разделу «Идемпотентность» этого файла (отдельные ключи допустимы для enroll и mail, если skill ведёт два operation records).
- При совпадении версий сначала верни `PREPARED` без write. Только при `execute_authorized=true` и PENDING:
  1) `mcp_stepik__stepik_enroll` со списком `{title, description, url?}` → сохрани `enrollment_id`;
  2) `mcp_yandex_mail__yandex_mail_send(to=[employee_id], subject=<rendered subject>, text=<rendered body>, cc=[], bcc=[])`.
- Успех письма: непустой `message_id`, `accepted` содержит `employee_id`, `rejected` пуст.
- При ошибке или malformed/partial-ответе верни `BLOCKED`. После timeout письма — reconciliation через Sent + action marker; при неоднозначности не повторяй send.
- В отчёте: «курсы согласованы, mock-зачисление зафиксировано (`enrollment_id`), письмо отправлено» — не «зарегистрирован на stepik.org».

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
