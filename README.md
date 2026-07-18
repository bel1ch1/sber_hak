# Онбординг-агент (Sber Hackathon)

Автономный агент онбординга на [Ouroboros](https://github.com/razzant/ouroboros): руководитель в чате запускает процесс для нового сотрудника по обезличенному ID, агент последовательно проходит шесть этапов через skills и MCP.

## Что внутри

| Путь | Назначение |
|------|------------|
| `skills/` | Оркестратор `onboarding` + этапные skills |
| `mcp/` | MCP-серверы (почта, календарь, Jira, Stepik, buddy, wiki, Confluence) |
| `memory/knowledge/` | Runtime-правила пайплайна и capability map |
| `ONBOARDING_AGENT_PROMPTS.md` | Целевое поведение агента |
| `ONBOARDING_AGENT_DEVELOPMENT_CONTEXT.md` | Контекст для разработки |
| `OUROBOROS_DEV.md` | Гайд по skills / HITL / Ouroboros |
| `docker-compose.mcp.yml` | Стек MCP (в git) |
| `agent.env` | Шаблон env для Ouroboros (без секретов провайдера) |

## Требования

- Docker Desktop / Docker Engine + Compose v2
- Git
- Для локальной отладки MCP (опционально): Node.js 20+, Python 3.11+, [uv](https://docs.astral.sh/uv/)
- API-ключ LLM (OpenRouter / OpenAI / GigaChat — в Settings UI или `.env`)

## Быстрый старт

### 1. Клон и секреты

```powershell
git clone <этот-репозиторий> sber_hak
cd sber_hak
Copy-Item agent.env .env
# В .env задайте OUROBOROS_NETWORK_PASSWORD и ключ провайдера, либо заполните их позже в UI
```

### 2. Движок Ouroboros

```powershell
git clone --branch ouroboros --single-branch https://github.com/razzant/ouroboros.git
```

Каталог `ouroboros/` в git хакатона не коммитится.

### 3. Локальный `docker-compose.yml`

Файл **не в git** (у каждого свой). Минимальный вариант с подключением MCP:

```yaml
include:
  - path: docker-compose.mcp.yml

services:
  ouroboros:
    build:
      context: ./ouroboros
      dockerfile: Dockerfile
    image: ouroboros-web:latest
    container_name: ouroboros
    restart: unless-stopped
    depends_on:
      yandex-calendar-mcp:
        condition: service_healthy
      wiki-mock-mcp:
        condition: service_healthy
      jira-mcp:
        condition: service_healthy
      confluence-mcp:
        condition: service_healthy
      yandex-mail-mcp:
        condition: service_healthy
      buddy-mcp:
        condition: service_healthy
      stepik-mcp:
        condition: service_healthy
    env_file:
      - agent.env
      - .env
    ports:
      - "${OUROBOROS_SERVER_PORT:-8765}:8765"
    environment:
      OUROBOROS_SERVER_HOST: "0.0.0.0"
      OUROBOROS_DATA_DIR: "/data"
      OUROBOROS_FILE_BROWSER_DEFAULT: "/workspace"
    volumes:
      - ouroboros-data:/data
      - ./${HACKATHON_WORKSPACE_DIR:-workspace}:/workspace
      - ./${HACKATHON_SKILLS_DIR:-skills}:/data/skills/external
      - ./${HACKATHON_MEMORY_DIR:-memory}:/data/memory
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  ouroboros-data:
```

Полный шаблон и пояснения — в `OUROBOROS_DEV.md` (§0).

### 4. Секреты MCP

Рядом с каждым сервером создайте `.env` из `*.env.example` / `config.example.env`:

| MCP | Типичные переменные |
|-----|---------------------|
| `mcp/yandex-mail-mcp/.env` | `YANDEX_MAIL_LOGIN`, app password или OAuth, `MAIL_SEND_ENABLED=true` |
| `mcp/yandex-calendar-mcp/.env` | CalDAV login / token |
| `mcp/jira-mcp/.env` | `JIRA_MODE=mock` или real + `JIRA_BASE_URL` / email / token |
| `mcp/confluence-mcp/.env` | Cloud URL + token (для демо можно оставить mock/seed) |

Каталоги `accounts.csv` / `recipients.csv` уже содержат demo opaque ID → реальные demo-аккаунты.

### 5. Запуск

```powershell
# весь стек (Ouroboros + MCP)
docker compose up -d --build

# только MCP
docker compose -f docker-compose.mcp.yml up -d --build
```

UI: http://localhost:8765  

Проверка MCP: `docker compose -f docker-compose.mcp.yml ps` — сервисы `healthy`.

### 6. Регистрация MCP в Ouroboros

Settings → Advanced → MCP. URL **из контейнера Ouroboros** (общая compose-сеть):

```json
[
  {"id":"yandex_mail","name":"yandex-mail","url":"http://yandex-mail-mcp:3000/mcp","transport":"streamable_http","enabled":true},
  {"id":"yandex_calendar","name":"yandex-calendar","url":"http://yandex-calendar-mcp:3000/mcp","transport":"streamable_http","enabled":true},
  {"id":"buddy","name":"buddy","url":"http://buddy-mcp:3008/mcp","transport":"streamable_http","enabled":true},
  {"id":"stepik","name":"stepik","url":"http://stepik-mcp:3000/mcp","transport":"streamable_http","enabled":true},
  {"id":"jira","name":"jira","url":"http://jira-mcp:9101/mcp","transport":"streamable_http","enabled":true},
  {"id":"wiki","name":"wiki","url":"http://wiki-mock-mcp:9102/mcp","transport":"streamable_http","enabled":true},
  {"id":"confluence","name":"confluence","url":"http://confluence-mcp:9103/mcp","transport":"streamable_http","enabled":true}
]
```

С хоста (без общей сети) используйте `http://localhost:<порт>/mcp` — порты в таблице ниже. После изменения MCP выполните `/restart` в чате агента.

### 7. Skills

В UI: Skills → preflight → review → enable для:

- `onboarding` (оркестратор)
- `onboarding_access`, `buddy_matching`, `onboarding_welcome`, `onboarding_calendar`, `onboarding_courses`, `onboarding_probation`

Подробности enable/HITL — `OUROBOROS_DEV.md`.

## Порты MCP (хост)

| Сервис | Порт |
|--------|------|
| yandex-calendar-mcp | 3004 |
| yandex-mail-mcp | 3006 |
| stepik-mcp | 3007 |
| buddy-mcp | 3008 |
| jira-mcp | 9101 |
| wiki-mock-mcp | 9102 |
| confluence-mcp | 9103 |

Детали tools и auth: [`mcp/README.md`](mcp/README.md).

## Пайплайн (6 этапов)

1. **Доступы** — политика из Wiki/Confluence → письмо руководителю  
2. **Бадди** — `buddy_match` → выбор → письмо  
3. **Приветствие** — фиксированный шаблон, без отдельного HITL  
4. **Встречи** — план + `yandex_calendar_create_event` / при необходимости `update_event` (в т.ч. attendees)  
5. **Курсы** — рекомендации Stepik + mock `stepik_enroll` → письмо сотруднику  
6. **Испытательный срок** — Excel «Цели на ИС» + таблица в чат → Jira Epic/задачи → письмо с вложением `.xlsx`

Демо-ID: `usr_employee`, `usr_manager`, `usr_buddy` (см. CSV в MCP).

### Откат Jira после теста

```text
mcp_jira__jira_rollback_plan(project_key="<KEY>", hire_id="usr_employee")
```

Удаляет issues с label `onboarding:<hire_id>`, чтобы можно было снова записать план.

## Документация

| Документ | Для кого |
|----------|----------|
| Этот README | Установка и запуск |
| `ONBOARDING_AGENT_PROMPTS.md` | Поведение / промпты этапов |
| `ONBOARDING_AGENT_DEVELOPMENT_CONTEXT.md` | Архитектура и состояние интеграций |
| `OUROBOROS_DEV.md` | Разработка skills под Ouroboros |
| `mcp/README.md` | MCP по отдельности |

## Что не коммитится

`.env`, `docker-compose.yml`, `ouroboros/`, `workspace/`, `memory/knowledge/outcomes/` — локальные секреты, инфра и runtime. См. `.gitignore`.
