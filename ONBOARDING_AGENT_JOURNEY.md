# Путь обучения онбординг-агента

Документ описывает, как из каркаса Ouroboros + разрозненных MCP вырос рабочий MVP онбординга с видеозаписью полного пайплайна. Основание: содержимое репозитория, `memory/knowledge/*`, история git и логи сессий разработки (Cursor agent transcripts, июль 2026).

**Итог:** оркестратор `skills/onboarding` **v0.5.3** + шесть этапных skills; активный стек **Gmail / Google Calendar / buddy / Stepik / Jira / wiki-mock / Confluence**; e2e записан на hire **`usr_r3s7t9`**.

---

## 1. Что получилось (продукт)

Руководитель в чате запускает онбординг по обезличенному ID. Агент проходит шесть этапов, останавливаясь только там, где нужно решение человека:

| # | Этап | Skill | HITL |
|---|------|-------|------|
| 0 | Подтверждение запуска | `onboarding` | да |
| 1 | Доступы → письмо менеджеру | `onboarding_access` 0.2.3 | да |
| 2 | Бадди → письмо наставнику | `buddy_matching` 0.3.1 | да |
| 3 | Welcome-письмо сотруднику | `onboarding_welcome` 0.2.1 | **auto** |
| 4 | Встречи в календаре | `onboarding_calendar` 0.3.1 | да |
| 5 | Курсы Stepik + письмо | `onboarding_courses` 0.3.1 | да |
| 6 | Цели ИС (Excel) + Jira + письмо | `onboarding_probation` 0.3.1 | да |

Принципы, которые агент «выучил» и держит в runtime-памяти:

- **Skill = политика**, **MCP = руки**; ПДн (email, ФИО) остаются внутри MCP CSV.
- Работа только в **task**, не в ephemeral-чате.
- После OK — один write-execute и сразу следующий черновик, без «продолжать?».
- Артефакты только в `task_drive` (`onboarding/<id>/state.json`).

---

## 2. Хронология по репозиторию (git)

```text
2026-07-15  init → yandex-calendar / yandex-wiki / yandex-mail MCP
2026-07-16  jira + wiki-mock + confluence; первый onboarding-оркестратор
2026-07-17  stepik + onboarding-mcp; HITL «ОК»; welcome как шаг
2026-07-18  split: skills + buddy-mcp; drop onboarding/yandex-wiki MCP
            Excel ИС, вложения почты, enroll, update attendees
            синхронизация этапных skills с MCP; README/спеки
2026-07-19  mail/calendar → Gmail + Google Calendar (Yandex в profile)
            e2e-прогоны → knowledge lessons → HITL refactor 0.5.3
            видеозапись пайплайна на usr_r3s7t9
```

Ключевые коммиты-вехи:

| Commit | Смысл |
|--------|--------|
| `80b962b` | init project |
| `34e286b` / `0aa512d` | первые «руки»: calendar + mail (Yandex) |
| `d0dc16b` | оркестратор + контракт пайплайна |
| `eaff171` | отказ от onboarding-mcp; логика в skills |
| `5c2bdbe` | этапы skills ↔ реальные MCP tools |
| `2cc1a63` | переход на Google-стек для демо-надёжности |

---

## 3. Фазы обучения агента

Ниже — не «идеальный план», а фактический путь: запрос → поломка / недопонимание → урок → артефакт в репо.

### Фаза A. Платформа Ouroboros (15 июля)

**Чему учились:** что коммитить в хакатон-репо (`skills/`, `mcp/`, knowledge), а что живёт в runtime (`workspace/`, outcomes, локальный `docker-compose.yml`).

**Урок:** MCP доступны в **task**, не в ephemeral-чате (`memory/knowledge/ouroboros_mcp_tasks.md`).

Логи: [Деплой Ouroboros](0dff0f7a-58d7-47f7-8de3-5f3044c4c6e8), [Yandex MCP стек](346c7f7d-1f6b-4a8d-8da4-24a64656d1af).

### Фаза B. Первые интеграции и privacy-модель (15–16 июля)

Появились calendar → wiki → mail → Jira / Confluence / wiki-mock. Зафиксирована схема: агент шлёт opaque `usr_*`, MCP раскрывает адрес внутри себя.

**Уроки:**

- Schema MCP важнее «красивого промпта» (`duration_minutes` vs `end` в календаре).
- Stepik: каталог Excel + **mock enroll** достаточно для MVP (полный API не нужен).

Логи: [Stepik API](13448113-f547-4e7a-8ba3-b3bf418fa9cb), [Курсы Excel](016237cf-03b6-4210-beba-b5bd1b9c9ef3).

### Фаза C. Спецификация 6-этапного пайплайна (17–18 июля)

Сформированы целевое поведение и контекст разработки (см. `README.md`: `ONBOARDING_AGENT_PROMPTS.md`, `ONBOARDING_AGENT_DEVELOPMENT_CONTEXT.md`, `OUROBOROS_DEV.md`).

Ранний онбординг-skill вёл «классический сценарий» с HITL по «ОК»; welcome сначала был шагом 1 — позже порядок стал продуктовым: доступы → бадди → welcome → встречи → курсы → ИС.

**Урок:** capability привязывать к **живым** tool names MCP, не выдумывать API в промпте.

Логи: [Онбординг промпты и e2e](9fe8f159-1a83-41ad-a48b-5c1fc14fa52d), [Участники и аккаунты](4de3f8fa-29c7-4491-8dba-34cb369977d4).

### Фаза D. Skills вместо onboarding-mcp (18 июля)

`onboarding-mcp` и `yandex-wiki-mcp` убраны: предметная логика — в этапных skills, wiki — mock/Confluence, подбор бадди — отдельный `buddy-mcp`.

**Урок для review в Ouroboros:** skill должен быть самодостаточен (без внешних «§ knowledge» в payload) — иначе triad review ставит blockers.

Логи: [Удаление onboarding-mcp](f0416b90-2125-4893-932a-19600f544de4), [MCP и этапы пайплайна](7f3e232d-0733-4622-bc89-fdbd7087f5d1).

### Фаза E. Сеть Yandex → миграция на Google (18–19 июля)

Yandex IMAP работал, SMTP зависал; VPN ломал либо SMTP, либо OpenRouter.

**Урок:** сетевой split-brain нельзя починить скиллом. Для демо — **Gmail + Google Calendar** (`2cc1a63`); Yandex остаётся за compose-profile `yandex`.

Логи: [VPN/SMTP Yandex](229e95b1-76a8-4338-b068-d9b608e106f8).

### Фаза F. Первый e2e и инфраструктурные «ложные поломки» (19 июля)

Hire **`usr_k1m2n3`**. Падали воркеры (signal 9), путались scopes, зависал SMTP.

| Симптом | Настоящая причина | Урок агента |
|---------|-------------------|-------------|
| «ONB 404» | UI-проект Ouroboros `onb` ≠ Jira key | Jira: `SCRUM`; не звать `ensure_project_scope` на hire |
| Worker crash / zombie | Ouroboros + Docker lifeline | Не panic-ретраить; продолжать со `state.json` |
| Send «висит» | Yandex SMTP timeout | Переход на Gmail; Sent-аудит только при timeout |

Knowledge: `onboarding_ambiguity_lessons.md` → разделы «Зацикливание / zombie task», «Проектные scope».

### Фаза G. Shared mailbox, reverse-mask, Jira assignee (19 июля)

Hire **`usr_p8q2w4`** (попытка чистой записи).

Ключевые поломки → фиксы:

1. **Письмо ушло, агент считает fail** — `accepted=["self"]` на shared mailbox.  
   → Успех = `messageId` + непустой `accepted`; `self` не BLOCK.

2. **Expand opaque id на send → агент видит email в Sent** — privacy panic.  
   → Обратное маскирование на read (`get_message` / `list_messages`).

3. **Этап 1 с attachment** — лишний файл в заявке на доступы.  
   → Этап 1: только `subject`+`text`; xlsx только на этапе 6.

4. **Jira без нужного assignee / fuzzy по email** —  
   → `jira_account_id` в `accounts.csv`; только `jira_create_onboarding_plan(assignee_id=…)`.

5. **Самодельный Excel ~3KB** —  
   → только `jira_build_probation_goals_xlsx`.

### Фаза H. HITL: от тяжёлой PREPARED-цепочки к демо-скорости (19 июля)

Сначала зафиксировали двухфазный write (`PREPARED` → `PENDING` → execute). На записи это оказалось слишком медленно и шумно.

**Итоговый контракт (orchestrator 0.5.3 + pipeline_rules §0 / §8):**

- остановки: запуск + черновики **1, 2, 4, 5, 6**;
- welcome — **auto**;
- один draft-вызов + один authorized execute;
- старт ≠ OK на доступы;
- для чистой записи — **новый hire / новый task**.

Параллельно всплыл критический ложный баг: все MCP → `SAFETY_VIOLATION`, потому что LIGHT-модель (`aion-3.0-mini`) не принимает `reasoning_effort="none"`. Чинится сменой `OUROBOROS_MODEL_LIGHT`, не skills (`safety_check_model_errors.md`).

### Фаза I. Финальная запись (19 июля, вечер)

Hire **`usr_r3s7t9`**. Пайплайн заснят end-to-end. Skills и knowledge приведены к спокойному контракту без «анти-скип» ужесточений.

Скрипт записи: `workspace/examples/onboarding-e2e-interactive-prompt.md`.

---

## 4. Карта hire-id (эксперименты)

```text
usr_k1m2n3  — первый e2e (краши, Yandex→Gmail, ONB vs SCRUM)
usr_p8q2w4  — запись #1 (shared mailbox /self, attachments stage 1)
usr_r3s7t9  — финальная видеозапись (после HITL 0.5.3 + LIGHT fix)
```

Правило: stale `state.json` ломает UX сильнее, чем баг MCP — на запись всегда новый hire.

---

## 5. Чему агент научился (сквозные принципы)

1. **Инфра ≠ бизнес-логика.** Signal 9, SMTP timeout, LIGHT-модель, ephemeral MCP маскируются под «пайплайн сломан». Сначала смотри слой ниже skills.
2. **Opaque id + shared mailbox.** Expand на write, mask на read; `accepted=["self"]` после успешного send — не failure.
3. **HITL экономить.** Редкие остановки; welcome auto; без PREPARED→PENDING и без «продолжать?».
4. **Один SoT на артефакт.** План ИС и Excel — только выделенные Jira MCP tools, не самоделка агента.
5. **Один transport-стек.** По умолчанию Gmail + Google Calendar; Yandex — legacy profile.
6. **Новый hire на чистый прогон.** Не продолжать task с «completed» этапами из прошлой записи.
7. **Knowledge копит боль e2e.** После прогона — короткий запрет в `onboarding_ambiguity_lessons.md`, не эссе в skill.

---

## 6. Артефакты обучения в репозитории

### Runtime-память агента (`memory/knowledge/`)

| Файл | Роль |
|------|------|
| `onboarding_pipeline_rules.md` | Процессный контракт: HITL, скорость, идемпотентность, один execute |
| `onboarding_capability_map.md` | Логические capability → реальные `mcp_*` tools |
| `onboarding_ambiguity_lessons.md` | Запреты после e2e (zombie, mail/self, Jira/xlsx, HITL) |
| `safety_check_model_errors.md` | LIGHT-модель ломает все LLM-gated tools |
| `ouroboros_mcp_tasks.md` | MCP только в task |
| `patterns.md` / `patterns_history.jsonl` | Реестр паттернов из прогонов |
| `improvement-backlog.md` | Evidence-backed долги после e2e |

### Skills

```text
skills/onboarding                 0.5.3   оркестратор
skills/onboarding_access          0.2.3   этап 1
skills/buddy_matching             0.3.1   этап 2
skills/onboarding_welcome         0.2.1   этап 3
skills/onboarding_calendar        0.3.1   этап 4
skills/onboarding_courses         0.3.1   этап 5
skills/onboarding_probation       0.3.1   этап 6
skills/gmail | google_calendar    0.1.0   playbooks Google
skills/yandex_*                   0.4.0   legacy
```

### MCP

| Активные | Legacy (profile `yandex`) |
|----------|---------------------------|
| gmail, google-calendar, buddy, stepik, jira, wiki-mock, confluence | yandex-mail, yandex-calendar |

Удалены из архитектуры: `onboarding-mcp`, `yandex-wiki-mcp`.

### Примеры прогонов

- `workspace/examples/onboarding-trigger-fewshot.md` — классификация START / NOT / AMBIGUOUS  
- `workspace/examples/onboarding-e2e-interactive-prompt.md` — скрипт HITL для записи  

---

## 7. Карта сессий разработки (логи)

| Сессия | Вклад в обучение |
|--------|------------------|
| [Деплой Ouroboros](0dff0f7a-58d7-47f7-8de3-5f3044c4c6e8) | Каркас репо vs runtime |
| [Yandex MCP стек](346c7f7d-1f6b-4a8d-8da4-24a64656d1af) | Первые MCP, task vs chat |
| [MCP и этапы пайплайна](7f3e232d-0733-4622-bc89-fdbd7087f5d1) | Docker MCP, анонимизация, этапы 1–6, Gmail |
| [Онбординг промпты и e2e](9fe8f159-1a83-41ad-a48b-5c1fc14fa52d) | Спека → skills → e2e → HITL → запись |
| [VPN/SMTP Yandex](229e95b1-76a8-4338-b068-d9b608e106f8) | Сетевой конфликт → Google |
| [CRLF / Docker Ouroboros](b0b34bce-5ae4-47cc-bf3b-ef96e0826f31) | Dirty git / restart hygiene |
| [Удаление onboarding-mcp](f0416b90-2125-4893-932a-19600f544de4) | Логика в skills |

Транскрипты лежат в Cursor agent-transcripts; UUID без расширения `.jsonl`.

---

## 8. Открытые долги (ещё не закрыты обучением)

Из backlog / context после записи:

- единый формат opaque ID и YAML целей не только для backend;
- реальное (не mock) enroll в Stepik;
- надёжный read-back assignee из Jira search;
- rollback писем/календаря (сейчас есть `jira_rollback_plan`);
- менее хрупкое обновление `state.json` (меньше серии `edit_text`);
- preflight-render opaque → человекочитаемый draft без утечки email агенту.

---

## 9. Как читать этот путь дальше

1. Продуктовое поведение → этапные `skills/*/SKILL.md` + оркестратор.  
2. Жёсткие запреты после боли → `memory/knowledge/onboarding_ambiguity_lessons.md`.  
3. Какой MCP звать → `onboarding_capability_map.md`.  
4. Как крутить процесс → `onboarding_pipeline_rules.md`.  
5. Как поднять стек → `README.md` + `OUROBOROS_DEV.md`.  
6. Как воспроизвести запись → `workspace/examples/onboarding-e2e-interactive-prompt.md`.

Агент обучался не абстрактными правилами, а циклами **прогон → поломка → короткий запрет в knowledge → правка skill/MCP**. Этот документ — карта тех циклов до успешной видеозаписи пайплайна.
