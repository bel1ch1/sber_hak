# Ouroboros — гайд разработки для агентов

Практический SSOT для создания skills, playbook'ов, MCP-интеграций, HITL и пайплайнов под Ouroboros.  
Официальные источники: [CREATING_SKILLS.md](https://github.com/razzant/ouroboros/blob/main/docs/CREATING_SKILLS.md), [CHECKLISTS.md](https://github.com/razzant/ouroboros/blob/main/docs/CHECKLISTS.md), [ARCHITECTURE.md](https://github.com/razzant/ouroboros/blob/main/docs/ARCHITECTURE.md), [OuroborosHub](https://github.com/razzant/OuroborosHub).

---

## 0. Хакатон: быстрый старт

### Что в git (общая работа команды)

| В git | Не в git | Почему |
|-------|----------|--------|
| `OUROBOROS_DEV.md`, `agent.env`, `.gitignore` | `.env` | Секреты у каждого свои |
| `skills/` | `docker-compose.yml`, `ouroboros/` | Пайплайны — общий код; движок — отдельный clone |
| `mcp/` | `workspace/` | MCP-серверы — общий код; рабочие файлы — у каждого свои |
| `memory/identity.md`, `memory/knowledge/**` | `memory/knowledge/outcomes/` | Базовая личность и регламенты — общие; исходы прогонов — runtime |

### Структура

```text
.
├── OUROBOROS_DEV.md      # гайд (git)
├── .gitignore            # git
├── agent.env             # конфиг окружения (git)
├── .env                  # секреты — создать из agent.env (не в git)
├── docker-compose.yml    # шаблон ниже (не в git)
├── ouroboros/            # git clone движка (не в git)
├── skills/               # playbook'и → /app/data/skills/external (git)
│   └── _template/
├── mcp/                  # исходники MCP-серверов (git)
├── memory/               # память агента → /app/data/memory
│   ├── identity.md       # git — общий baseline для команды
│   └── knowledge/        # git — регламенты; outcomes/ — не в git
└── workspace/            # рабочие файлы → /workspace (не в git)
```

### Почему `workspace/` не в git

У каждого разработчика свои входные данные, черновики и артефакты прогонов. Коммитить их в общий репозиторий — шум в PR и риск перетирания чужих файлов. Для примеров входных данных используйте `skills/<name>/fixtures/` или отдельную папку в `mcp/`.

### Почему `memory/knowledge/outcomes/` не в git

Outcome cards пишутся агентом после каждого прогона — это runtime-память, а не исходный код. Общий baseline (`identity.md`, статичные регламенты в `knowledge/`) — в git; накопленный опыт прогонов — локально у каждого инстанса агента.

### Шаги

1. **Секреты:** скопируйте `agent.env` → `.env`, задайте `OUROBOROS_NETWORK_PASSWORD` и API-ключ провайдера.
2. **Движок:** `git clone https://github.com/razzant/ouroboros.git` (один раз, в корень проекта).
3. **Docker Compose:** создайте `docker-compose.yml` (шаблон — в конце §0).
4. **Запуск:** `docker compose up -d --build` → http://localhost:8765
5. **MCP:** поднимите сервер из `mcp/`, зарегистрируйте URL в Settings → Advanced → MCP.
6. **Пайплайн:** скопируйте `skills/_template/` → `skills/<your_pipeline>/`, отредактируйте `SKILL.md`.
7. **Enable:** Skills → preflight → review → enable (+ grants при необходимости).

### Шаблон docker-compose.yml

Сохраните как `docker-compose.yml` в корне (файл не коммитится):

```yaml
services:
  ouroboros:
    build:
      context: ./ouroboros
      dockerfile: Dockerfile
    image: ouroboros-web:latest
    container_name: ouroboros
    restart: unless-stopped
    env_file:
      - agent.env
      - .env
    ports:
      - "${OUROBOROS_SERVER_PORT:-8765}:8765"
    environment:
      OUROBOROS_SERVER_HOST: "0.0.0.0"
      OUROBOROS_DATA_DIR: "/app/data"
      OUROBOROS_FILE_BROWSER_DEFAULT: "/workspace"
    volumes:
      - ouroboros-data:/app/data
      - ./${HACKATHON_WORKSPACE_DIR:-workspace}:/workspace
      - ./${HACKATHON_SKILLS_DIR:-skills}:/app/data/skills/external
      - ./${HACKATHON_MEMORY_DIR:-memory}:/app/data/memory
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  ouroboros-data:
```

### Что делать вам вручную

| Действие | Почему |
|----------|--------|
| Создать `.env` из `agent.env` | Секреты не в git |
| Создать `docker-compose.yml` | Инфраструктура не в git |
| `git clone` ouroboros | Движок ~700+ файлов, отдельный upstream |
| API-ключ в Settings | Провайдер LLM обязателен для супервизора |
| Запуск MCP-сервера | Ouroboros — клиент, сервер пишете вы в `mcp/` |
| `git remote add` + push | Публикация репозитория хакатона |

---

## 1. Архитектурные роли

| Слой | Роль | Что класть |
|------|------|------------|
| **Playbook / instruction skill** | Как думать и в каком порядке действовать | AS IS→TO BE, шаги, HITL-гейты, формат артефактов |
| **MCP tools** | Детерминированные «руки» в системах | Typed tools с JSON Schema, безопасные side-effects |
| **Script / extension skill** | Код навыка | Батч-скрипты, `register_tool`, routes, widgets, companions |
| **Memory** | Контекст между прогонами | `identity.md`, `knowledge/`, outcome cards |
| **Schedule** | Регулярная рутина | `scheduled_tasks` в манифесте или `ouroboros schedule add` |
| **Safety / review** | Допуск к исполнению | triad skill review, grants, sandbox |

Правило: **MCP = действия; skill body = политика и оркестрация; секреты = Settings/Secrets, никогда в payload.**

---

## 2. Типы skills — что выбирать

| `type` | Содержимое | Когда использовать |
|--------|------------|-------------------|
| `instruction` | Только `SKILL.md` (markdown) | Регламент, playbook, чек-листы, стиль ответов |
| `script` | `scripts/` + subprocess | Батч, ETL, отчёты, детерминированные пайплайны |
| `extension` | `plugin.py` + PluginAPI | Agent tools, HTTP routes, widgets, A2A/bridges, companions |

Куда класть пользовательские skills:

```text
~/Ouroboros/data/skills/external/<skill_name>/
  SKILL.md          # обязательно
  plugin.py         # type: extension
  scripts/run.py    # type: script
  widget.js         # опционально, kind: module
```

Не писать в `native/` — только launcher-seeded. Marketplace: `clawhub/`, `ouroboroshub/`.

---

## 3. Манифест `SKILL.md`

### Минимальный шаблон

```yaml
---
name: my_process_skill          # alnum/underscore/dash, ≤64
description: Short user-facing summary
version: 0.1.0
type: instruction               # instruction | script | extension
when_to_use: User asks to run onboarding / process X for a new hire.
---

# Название процесса

## Роль
Кто ты и чего НЕ делаешь.

## Входной контракт
Какие поля обязательны.

## Пайплайн (TO BE)
Нумерованные шаги + MCP/tool на шаг + HITL.

## Запреты
Что нельзя делать без approve / вообще.

## Выходной артефакт
Формат черновика / карточки исхода.
```

### Script

```yaml
---
name: my_batch_skill
description: Batch export for process X
version: 0.1.0
type: script
runtime: python3                # python|python3|bash|node|deno|ruby|go
timeout_sec: 60                 # default 60, hard cap 300
permissions:
  - net
scripts:
  - name: main.py
    description: Run the batch pipeline
when_to_use: User asks to export / batch-process X.
---
```

### Extension

```yaml
---
name: my_ext_skill
description: Tools and UI for process X
version: 0.1.0
type: extension
runtime: python3
entry: plugin.py
permissions: [net, tool, route, widget, read_settings]
env_from_settings: []           # protected keys still need owner grant
timeout_sec: 120
when_to_use: User needs tool Y for process X.
scheduled_tasks:
  - name: daily-digest
    cron: "0 9 * * 1-5"         # 5-field cron
    timezone: Europe/Moscow
    description: Weekday morning digest
---
```

### Обязательные поля мысли автора

- `description` — коротко для UI/каталога.
- `when_to_use` — триггер выбора skill агентом.
- `permissions` — минимум необходимый.
- Body — достаточно, чтобы агент/ревьюер понял контракт без внешнего контекста.

---

## 4. Permissions и grants

| Permission | Даёт |
|------------|------|
| `net` | Исходящие сетевые вызовы |
| `fs` | Запись вне state dir (review всё равно смотрит confinement) |
| `subprocess` | Дочерние процессы |
| `tool` | `register_tool` |
| `route` | `register_route` |
| `widget` | UI tab / settings section |
| `ws_handler` | WS handlers + `send_ws_message` |
| `read_settings` | `api.get_settings([...])` |
| `supervised_task` | In-process supervised async task |
| `companion_process` | Host-supervised long-lived companion |
| `subscribe_event` | Подписка на host events |
| `inject_chat` | Инъекция в чат (нужен owner grant) |

Protected keys (`OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `TELEGRAM_BOT_TOKEN`, GigaChat/Cloud.ru keys, …) **никогда** не прокидываются в skill без owner grant, даже если перечислены в `env_from_settings`.

После любого edit payload → review invalidates (content hash). Снова: preflight → review → enable/grants.

---

## 5. Lifecycle разработки (закрытый цикл)

```text
author payload → skill_preflight → skill_review → fix blockers
    → owner enable + grants → skill_exec / tool call
    → читать stdout/events → править → повторить
```

1. Писать только в `data/skills/external/<name>/`.
2. `skill_preflight(skill="…")` — синтаксис/манифест без LLM.
3. `skill_review(skill="…")` — triad review по Skill Review Checklist.
4. Advisory: можно итерировать быстрее; Blocking: строже, blockers блокируют execution.
5. Owner может Skip review (attest) только для external/self-authored/hash-verified hub — agent **не** может self-attest.
6. Не коммитить секреты, бинарники (`.so/.dll/.wasm/.pyc`), кэши в payload.

Состояние: payload plane `data/skills/…`, owner/review state `data/state/skills/<name>/`.

Для job-артефактов extension:

```python
job_dir = api.skill_job_dir(job_id)  # …/jobs/<id>/{assets,output,tmp}
```

Не класть плоские shared-файлы, которые параллельные job'ы перезапишут.

---

## 6. Extension PluginAPI (паттерн)

```python
def register(api):
    api.register_tool(
        "search",
        handler=do_search,
        description="Search corp wiki by role",
        schema={
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "role": {"type": "string"},
            },
            "required": ["query"],
        },
        timeout_sec=60,
    )
    api.register_route("search", handler=http_search, methods=("POST",))
    api.on_unload(cleanup)

async def do_search(ctx, query: str = "", role: str = ""):
    # async OK; не опирайся на loop-local state с момента register()
    return {"items": []}
```

Tools неймспейсятся как `ext_<len>_<token>_<name>`.  
HTTP: `/api/extensions/<skill>/<path>`.

Dependencies:

```yaml
dependencies: [httpx]
# или
install:
  - kind: pip
    package: httpx
```

Ставятся в изолированный `.ouroboros_env` **после** свежего executable review. Extension с isolated deps исполняется в short-lived child process.

Long-running: `companion_process` в манифесте + permission `companion_process`, не `start_service` (тот task-scoped).

---

## 7. MCP-интеграция (для разработчика)

Ouroboros — MCP-клиент (HTTP/SSE). Tools по умолчанию off; Settings → Advanced → MCP; hot-reload; safety check; имена `mcp_<server>__<tool>`.

Конфиг сервера:

```json
{
  "name": "jira",
  "url": "http://localhost:9999/mcp",
  "transport": "streamable_http"
}
```

### Правила проектирования MCP tools

1. Один tool = одно действие с ясной схемой аргументов.
2. Side-effects явны в `description` (`create_draft` ≠ `approve` ≠ `grant_access`).
3. Возвращай структурированный JSON: `id`, `status`, `next_action`, ошибки с кодом.
4. Least privilege: создавать заявку можно; выдавать права — нельзя.
5. Auth через Secrets/headers сервера, не через текст skill.
6. Для демо — sandbox/mocks с тем же контрактом, что прод.
7. При discovery failure runtime отдаёт omission manifest — не маскируй отсутствие tools в playbook.

Паттерн связки:

```text
instruction skill говорит «вызови mcp_jira__list_good_first»
MCP server реализует list_good_first / create_draft_plan
HITL: create_draft_plan OK; publish_plan — только после approve
```

---

## 8. Playbook и пайплайн (TO BE)

В Ouroboros нет отдельного BPMN-движка. Пайплайн = **контракт в skill body + MCP/tools + schedule/subagents + HITL**.

### Обязательная структура playbook

```markdown
## Триггер
Что запускает процесс (сообщение / cron / внешнее событие).

## Входной контракт
- required: [...]
- optional: [...]
- sources: [mcp_..., files, user]

## Шаги
1. **id** — цель; tool; input→output; timeout; autonomy: auto|draft|approve
2. ...

## Ветвления
- if condition → step / escalate

## HITL-гейты
| Решение | Кто утверждает | Что агент готовит |
|---------|----------------|-------------------|
| ...     | PO / HR        | черновик ...      |

## Выходной артефакт
Схема черновика / списка тикетов / письма.

## Карточка исхода (после прогона)
Что рекомендовал / что поправил человек / итог — в knowledge/outcomes/

## Запреты
- не выдумывать данные при недоступном MCP
- не выполнять шаги с autonomy=approve без явного OK
```

### Уровни автономии (HITL)

| Уровень | Поведение агента |
|---------|------------------|
| `auto` | Выполнить tool, зафиксировать результат |
| `draft` | Подготовить черновик, не публиковать side-effect |
| `approve` | Остановиться, показать черновик, ждать подтверждения владельца |

В корпоративных сценариях: поиск/черновики/создание заявок = `draft`/`auto`; доступы, назначения людей, публикация планов = `approve`.

Review mode рантайма (Settings): **Advisory** ускоряет итерации разработки; **Blocking** — ближе к прод-дисциплине. Это ортогонально HITL в playbook.

### Каркас пайплайна (YAML в body skill — удобно агенту)

```yaml
pipeline:
  trigger: newbie_started
  steps:
    - id: fetch_profile
      tool: mcp_hr__get_employee
      autonomy: auto
    - id: draft_meetings
      tool: mcp_calendar__create_events
      autonomy: draft
    - id: access_requests
      tool: mcp_itsm__create_request
      autonomy: draft
      gate: PO approve before submit
    - id: trial_plan
      tool: mcp_jira__list_good_first
      autonomy: approve
    - id: learning
      tool: mcp_wiki__search
      autonomy: auto
    - id: outcome_card
      write: knowledge/outcomes/
      autonomy: auto
```

### Расписание

В манифесте (`scheduled_tasks` + permission `supervised_task`) или CLI:

```bash
ouroboros schedule add --name nightly-review --cron "0 2 * * *" "Run maintenance review"
```

Cron: 5 полей; timezone host-local по умолчанию; после downtime — один catch-up, не replay всех пропусков.

---

## 9. Память и адаптация без ML

Заполнять под сценарий:

| Артефакт | Назначение |
|----------|------------|
| `identity.md` | Кто агент, какой процесс обслуживает, границы |
| `scratchpad` | Рабочая память (эфемерная) |
| `knowledge/` | Регламенты, справочники, **outcome cards** |
| `dialogue_blocks.json` | Консолидированная история (системная) |

Паттерн outcome card:

```markdown
# outcome-2026-07-13-backend-payments
role: backend
team: payments
recommended_buddy: X
po_corrected_to: Y
checkins: ok|issues
notes: why ranking changed
```

На следующем прогоне: положить N карточек в контекст → ранжировать с объяснением → HITL на финальный выбор.

---

## 10. A2A и декомпозиция

A2A — skill из Hub (`type: extension`), не core. Паттерн:

- один оркестратор-playbook;
- узкие под-агенты/skills на части процесса (встречи, доступы, план ИС);
- обмен через A2A tools (`discover` / `send` / `status`) или `schedule_subagent` в рантайме.

Не обещать multi-agent / online-RL, если в прототипе только один playbook + MCP.

---

## 11. Паттерны, которые стоит копировать

### P1 — Thin instruction + fat MCP
Playbook короткий; вся мутация систем — в MCP с аудитом.

### P2 — Draft-then-approve
Каждый рискованный side-effect двухфазный: `create_draft_*` → human OK → `submit_*`.

### P3 — One skill = one job
Не смешивать онбординг, отчётность и transport-bridge в одном payload.

### P4 — Honest failure
Если MCP/источник недоступен — сказать явно, дать ссылку/ручной путь, не выдумывать.

### P5 — Demo contract = prod contract
Моки принимают те же tool names/schemas, что прод — меняется только URL MCP.

### P6 — Reviewable surface
Маленькие файлы, явные permissions, без бинарников, без скрытых daemon'ов вне `companion_process` / `scheduled_tasks`.

### P7 — Progressive disclosure
`description` + `when_to_use` достаточны для выбора; детали — в body после активации skill.

---

## 12. Чек-лист перед «готово к enable»

- [ ] Выбран правильный `type` (instruction/script/extension)
- [ ] Payload в `external/<name>/`, есть валидный frontmatter
- [ ] `when_to_use` и HITL-гейты описаны
- [ ] Permissions минимальны; секретов в файлах нет
- [ ] MCP tools названы в playbook так же, как в сервере
- [ ] Side-effects разделены на draft/submit где нужно
- [ ] `skill_preflight` зелёный
- [ ] `skill_review` без blockers (или advisory-accepted с записью причины)
- [ ] Grants выданы; skill enabled
- [ ] Прогнан happy-path + отказ MCP + отказ на HITL-шаге
- [ ] Outcome/artefact пишется предсказуемо

---

## 13. Быстрые команды агенту-разработчику

```text
# создать skill
write SKILL.md (+ plugin.py | scripts/) under data/skills/external/<name>/

# проверить
skill_preflight(skill="<name>")
skill_review(skill="<name>")

# выполнить script
skill_exec(skill="<name>", script="main.py", args=...)

# MCP
Settings → Advanced → MCP → add {name, url, transport: streamable_http}
# tools появятся как mcp_<name>__<tool>
```

Официальные примеры skills: [OuroborosHub/skills](https://github.com/razzant/OuroborosHub/tree/main/skills) (`weather`, `a2a`, `telegram-bridge`, instruction-like playbooks).

---

## 14. Чего не делать

- Не включать `/evolve` в корпоративный playbook.
- Не выдавать права/деньги/ПДн напрямую из агента — только черновики заявок.
- Не хардкодить API keys в `SKILL.md` / `plugin.py`.
- Не подменять review самоподписанным «trust me».
- Не строить скрытые бесконечные циклы без schedule/companion контракта.
- Не рассчитывать на RL/дообучение модели — только контекст + outcome cards + HITL.
