# Jira MCP-коннектор для Ouroboros

MCP-сервер, дающий онбординг-агенту руки в Jira: собрать план на испытательный
срок новичка (Epic + ~20 задач с дедлайнами) одним осмысленным вызовом.
Работает в двух режимах: **mock** (локальный JSON, без Jira) и **real**
(Jira Cloud REST API v2, Basic-auth email + API-token; тот же путь годится и для
Jira Data Center).

## Быстрый старт (mock, без Jira)

```bash
cd hackathon
python3 -m venv .venv && ./.venv/bin/pip install -r jira_mcp/requirements.txt
cd jira_mcp
JIRA_MODE=mock ../.venv/bin/python server.py
# -> http://127.0.0.1:9101/mcp
```

Проверка логики без сервера:
```bash
../.venv/bin/python test_smoke.py   # -> SMOKE OK ✅
```

## Подключение к Ouroboros

Settings → Advanced → MCP:
```json
{ "name": "jira", "url": "http://localhost:9101/mcp", "transport": "streamable_http" }
```
Тулзы всплывут в агенте как `mcp_jira__jira_get_project`, `mcp_jira__jira_create_onboarding_plan`, … и пройдут штатный per-call safety-check.

## Переключение на реальную Jira Cloud

1. Заведи бесплатный сайт на `atlassian.net`, создай проект (напр. ключ `PAY`).
2. Создай API-token: `id.atlassian.com` → Security → **Create API token**.
3. Заполни `.env` (см. `config.example.env`):
   ```
   JIRA_MODE=real
   JIRA_BASE_URL=https://<твой-сайт>.atlassian.net
   JIRA_EMAIL=<твой email>
   JIRA_API_TOKEN=<token>
   ```
4. Запусти: `set -a; source .env; set +a; ../.venv/bin/python server.py`

## Тулзы

| Тул | Тип | Автономность | Что делает |
|---|---|---|---|
| `jira_get_project` | read | auto | метаданные проекта, типы задач |
| `jira_search` | read | auto | JQL-поиск (в т.ч. проверка дублей) |
| `jira_create_issue` | write | draft→approve | одна задача |
| `jira_create_onboarding_plan` | write | **dry_run → approve → commit** | Epic + ~20 задач из шаблона с дедлайнами |
| `jira_rollback_plan` | write | approve | удалить всё по онбордингу (откат демо) |

## Human-in-the-loop и безопасность

- `jira_create_onboarding_plan(dry_run=True)` (по умолчанию) — возвращает
  **превью** 20 задач, ничего не пишет. Реальная запись — вызов с `dry_run=False`.
- **Идемпотентность:** задачи метятся label `onboarding:<hire_id>`; повторный
  вызов не дублирует план (вернёт `already_exists`).
- **Откат:** `jira_rollback_plan` удаляет всё по label — чистый демо-прогон.
- Токен живёт в env сервера, **не** в промпте агента.
- Обезличенные данные, реальный сайт вне периметра банка (соответствует слайду
  «Высокие стандарты безопасности»).

## Карточки исходов (обучение)

Каждый успешный план дописывает строку в `outcome_cards.jsonl`
(`{hire_id, role, epic, tasks, objective_eval, ts}`) — ложится на семантику
штатного `outcomes.py`. На следующих онбордингах шаблон адаптируется: задачи,
которые руководитель часто удаляет, понижаются в приоритете.

## Демо-сценарий (питч)

1. `jira_get_project("PAY")` — проект на месте.
2. `jira_create_onboarding_plan(project_key="PAY", hire_id="anon-7f3a", role="backend", start_date="2026-07-20", team="Платёжные сервисы")` → превью 20 задач.
3. Тот же вызов с `dry_run=False` → в Jira появились Epic + 20 задач с дедлайнами.
4. Показать доску Jira + `outcome_cards.jsonl` + замер времени.
5. `jira_rollback_plan("PAY", "anon-7f3a")` — чистим за собой.

## Файлы

```
jira_mcp/
├── server.py            # FastMCP-сервер, 5 тулзов, streamable_http :9101
├── jira_client.py       # RealJiraClient (Cloud v2) + MockJiraClient
├── plan.py              # сборка плана из шаблона роли
├── templates/backend.yaml   # 20 задач backend-онбординга (редактируемо)
├── test_smoke.py        # offline-тест всей логики
├── requirements.txt
└── config.example.env
```
