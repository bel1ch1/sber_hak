# Эволюция и обучение агента

Суммаризированная эволюция онбординг-агента по **логам сессий разработки** (Cursor agent transcripts, июль 2026).

Сырые выдержки из логов: [`AGENT_LOGS_ANTHOLOGY.md`](AGENT_LOGS_ANTHOLOGY.md).  
Карта артефактов репозитория: [`ONBOARDING_AGENT_JOURNEY.md`](ONBOARDING_AGENT_JOURNEY.md).

**Итог обучения:** оркестратор `skills/onboarding` **0.5.3** + 6 этапных skills; стек **Gmail / Google Calendar / buddy / Stepik / Jira / wiki-mock / Confluence**; e2e записан на hire **`usr_r3s7t9`**.

---

## 1. Тезис

За пять дней (15–19 июля 2026) агент прошёл путь от «подключить calendar MCP» до полного видеозаписанного пайплайна онбординга. Обучение шло циклами:

```text
прогон → поломка (или ложный баг) → короткий урок в knowledge → правка skill / MCP
```

Главный meta-урок из логов: симптом «пайплайн сломан» чаще оказывается **инфраструктурой** (VPN, zombie task, LIGHT-модель, shared mailbox), а не ошибкой бизнес-скилла.

---

## 2. Эволюция по фазам

| Фаза | Когда | Что выучилось |
|------|-------|----------------|
| **A. Платформа** | 15.07 | Skill = политика, MCP = руки; в git — skills/mcp/memory; workspace — runtime |
| **B. Первые MCP** | 15.07 | Yandex calendar/wiki/mail; MCP только в **task** (`ephemeral_turn`); schema XOR `end`/`duration` |
| **C. Спека пайплайна** | 18.07 | 6 этапов, opaque id, HITL draft→OK; удаление `onboarding-mcp` |
| **D. Интеграции** | 18.07 | buddy, Stepik mock, Jira+Excel, Confluence; privacy через CSV |
| **E. Сеть → Google** | 18–19.07 | SMTP/VPN split-brain нельзя чинить скиллом → Gmail + Google Calendar |
| **F. E2E #1** | 19.07 | `usr_k1m2n3`: signal 9, ONB≠SCRUM, zombie SMTP |
| **G. Privacy** | 19.07 | expand на write / mask на read; calendar roster SoT |
| **H. Запись #1** | 19.07 | `usr_p8q2w4`: `accepted=self`, attachment на этапе 1, Jira assignee |
| **I. Финал** | 19.07 | sparse HITL 0.5.3, LIGHT fix, запись на `usr_r3s7t9` |

Ключевые сессии: [Деплой](0dff0f7a-58d7-47f7-8de3-5f3044c4c6e8) · [Yandex MCP](346c7f7d-1f6b-4a8d-8da4-24a64656d1af) · [MCP и этапы](7f3e232d-0733-4622-bc89-fdbd7087f5d1) · [VPN/SMTP](229e95b1-76a8-4338-b068-d9b608e106f8) · [Промпты и e2e](9fe8f159-1a83-41ad-a48b-5c1fc14fa52d).

---

## 3. Старт → финиш: что «знал» агент

| | В начале | В конце |
|--|----------|---------|
| Архитектура | Есть Ouroboros, идея пайплайна | Skill = политика, MCP = руки; артефакты в `task_drive` |
| Транспорт | Yandex mail/calendar | **Gmail + Google Calendar** (Yandex — legacy) |
| HITL | «OK на каждом шаге», иногда PREPARED→PENDING | Запуск + 1/2/4/5/6; welcome **auto**; один execute |
| Privacy | «без ПДн» как пожелание | Opaque `usr_*` + reverse-mask; shared mailbox штатно |
| Диагностика | Чинить skill при любой ошибке | Сначала: сеть / LIGHT / zombie / scope UI≠Jira |
| Память | Почти пустая | `ambiguity_lessons`, `pipeline_rules`, `capability_map` |

---

## 4. Learning loops (failure → урок)

| # | Симптом в логах | Урок | Куда легло |
|---|-----------------|------|------------|
| 1 | `mcp: ephemeral_turn` | MCP только в task | `ouroboros_mcp_tasks.md` |
| 2 | `BothEndAndDurationGiven` | Schema важнее промпта | calendar MCP / knowledge |
| 3 | SMTP timeout + VPN split | Не чинить скиллом | миграция на Gmail |
| 4 | Worker signal 9 / zombie | Restart → `state.json`, не ретрай EXECUTED | ambiguity lessons |
| 5 | ONB 404 / `ensure_project_scope` | UI `onb` ≠ Jira `SCRUM` | prompts / skills |
| 6 | Email в Sent → privacy panic | Expand write, mask read | gmail/jira obfuscation |
| 7 | `accepted=["self"]` → BLOCK | Успех = `messageId` + `accepted` | skills + lessons |
| 8 | Attachment на этапе 1 | Вложения только на этапе 6 | `onboarding_access` |
| 9 | Jira без assignee / битый xlsx | Только plan + build_xlsx tools | probation skill |
| 10 | PREPARED-цепочка / «продолжать?» | Sparse HITL, один execute | orchestrator 0.5.3 |
| 11 | `SAFETY_VIOLATION` на всех MCP | Сломан LIGHT, не пайплайн | `safety_check_model_errors.md` |
| 12 | 7× create/update calendar | Не overthink warnings | pipeline_rules §0 |

---

## 5. Meta-learning: платформа Ouroboros

Из логов чётко отделены слои:

1. **Ephemeral vs task** — side-effects недоступны в чате без promote; это не «MCP не подняты».
2. **LIGHT + safety** — каждый gated tool идёт через LIGHT с `reasoning_effort=none`; reasoning-only модель валит *все* MCP одинаково.
3. **Zombie / crash** — UI «думает» без tool-логов → инфра; продолжать со state, не panic-loop.
4. **Skill review** — payload должен быть самодостаточным; budget exhaustion ≠ баг skill.
5. **Scope** — проект Ouroboros и ключ Jira — разные сущности.

---

## 6. Итоговая operating model

```text
confirm запуска
  → task + state.json
  → 1 доступы (HITL) → mail manager, без attachment
  → 2 бадди (HITL) → mail buddy
  → 3 welcome (AUTO)
  → 4 встречи (HITL) → Google Calendar
  → 5 курсы (HITL) → Stepik mock + mail
  → 6 ИС (HITL) → Jira plan + xlsx + mail
```

Принципы, которые агент удерживает после обучения:

- редкие HITL-остановки, без «продолжать?»;
- один draft + один authorized write;
- ПДн только внутри MCP;
- один SoT на артефакт (не самодельный Excel / не серия `jira_create_issue`);
- на чистую запись — **новый hire** (`usr_k1m2n3` → `usr_p8q2w4` → `usr_r3s7t9`).

---

## 7. Как читать артефакты

| Файл | Назначение |
|------|------------|
| **Этот файл** | Сжатая эволюция и уроки из логов |
| [`AGENT_LOGS_ANTHOLOGY.md`](AGENT_LOGS_ANTHOLOGY.md) | Хронология USER/ASSISTANT с тегами |
| [`ONBOARDING_AGENT_JOURNEY.md`](ONBOARDING_AGENT_JOURNEY.md) | Путь по репо + git + knowledge |
| `memory/knowledge/onboarding_ambiguity_lessons.md` | Короткие запреты после e2e |
| `skills/onboarding/SKILL.md` | Текущий контракт поведения |

Агент обучался не абстрактными правилами, а столкновениями с реальностью интеграций — и сохранил шрамы в knowledge и skills.
