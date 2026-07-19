---
name: buddy_matching
description: Подбирает топ-3 кандидатов в бадди по рабочим критериям, принимает версионный выбор руководителя и после подтверждения отправляет письмо выбранному buddy_id.
version: 0.3.1
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 2 «Бадди» или руководитель просит подобрать наставника для обезличенного employee_id.
---

# Этап 2 — подбор бадди

## Границы

Работай только над ранжированием, выбором бадди и письмом выбранному кандидату. В MVP не моделируй его согласие, отказ или тайм-аут.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `role`, `team`, `manager_feedback`, `selected_buddy_id`, `operation_records`, `execute_authorized`.

## Идемпотентность

Алгоритм ниже самодостаточен для этого skill pack; не требуй внешних файлов правил.

1. Action marker: `m_` + первые 16 hex-символов lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами и без payload:

```json
{
  "action": "buddy-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 2,
  "target_ids": ["<selected_buddy_id>"]
}
```

Включи marker в тему письма до вычисления payload hash.

2. `payload_sha256` = lowercase SHA-256 canonical UTF-8 полного утвержденного payload: `subject`, `text`, выбранный `buddy_id`.

3. Operation key: `op_` + lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами:

```json
{
  "action": "buddy-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "payload_sha256": "<payload_sha256>",
  "stage": 2,
  "target_ids": ["<selected_buddy_id>"]
}
```

Строки не обрезай и не нормализуй кроме UTF-8; `target_ids` сортируй.

## Preflight интеграций

1. Проверь наличие и текущие schemas:
   - `mcp_buddy__buddy_verify`;
   - `mcp_buddy__buddy_match`;
   - `mcp_buddy__buddy_get_profile`;
   - `mcp_gmail__gmail_verify`;
   - `mcp_gmail__gmail_list_folders`;
   - `mcp_gmail__gmail_list_messages`;
   - `mcp_gmail__gmail_get_message`;
   - `mcp_gmail__gmail_send`.
2. Вызови read-only `mcp_buddy__buddy_verify()` и `mcp_gmail__gmail_verify()`.
3. Если capability отсутствует, schema несовместима или verify вернул ошибку, не выполняй подбор и верни `BLOCKED` с точной причиной.

## Подбор

1. Вызови `mcp_buddy__buddy_match(role=<role>, team=<team>, employee_id=<employee_id>, limit=3)`.
2. Покажи до трех кандидатов: `buddy_id`, score/rank и только рабочие reasons.
3. Не используй чувствительные или не относящиеся к работе характеристики.
4. Не выдумывай `buddy_id`.
5. Руководитель может выбрать кандидата из списка либо указать другой opaque `buddy_id`.
6. Если указан `buddy_id` вне текущего результата `buddy_match`, обязательно вызови `mcp_buddy__buddy_get_profile(buddy_id=<selected_buddy_id>)`. При ошибке, malformed-ответе или отсутствии валидного профиля верни `BLOCKED`; не формируй и не отправляй письмо.
7. Если `buddy_match` завершился ошибкой, вернул malformed-ответ или не вернул ни одного валидного `buddy_id`, не формируй письмо и не выполняй отправку. Верни `BLOCKED` с безопасным описанием ошибки и предложением повторить read-only подбор после восстановления capability.

## Письмо

После выбора сформируй:

```text
Тема: Приглашение стать бадди [onboarding:<employee_id>] [<action_marker>]

Здравствуйте!

Вы выбраны кандидатом в бадди для нового сотрудника <employee_id>,
который присоединяется к команде <team> в роли <role>.

Пожалуйста, ознакомьтесь с задачами бадди и помогите сотруднику пройти первые недели онбординга.
```

Не добавляй персональные данные и неподтвержденные обещания.

## Согласование и исполнение

Полная утверждаемая версия включает: выбранный `buddy_id`, обоснование, полный текст письма и
`mcp_gmail__gmail_send(to=[buddy_id], subject=<тема>, text=<тело>)`.

HITL только у оркестратора. Один draft-вызов, один execute после OK.

- `approved_version` пуст/≠ `draft_version` → черновик (топ-3 или выбранный buddy + письмо), `AWAITING_APPROVAL`, без send. После правки увеличь версию.
- `approved_version == draft_version` и `execute_authorized=false` → `AWAITING_APPROVAL`.
- `approved_version == draft_version` и `execute_authorized=true`:
  1. Action marker + operation key/hash.
  2. Уже `CONFIRMED` с тем же key → `EXECUTED` без повторного send.
  3. Иначе `mcp_gmail__gmail_send(to=[buddy_id], …)`. Opaque ID в теме/теле — штатно.
- Успех: `messageId` + непустой `accepted` + пустой `rejected` (`to` id или `self`/shared-mailbox alias). Сохрани `buddy_id` + `messageId` для встреч.
- Sent-reconcile только при timeout/malformed. В MVP не жди ответа бадди. Повтор execute не перезапускает подбор.

## Выход

```text
Этап: 2 — Бадди
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
