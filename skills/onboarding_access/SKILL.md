---
name: onboarding_access
description: Готовит для нового сотрудника обоснованный список доступов, проводит версионное согласование с руководителем и после подтверждения отправляет заявку по обезличенному ID.
version: 0.2.3
type: instruction
when_to_use: Главный onboarding-оркестратор делегирует этап 1 «Доступы» или руководитель явно просит подготовить заявку на доступы для обезличенного employee_id.
---

# Этап 1 — доступы

## Границы

Работай только над списком доступов и письмом руководителю. Не выдавай доступы и не запускай другие этапы.

Вход: `onboarding_id`, `draft_version`, `approved_version`, `employee_id`, `manager_id`, `role`, `team`, `additional_context`, `manager_feedback`, `operation_records`, `execute_authorized`.

Формат тела письма — **plain text** (структура как у корпоративной заявки на доступы).
Не прикрепляй HTML-форму, `.md` из task_drive, Excel и любые файлы.
Автоматизируем только письмо руководителю (`to=[manager_id]`); шаг в техподдержку — вне MCP.

## Идемпотентность

Алгоритм ниже самодостаточен для этого skill pack; не требуй внешних файлов правил.

1. Action marker: `m_` + первые 16 hex-символов lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами и без payload:

```json
{
  "action": "access-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "stage": 1,
  "target_ids": ["<manager_id>"]
}
```

Включи marker в тему письма до вычисления payload hash.

2. `payload_sha256` = lowercase SHA-256 canonical UTF-8 полного утвержденного payload: `subject`, `text`, список доступов в стабильном порядке.

3. Operation key: `op_` + lowercase SHA-256 от canonical UTF-8 JSON с отсортированными ключами:

```json
{
  "action": "access-mail",
  "approved_version": "<approved_version>",
  "onboarding_id": "<onboarding_id>",
  "payload_sha256": "<payload_sha256>",
  "stage": 1,
  "target_ids": ["<manager_id>"]
}
```

Строки не обрезай и не нормализуй кроме UTF-8; `target_ids` сортируй.

## Preflight интеграций

1. Проверь наличие и schemas:
   - Confluence: `mcp_confluence__confluence_verify`, `mcp_confluence__confluence_search`, `mcp_confluence__confluence_get_page`;
   - Wiki fallback: `mcp_wiki__wiki_list_pages`, `mcp_wiki__wiki_search`, `mcp_wiki__wiki_get_page`;
   - mail: `mcp_gmail__gmail_verify`, `mcp_gmail__gmail_list_folders`, `mcp_gmail__gmail_list_messages`, `mcp_gmail__gmail_get_message`, `mcp_gmail__gmail_send`.
2. Вызови `mcp_gmail__gmail_verify()` и read-only verify выбранного источника: `mcp_confluence__confluence_verify()` либо `mcp_wiki__wiki_list_pages()`.
3. Если mail недоступен, schema несовместима или оба источника не дали валидного ответа, верни `BLOCKED` и не формируй неподтвержденную заявку.
4. На этапе 1 не передавай `attachments` в gmail_send; заявка = subject + text.

## Источник

1. Основной: `mcp_confluence__confluence_search(query=<role, team и access policy>)` → `mcp_confluence__confluence_get_page(page_id=<id из search>)`.
2. Demo fallback: `mcp_wiki__wiki_get_page(slug="access-policy")` или `mcp_wiki__wiki_search(query=<role и team>, limit=5)`.
3. Выбери один источник и укажи его.
4. Каноническая политика — страница «Политика доступов» / `access-policy`: общие доступы (SSO, почта, **VPN**, Jira, Wiki, мессенджер), пакет по роли (для backend — GitLab, CI/CD, K8s stage, PostgreSQL, Kafka, Grafana, Sentry, Vault) и смежные системы (**CRM**, **1С**, TestRail, Metabase, Figma, HR, СЭД) только при соответствии роли/явному запросу.
5. Не добавляй доступ «на всякий случай». Каждый пункт должен следовать из политики, роли, команды или явного контекста. Для backend по умолчанию **не** включай CRM и 1С без явного запроса руководителя.
6. В каждом пункте заявки указывай **описание** системы/доступа из политики (колонка «Описание»), не только имя.

Если источник недоступен или роль не покрыта политикой, верни `BLOCKED` или `NEEDS_DATA`; не придумывай список.

## Черновик

Тема: `Запрос на выдачу прав.` (+ markers). Тело — plain text по шаблону ниже.
**Не ищи и не прикладывай** файл формы/HTML/`access_draft.md` — черновик в чате и в `text` письма достаточен.

В пайплайне **не подставляй ФИО и email** в HITL-черновике: opaque id.
MCP раскрывает id в адресах при send. Получатель: `to=[manager_id]` (не `usr_hr`, не employee).

Ресурс в форме — путь из трёх уровней: `Категория — Подсистема — Роль/право`
(как в меню формы). Маппь пункты политики доступов на такие пути; если
точного пути в каталоге формы нет — укажи ближайший путь и поясни в
комментарии. Несколько ресурсов — нумерованным списком.

Сформируй тело письма:

```text
Добрый день.

Прошу согласовать предоставление прав/доступ (кому): <employee_id>
-------------------------------------------------------------------------
Ресурс:
1) <Категория> — <Подсистема> — <Роль/право>
2) …
-------------------------------------------------------------------------
Данные пользователя:
Сотрудник (id): <employee_id>
Роль: <role>
Команда: <team>
Организация: ТОТ
-------------------------------------------------------------------------
Комментарий: Онбординг [onboarding:<employee_id>]. <кратко: пакет из политики + ограничения (напр. prod на ИС не запрашиваем)>.
-------------------------------------------------------------------------
P.S. После согласования руководителем направление в техподдержку: itsupport@sberanalytics.ru (в демо-пайплайне этот шаг не автоматизировать, если нет отдельного tool).
```

Тема письма (для send): `Запрос на выдачу прав. [onboarding:<employee_id>] <action_marker>` —
сохрани корпоративную формулировку и добавь маркеры идемпотентности/поиска дублей.

В `Полный черновик` верни нумерованный список доступов (категория — подсистема — роль/право — краткое описание), полное тело письма, тему и `to=[manager_id]`, чтобы оркестратор показал их в чате.

Планируемое действие одно: `mcp_gmail__gmail_send(to=[manager_id], subject, text)` без `attachments`.

## Согласование и исполнение

HITL только у оркестратора. Этот skill не спрашивает руководителя.
Один вызов на draft, один на execute после OK — write в том же execute-вызове.

- Если `approved_version` пуст или ≠ `draft_version`: примени `manager_feedback` при наличии, собери черновик, верни `AWAITING_APPROVAL` (без send).
- Если `approved_version == draft_version` и `execute_authorized=false`: верни тот же черновик как `AWAITING_APPROVAL`.
- Если `approved_version == draft_version` и `execute_authorized=true`:
  1. Сформируй action marker + operation key/hash; marker в тему.
  2. Если в `operation_records` уже `CONFIRMED` с тем же key — верни `EXECUTED` без повторного send.
  3. Иначе вызови `mcp_gmail__gmail_send(to=[manager_id], subject=<тема>, text=<тело>)` — plain text, без `attachments`.
- Тема: `Запрос на выдачу прав. [onboarding:<employee_id>] <action_marker>`.
- Успех send: непустой `messageId`/`message_id`, `rejected` пуст, `accepted` непуст; достаточно id из `to[]` или `self` / alias shared mailbox. Sent-reconcile — только при timeout/malformed/пустом id.
- Раскрытие opaque id → адрес в MCP штатно. Организация в демо — `ТОТ`.
## Выход

Верни общий контракт этапа:

```text
Этап: 1 — Доступы
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

Не показывай и не запрашивай ФИО или email.
