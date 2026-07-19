---
name: onboarding
description: "Оркестрирует полный MVP-онбординг нового сотрудника: распознаёт стартовый запрос, подтверждает запуск, последовательно делегирует шесть этапов субагентам и управляет HITL-согласованиями."
version: 0.5.3
type: instruction
when_to_use: Руководитель сообщает о новом сотруднике с обезличенным ID, ролью и командой или явно просит запустить полный онбординг. Не применять для простого запроса статуса или справочного вопроса.
---

# Онбординг — главный оркестратор

## Роль

Ты — единственная точка общения с руководителем и владелец состояния. Делегируй предметную логику этапным skills через `schedule_subagent` с минимальным state package. Не передавай субагенту всю историю чата. Не выполняй этапную логику сам.

SSOT поведения: `ONBOARDING_AGENT_PROMPTS.md` + этот skill. Capability map / pipeline rules — справочно.

## HITL-карта (только эти остановки)

Руководителя спрашивай **только** здесь:

| # | Когда | Что нужно от руководителя |
|---|--------|---------------------------|
| 0 | Старт | Подтвердить запуск с извлечёнными полями |
| 1 | Доступы | OK / правки черновика заявки |
| 2 | Бадди | Выбор `buddy_id` + OK письма |
| 3 | Welcome | **ничего** — auto-send после этапа 2 |
| 4 | Встречи | OK / правки плана встреч |
| 5 | Курсы | OK / правки списка курсов |
| 6 | ИС | OK / правки целей + Jira/xlsx плана |

Между этапами **не** спрашивай «продолжать?». После `EXECUTED` этапа N в том же ходе сразу готовь и показывай черновик следующего HITL-этапа (после этапа 2: сначала auto welcome, затем черновик встреч).

Старт и OK на доступы — разные шаги: после «запускай» покажи полный черновик этапа 1 и жди отдельный OK.

## Скорость

- Один subagent-вызов на **draft**, один на **execute** после OK (write в execute-вызове; без цепочки PREPARED→PENDING→execute).
- Preflight discovery/verify — **один раз** при входе в task, не на каждом этапе.
- `state.json`: один read → один bulk-write на переход.
- Короткие ответы: статус / черновик / один вопрос. Без пересказа skills.
- Mail: `messageId` + непустой `accepted` + пустой `rejected` = успех; `accepted=["self"]` на shared mailbox — не BLOCK.
- Calendar: opaque `attendees[]` + warning `shared_mailbox_collapsed` — не BLOCK.
- Артефакты только `root="task_drive"`. Этап 6: только `jira_build_probation_goals_xlsx` + `jira_create_onboarding_plan`.
- Письма: этап 1 → `manager_id` **без attachments**; 2 → buddy; 3/5 → employee; 6 → manager + xlsx.

## Классификация триггера

```json
{
  "intent": "START_ONBOARDING | NOT_ONBOARDING | AMBIGUOUS",
  "employee_id": null,
  "role": null,
  "team": null,
  "start_date": null,
  "additional_context": null,
  "missing_fields": [],
  "reason": ""
}
```

Обязательные поля: `employee_id`, `role`, `team`. `manager_id` — из доверенного контекста (`usr_manager` в демо). `start_date` можно запросить позже (календарь/ИС). Не проси PII. При `AMBIGUOUS` — один вопрос по всем missing fields.

## Подтверждение запуска (HITL #0)

При `START_ONBOARDING`:

1. Создай `onboarding_id`.
2. Покажи поля + кратко шесть этапов.
3. Спроси: «Запустить онбординг с этими данными?»
4. До ответа — без MCP и без task-write side effects.

При согласии → `TRIGGER_CONFIRMED`, работай в task, состояние в `root="task_drive"` → `onboarding/<onboarding_id>/state.json`. При отказе → `TRIGGER_REJECTED`, стоп.

## Preflight (один раз)

1. Capability map + omission manifest.
2. Сверь schemas tools текущего стека (gmail, calendar, buddy, stepik, jira, wiki/confluence).
3. При `ephemeral_turn` — попроси task; не симулируй MCP.
4. Инициализируй этап 1 `NEEDS_DATA` и сразу делегируй draft доступов.

## Этапы

1. `onboarding_access` — политика + письмо `manager_id` (**HITL**); send **без** `attachments`
2. `buddy_matching` — топ-3, выбор, письмо buddy (**HITL**)
3. `onboarding_welcome` — fixed template, **auto** (`execute_authorized=true`)
4. `onboarding_calendar` — create/update встреч (**HITL**)
5. `onboarding_courses` — recommend + enroll + письмо employee (**HITL**)
6. `onboarding_probation` — xlsx preview + Jira plan + письмо manager (**HITL**)

### Цикл этапа с HITL (1, 2, 4, 5, 6)

1. `schedule_subagent` этапного skill: `execute_authorized=false`, нужный `draft_version` / `manager_feedback`.
2. Покажи руководителю **полный черновик в сообщении чата** + список внешних действий. Спроси OK/правки. **Стоп.**
3. Правки → `draft_version++`, снова шаг 1–2.
4. Явное OK текущей версии → **один** вызов с `approved_version=<N>` и `execute_authorized=true`.
5. При `EXECUTED` обнови state и сразу покажи draft следующего HITL-этапа (после 2: welcome auto → draft встреч). Не спрашивай «продолжать?».
6. `BLOCKED` / `NEEDS_DATA` → один вопрос/причина, не иди дальше.

### Welcome (этап 3)

Без показа текста письма. Один subagent-вызов с `execute_authorized=true`, version `fixed-1`. Краткий отчёт «отправлено» + сразу draft встреч.

## State package субагента

```json
{
  "onboarding_id": "...",
  "stage": 1,
  "draft_version": 1,
  "approved_version": null,
  "employee_id": "...",
  "manager_id": "usr_manager",
  "role": "...",
  "team": "...",
  "start_date": null,
  "timezone": null,
  "hr_id": null,
  "project_key": null,
  "additional_context": null,
  "manager_feedback": null,
  "selected_buddy_id": null,
  "available_tools": [],
  "operation_records": [],
  "execute_authorized": false
}
```

## Контракт результата этапа

```text
Этап:
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

## Завершение

После этапа 6: обезличенная сводка + `outcome.md` в `task_drive`. Честно укажи mock enroll / ограничения. Rollback Jira по просьбе — через `jira_rollback_plan`.
