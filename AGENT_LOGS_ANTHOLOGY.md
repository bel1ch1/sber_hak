# Agent logs anthology

Хронологическая антология реплик из Cursor agent transcripts (проект `sber_hak`, июль 2026). Фокус: путь от деплоя Ouroboros до видеозаписи e2e-пайплайна онбординга. Цитаты усечены (~400 символов); tool-payload’ы опущены.

Суммаризация эволюции: [`AGENT_EVOLUTION.md`](AGENT_EVOLUTION.md).

Hire-id по прогонам: `usr_k1m2n3` → `usr_p8q2w4` → `usr_r3s7t9` (финальная запись).

Источник: `C:\Users\andre\.cursor\projects\c-work-sber-hak\agent-transcripts` (приоритетные UUID в заголовках сессий).

---

## Session: Деплой Ouroboros (0dff0f7a-58d7-47f7-8de3-5f3044c4c6e8)

### 2026-07-15 (~утро)

- USER: «Разверни в моем докере автономного агента ouroboros: https://github.com/razzant/ouroboros.»
- ASSISTANT: Разворачивает Ouroboros в Docker; изучает репозиторий и окружение.
- TAGS: deploy, docker, ouroboros

- USER: «Изучи файл @OUROBOROS_DEV.md. В нем примерное описание того, как работать с этим агентом.»
- ASSISTANT: Сжимает модель: skill = политика, MCP = руки, HITL = approve; memory/knowledge накапливает контекст между прогонами.
- TAGS: architecture, skills, mcp, HITL

- USER: «Сейчас нужно создать мой репозиторий… оставь видимыми только 3 файла… Нужен удобный репозиторий для хакатона… пайплайн для агента и MCP.»
- ASSISTANT: Готовит hackathon-скелет репо; уточняет, что коммитить vs что живёт в runtime.
- TAGS: repo, hackathon

- USER: «Расскажи зачем нужна папки memory и workspace»
- ASSISTANT: `memory/` — долгая память агента (identity, knowledge, outcomes); `workspace/` — рабочие артефакты задач, не обязательно в shared git.
- TAGS: memory, workspace

- USER: «Необходимо добавить папки в видимость репозитория: mcp и skills… memory и workspace — не уверен для команды.»
- ASSISTANT: Добавляет `mcp` и `skills` в репо; для memory/workspace предлагает схему «не коммитить runtime / outcomes».
- TAGS: mcp, skills, gitignore

---

## Session: Yandex MCP стек (346c7f7d-1f6b-4a8d-8da4-24a64656d1af)

### 2026-07-15

- USER: «Сейчас, необходимо подключить добавленный мной MCP @mcp/yandex-calendar-mcp/ в агента.»
- ASSISTANT: Подключает calendar MCP к Ouroboros; Docker-сборка npm падает по таймауту registry — обход: MCP на хосте `:3000`, 5 tools видны.
- TAGS: calendar, yandex, docker

- USER: «Давай перейдем к созданию нового MCP для Yandex-wiki. Возьми за основу… calendar.»
- ASSISTANT: Клонирует паттерн calendar → wiki MCP; уточняет OAuth + Org ID для wiki.yandex.ru.
- TAGS: wiki, yandex, mcp

- USER: «Сделай mcp для wiki readonly»
- ASSISTANT: Оставляет только read-tools; обновляет конфиг.
- TAGS: wiki, safety

- USER: «почему нельзя получить доступ к wiki теми же кредами, что и к календарю?»
- ASSISTANT: Разные продукты: CalDAV + app password vs Wiki REST OAuth + org id — один набор кредов не подходит.
- TAGS: yandex, auth

- USER: «Вот что пишет агент: … CAPABILITY_OMISSION_MANIFEST • mcp: ephemeral_turn … MCP не выданы… BothEndAndDurationGiven…»
- ASSISTANT: Диагноз: MCP недоступны в ephemeral-чате; плюс конфликт схемы `end` vs `duration_minutes`. Урок: работать в task; schema важнее «красивого промпта».
- TAGS: ouroboros, mcp, calendar, schema

- USER: «Переустанови ouroboros, он начал изменять сам себя, после чего сломался.»
- ASSISTANT: Переустанавливает чистую копию; позже чистит runtime-память по запросу.
- TAGS: ouroboros, deploy, memory

- USER: «ouroboros… создать встречу… BothEndAndDurationGiven: specify exactly one of (end, duration_minutes)…»
- ASSISTANT: Чинит конфликт схемы/валидации `create_event` в calendar MCP.
- TAGS: calendar, bugfix

- USER: «Что нужно для создания mcp для yandex почты?» → «Реализуй такой MCP…»
- ASSISTANT: Реализует `yandex-mail-mcp` по образцу wiki/calendar; коммитит отдельно от фикса calendar.
- TAGS: mail, yandex, smtp

---

## Session: Stepik API (13448113-f547-4e7a-8ba3-b3bf418fa9cb)

### 2026-07-15 (~13:27)

- USER: «Чтобы реализовать mcp для stepick.org, нужна ли платная api? … только официальные источники»
- ASSISTANT: По официальной документации Stepik API доступен; платный «enterprise» для MVP не обязателен.
- TAGS: stepik, mcp

- USER: «Что можно реализовать в mcp stepick в рамках задачи онбординга?»
- ASSISTANT: Для онбординга — каталог + enroll/назначение; полный семантический поиск по ролям в API нет.
- TAGS: stepik, onboarding

- USER: «По твоему варианту, лучше сформировать определенный пул курсов, запомнить их id и уже их предлагать?»
- ASSISTANT: Да — фиксированный mapping role/team → course_ids предсказуемее динамического поиска; соответствует архитектуре skills/knowledge.
- TAGS: stepik, design

---

## Session: Курсы Excel (016237cf-03b6-4210-beba-b5bd1b9c9ef3)

### 2026-07-15 (~16:29)

- USER: «Зайди на stepick и сформируй небольшой excel-файл с курсами для основных ролей… 2-5 курсов на роль»
- ASSISTANT: Собирает Excel-каталог курсов по ролям (основа будущего Stepik MCP / этап courses).
- TAGS: stepik, excel, catalog

---

## Session: Онбординг промпты и e2e (9fe8f159-1a83-41ad-a48b-5c1fc14fa52d)

### 2026-07-18 (~12:06) — спецификация

- USER: «Сейчас работаем только с одним файлом: @ONBOARDING_AGENT_PROMPTS.md… пайплайн: триггер старта… доступы… бадди… welcome… встречи… курсы… план ИС…»
- ASSISTANT: Файл сначала не найден на диске; после повторного чтения задаёт уточнения по HITL, opaque id, confirmations.
- TAGS: prompts, onboarding, HITL

- USER: «1. manager = пользователь приложения… 2. id без ПДн… 3. Да, подтверждение запуска… 4. одного подтверждения на этап достаточно… агент показывает предварительный вариант…»
- ASSISTANT: Фиксирует MVP: последовательные этапы, одно approve на версию этапа, capability-контракты без выдуманных tool names.
- TAGS: HITL, privacy, design

- USER: «перейдем к интеграции… изучить @OUROBOROS_DEV.md… интегрировать правила, скиллы и mcp… Важно! Не нужно лезть в код mcp…»
- ASSISTANT: Интегрирует оркестратор + 6 этапных skills; 7 MCP healthy; skills в `pending` до owner review/enable. Ограничения: Stepik без enroll, mail без вложений (на тот момент).
- TAGS: skills, integration, ouroboros

- USER: «❌ Skill review… onboarding_probation — status=blockers…»
- ASSISTANT: Чинит blockers: пути только `task_drive`, preflight Jira/mail; просит повторный review.
- TAGS: skill-review, task_drive

- USER: «Skill review… quorum failure… root model budget exhausted… $19.85 / $20»
- ASSISTANT: Это не баг skill — бюджет review исчерпан; увеличить лимит и перезапустить review того же hash.
- TAGS: skill-review, budget

- USER: «У меня не рестартится агент… 735 dirty entries… checkout на ouroboros…»
- ASSISTANT: Три причины: CRLF (734 файла), `/app/data` внутри git worktree, shallow clone без ветки `ouroboros`. Фикс: volume data вне `/app`, fetch `ouroboros`, LF.
- TAGS: ouroboros, docker, git

### 2026-07-18 — валидация skills

- USER: «Проверь, чтобы к агенту были подключены только актуальные скиллы и mcp, без старых…»
- ASSISTANT: Актуальные 9 skills + 7 MCP; старые `yandex_wiki` / `onboarding-mcp` отсутствуют; skills ещё disabled до review.
- TAGS: mcp, skills

- USER: «Проведи свою валидацию скиллов… по payload самого skill, а не по всему репозиторию…»
- ASSISTANT: Payload-only: 2 critical blockers (outcome вне task_drive; courses без subject/text), 8 advisory; canvas-отчёт.
- TAGS: skill-review, validation

- USER: «Напиши мне стартовый промпт… хочу пройти пайплайн по канону с остановками»
- ASSISTANT: Пишет human-readable e2e prompt + шпаргалку HITL-ответов (`workspace/examples/onboarding-e2e-interactive-prompt.md`).
- TAGS: e2e, HITL, prompts

### 2026-07-19 — первый e2e `usr_k1m2n3`, краши

- USER: «❌ Task … worker process crashed (signal 9)…»
- ASSISTANT: Signal 9 ≈ OOM/kill; копает логи задачи.
- TAGS: ouroboros, crash, infra

- USER: «Frequent worker crashes. Multiprocessing workers disabled…» / «лучше пересобрать ouroboros…»
- ASSISTANT: Апгрейд на v6.72.0; далее: workers делают lifeline-suicide (`ppid<=1` после spawn в Docker) → отключает parent-lifeline.
- TAGS: ouroboros, docker, crash

- USER: «TOOL_ERROR (ensure_project_scope): already scoped to project 'onb'… cannot re-scope to 'onboarding-usr_k1m2n3'… LIST_FILES_ERROR: Directory not found: onboarding»
- ASSISTANT: Путаница UI-проекта `onb` и путей state; правит skills/промпты под `task_drive`.
- TAGS: scope, task_drive, e2e

- USER: «Почему в jira был выбран проект ONB? … jira_get_project → 404…»
- ASSISTANT: ONB пришёл из стартового промпта; UI `onb` ≠ Jira key. Рабочий ключ — `SCRUM`. Не звать ensure_project_scope на hire.
- TAGS: jira, ONB, SCRUM, ambiguity

- USER: «UnknownRecipientId… usr_hr…» / «все роли должны направлять на одну и ту же почту… агент не должен об этом знать»
- ASSISTANT: Добавляет opaque id в CSV MCP на один demo-ящик; агент шлёт разные `usr_*`.
- TAGS: privacy, mail, opaque-id

- USER: «Судя по всему не отвечающая почта заблокировала выполнение агента…»
- ASSISTANT: Перезапускает Ouroboros; SMTP timeout — инфраструктура, не бизнес-логика этапа.
- TAGS: smtp, yandex, zombie

- USER: «У меня появился новый mcp на замену неработающему yandex. Как начать тестирование заново?»
- ASSISTANT: Переключает e2e на Gmail MCP; выравнивает recipients на `andreyzv5555@gmail.com`.
- TAGS: gmail, e2e, migration

### 2026-07-19 — privacy / reverse-mask / shared mailbox

- USER: «Оговорка по приватности: … opaque ID в subject/body были развернуты…»
- ASSISTANT: Expand на write — штатно внутри MCP; агент паникует зря. Нужен reverse-mask на read.
- TAGS: privacy, gmail, reverse-mask

- USER: «Реализуй обратное маскирование»
- ASSISTANT: Добавляет email→`usr_*` в `get_message` / list при чтении Gmail.
- TAGS: gmail, reverse-mask, privacy

- USER: «Мне кажется агент зациклился» / «агент не отвечает» / «завис… больше 10 минут»
- ASSISTANT: Не tool-loop: этап 1 уже sent, ждёт HITL buddy; UI крутит thinking. Stop + короткий OK; при зависании — restart и продолжить со `state.json`.
- TAGS: HITL, zombie, e2e

- USER: «файл на испытательный срок, похоже поврежден… задачи в jira… не назначились на мой аккаунт»
- ASSISTANT: Assignee из `accounts.csv`/`jira_account_id`; fuzzy по email ошибочно брал API-user. Нужен явный Account ID (Bell).
- TAGS: jira, assignee, xlsx

- USER: «В jira у меня данные аккаунта - Bell andreyzv5555@gmail.com» + reverse-mask при чтении
- ASSISTANT: Прописывает Bell + маскировку assignee в ответах Jira MCP.
- TAGS: jira, privacy, reverse-mask

### 2026-07-19 — запись #1 `usr_p8q2w4`, ложные BLOCK

- USER: «Чтобы записать видео чище, можно создать новое окружение?»
- ASSISTANT: Да — новый hire / чистый task; rollback Jira/calendar перед записью.
- TAGS: e2e, video, cleanup

- USER: «Что за подстава: … messageId есть… но accepted=["self"]… этап заблокирован… usr_p8q2w4»
- ASSISTANT: Shared mailbox + reverse-mask превращает to=`usr_hr` в `self`. Успех = `messageId` + непустой accepted; `self` ≠ BLOCK. Чинит маскировку accepted/SENT.
- TAGS: gmail, self, shared-mailbox, bugfix

- USER: «Перепроверь все подобные проблемы… чтобы я записал полный видео ролик без таких проблем.»
- ASSISTANT: Аудит MCP/skills на ложные блокировки shared mailbox / self / reverse-mask.
- TAGS: e2e, video, safety

- USER: «рефакторинг… задачи выполняются очень медленно… пропала идея уточнять у пользователя только на определенных этапах»
- ASSISTANT: Сверяет HITL с DEVELOPMENT_CONTEXT; целится в редкие остановки + welcome auto.
- TAGS: HITL, refactor

- USER: «при первом этапе формирования доступов… пришло вложение»
- ASSISTANT: Этап 1 — только subject+text; xlsx только на этапе 6. Чинит skill/send.
- TAGS: attachments, access, mail

- USER: «Зачем ты все сломал? … ⚠️ SAFETY_VIOLATION…»
- ASSISTANT: Не календарь: API `Reasoning is mandatory` / LIGHT-модель (`aion-3.0-mini`) ломает LLM-gated tools. Чинится сменой `OUROBOROS_MODEL_LIGHT`, не skills.
- TAGS: SAFETY_VIOLATION, LIGHT, infra

- USER: «агент не вывел список доступов… перешел к этапу бадди»
- ASSISTANT: Проверяет state — пропуск draft этапа 1; возвращает контракт «черновик → OK → execute».
- TAGS: HITL, access, regression

- USER: «Не нужно ужесточать. Нужно провести плавный рефакторинг… Ранее работало!!!»
- ASSISTANT: Откатывает жёсткие anti-skip; оркестратор 0.5.x — один draft + один authorized execute; welcome auto.
- TAGS: HITL, refactor, pipeline

### 2026-07-19 (~вечер) — пайплайн заснят + journey

- USER: «Отлично! Пайплайн заснят. Придумай текст для описания каждого этапа пайплайна для видео»
- ASSISTANT: Пишет voice-over по этапам 0–6 под запись (`usr_r3s7t9`).
- TAGS: video, pipeline, e2e

- USER: «Сформируй описание проделанного пути… путь обучения агента… в MD файл»
- ASSISTANT: Создаёт `ONBOARDING_AGENT_JOURNEY.md` из репо + knowledge + логов.
- TAGS: journey, docs

- USER: «Закоммить»
- ASSISTANT: Whitelist journey в `.gitignore`, коммит пайплайна/документации.
- TAGS: git

- USER: «сформировать артефакт - эволюция и обучение агента… в одном md… в другом — логи агента»
- ASSISTANT: (эта сессия) антология логов + evolution MD.
- TAGS: anthology, docs

---

## Session: Удаление onboarding-mcp (f0416b90-2125-4893-932a-19600f544de4)

### 2026-07-18 (~10:44)

- USER: «Изучи @mcp/onboarding-mcp/. Что это такое?»
- ASSISTANT: Это ранний MCP с предметной логикой онбординга внутри tools — дублирует будущие skills.
- TAGS: onboarding-mcp, design

- USER: «Убери его, он противоречит плану. Промпты нужно задавать через skills… Просто убери этот mcp»
- ASSISTANT: Удаляет `onboarding-mcp` и ссылки; логика остаётся в этапных skills.
- TAGS: skills, mcp, refactor

---

## Session: Участники и аккаунты (4de3f8fa-29c7-4491-8dba-34cb369977d4)

### 2026-07-18 (~13:31)

- USER: «…минимальное количество участников… для jira, календаря, почты… список бадди не в счет… один аккаунт…»
- ASSISTANT: Минимальный набор opaque ролей (employee/manager/hr/buddy) → один shared mailbox + отдельный Jira account для assignee; buddy-mcp без реальной multi-user интеграции.
- TAGS: accounts, privacy, jira, mail

---

## Session: Docker Ouroboros fix (b0b34bce-5ae4-47cc-bf3b-ef96e0826f31)

### 2026-07-18 (~15:20)

- USER: «Закоммить все текущие изменения…»
- ASSISTANT: Коммитит без секретов.
- TAGS: git

- USER: «Нужно пересобрать docker… CRLF… /app/data внутри worktree… ветка ouroboros…»
- ASSISTANT: Data volume вне `/app`, checkout `ouroboros`, LF, пересборка с сохранением volume.
- TAGS: docker, ouroboros, deploy

---

## Session: VPN/SMTP Yandex (229e95b1-76a8-4338-b068-d9b608e106f8)

### 2026-07-18 (~22:19) – 2026-07-19

- USER: «Как в приложении happ настроить туннелирование для определенных доменов?»
- ASSISTANT: Ищет правила маршрутизации Happ (Proxy/Direct/TUN).
- TAGS: vpn, happ

- USER: «нужно, чтобы программа… могла вызвать… yandex - почту и календарь.» / «yandex_mail_send… TLS… timeout… IMAP живы»
- ASSISTANT: SMTP режется сетью (TLS handshake), не кодом MCP. IMAP/CalDAV ок ≠ SMTP ок.
- TAGS: smtp, yandex, network

- USER: «что и куда поместить в happ?» / «галочки у proxy и tun?»
- ASSISTANT: TUN обязательно; `smtp.yandex.*` → Proxy-правила; IMAP/CalDAV → Direct. Системный Proxy на главной для Docker SMTP недостаточен.
- TAGS: vpn, smtp, happ

- USER: серия «проверь» / «попробуй сейчас» (многократно)
- ASSISTANT: SMTP то оживает (~70ms TLS), то снова timeout — маршрут нестабилен (Happ/антивирус/провайдер).
- TAGS: smtp, flaky

- USER: «Когда включен PROXY — OpenRouter мёртв, Yandex жив; когда TUN — наоборот. Что делать?»
- ASSISTANT: Split-brain: только TUN + routing rules. Proxy в правилах = «через VPN», не галочка Proxy на главной. OpenRouter → Proxy-list; Yandex SMTP/IMAP — по факту рабочей схемы.
- TAGS: vpn, openrouter, yandex, network

- USER: «если openrouter будет в прокси, то к нему нельзя… он работает только с vpn»
- ASSISTANT: Путаница терминов: список Proxy в правилах = гнать через VPN — как раз то, что нужно для OpenRouter.
- TAGS: vpn, openrouter

---

## Session: MCP и этапы пайплайна (7f3e232d-0733-4622-bc89-fdbd7087f5d1)

### 2026-07-18 (~10:28) — Jira + compose

- USER: «Мне нужно развернуть свой jira, чтобы протестировать… @mcp/jira-mcp/…»
- ASSISTANT: Для Cloud достаточно сайта + API token; локальный Jira не обязателен.
- TAGS: jira, mcp

- USER: «Проверь, что все mcp-сервера можно запустить… единый compose… разные порты…»
- ASSISTANT: После сетевых таймаутов сборки — 7 MCP healthy в `docker-compose.mcp.yml`.
- TAGS: docker, mcp

- USER: «Реализуй в каждом mcp проверочную функцию… *_verify… тесты…»
- ASSISTANT: Добавляет verify-tools + smoke; без глубокого troubleshooting кредов — только подсветка fail.
- TAGS: mcp, verify

- USER: «Удали onboarding mcp и yandex-wiki… wiki через файл или Confluence… креды mail/Confluence указал»
- ASSISTANT: Удаляет оба MCP; поднимает Confluence в Docker; mail тоже в smoke.
- TAGS: onboarding-mcp, wiki, confluence

- USER: «Проверь… анонимизация… агент передаёт идентификатор… MCP подставляет данные… один аккаунт для всего»
- ASSISTANT: Внедряет opaque-id → CSV mapping во mail/calendar/jira/confluence; один demo-аккаунт на все роли.
- TAGS: privacy, opaque-id, mcp

- USER: «Проверь работоспособность всех функций всех mcp… таблица…» (+ buddy)
- ASSISTANT: Smoke: buddy/calendar/jira/confluence/wiki-mock/stepik OK; `yandex_mail_send` — SMTP TLS timeout.
- TAGS: smoke, smtp, mcp

- USER: «Почему почта не поддерживает вложения? Можно ли реализовать…?»
- ASSISTANT: Ограничение v0.1 (plain text). Технически — `attachments[{path}]` через nodemailer; позже реализуют.
- TAGS: mail, attachments

- USER: «Stepik не выполняет enrollment; календарь не меняет участников…» / «степик можно… просто список курсов… api не обязательна»
- ASSISTANT: Mock `stepik_enroll` + `update attendees` в calendar; Excel-каталог достаточен для MVP.
- TAGS: stepik, calendar

### 2026-07-18 — этапы skills по одному

- USER: «доработка… первого — подбор доступов. Какие системы входят в список?»
- ASSISTANT: Каталог из access-policy (wiki/Confluence): GitLab, Jira SCRUM, Wiki, K8s, PG, Kafka, Grafana…; позже добавляют VPN, CRM, 1С.
- TAGS: access, wiki

- USER: «в моей компании заявка… @Форма заявки на предоставление прав.html» / «Отправь мне… через mcp»
- ASSISTANT: Повторяет текстовый формат формы; письмо приходит, но id в теле не резолвились → expand ids в text body.
- TAGS: access, mail, HITL

- USER: «почему на почту не пришла заполненная html заявка?»
- ASSISTANT: MCP шлёт plain text как `mailto:` формы; `.html` не прикрепляется.
- TAGS: mail, html

- USER: «приветственное письмо… шаблон в skill или Confluence?»
- ASSISTANT: Гибрид: каркас в skill, контент из Confluence/wiki; после confirm запуска отдельный HITL на welcome не нужен.
- TAGS: welcome, confluence, HITL

- USER: «отправь… приветственное письмо» → SMTP TLS fail → «я запустил docker» → успех
- ASSISTANT: Welcome уходит с `message_id`; контент из wiki; потом компактнее правит «О компании» в Confluence.
- TAGS: welcome, smtp, confluence

- USER: «этап… командные встречи. Как реально реализован?» / «Когда, сколько…?»
- ASSISTANT: Не recurring standup — новые onboarding-события после HITL; правила из wiki; check_availability на owner calendar.
- TAGS: calendar, HITL

- USER: «финальный шаг — план на испытательный… @Задачи на ИС… @План на ИС…» / «excel должен корректно отправляться по почте»
- ASSISTANT: Нужны Jira tools + mail attachments; план/xlsx — выделенные MCP tools, не самоделка агента.
- TAGS: probation, jira, excel, attachments

- USER: «jira_rollback_plan… чтобы повторить пайплайн на запись»
- ASSISTANT: Да — rollback по `onboarding:<hire_id>`; письма/встречи откатываются отдельно.
- TAGS: jira, e2e, video, cleanup

- USER: «Обнови… ONBOARDING_AGENT_PROMPTS… DEVELOPMENT_CONTEXT… README… коммиты» / «Перезапусти все mcp»
- ASSISTANT: Документация + healthy MCP на портах 3004–9103.
- TAGS: docs, docker

### 2026-07-18/19 — Gmail migration + lessons

- USER: «какой ключ проекта jira у меня?» → «SCRUM» / промпт с ONB для `usr_k1m2n3`
- ASSISTANT: В `.env` — `SCRUM`; ONB в e2e-промпте — ошибка шаблона, возвращают на SCRUM + backlog задач.
- TAGS: jira, SCRUM, e2e

- USER: «Почта опять не уходит» (серия проверок)
- ASSISTANT: IMAP ок, SMTP 465/587 greeting timeout — сеть. План Б неизбежен.
- TAGS: smtp, yandex

- USER: «Нужно реализовать план Б… перейти на gmail. Что нужно…»
- ASSISTANT: План Gmail MCP по контракту пайплайна (send/verify/attachments/opaque ids).
- TAGS: gmail, migration

- USER: OAuth walkthrough («Get started»… «Вижу страницу с текстом OK»… «Я ввел email»)
- ASSISTANT: Refresh token в `.env`; `gmail-mcp` healthy `:3009`; yandex_mail выключить в UI.
- TAGS: gmail, oauth

- USER: «Календарь нужно реализовать тоже через gmail» → «готово»
- ASSISTANT: `google-calendar-mcp` `:3010`; оба через Google; можно e2e.
- TAGS: google-calendar, migration

- USER: «отправь… письмо с вложением… поставь встречу…» / «перепиши правила и скиллы… только gmail… закоммить»
- ASSISTANT: Пайплайн на Gmail/Google Calendar; Yandex — legacy profile.
- TAGS: gmail, skills, git

- USER: «в mcp календаря нет замены id на имя… учти обратное маскирование при чтении»
- ASSISTANT: Expand id→login на write, mask на read; позже фикс shared_mailbox_collapsed attendees.
- TAGS: calendar, reverse-mask, privacy

- USER: «агент… attendees только usr_k1m2n3… полная пропагация не подтверждена…»
- ASSISTANT: Google схлопывает одинаковые email; MCP должен возвращать полный набор opaque id; collapsed ≠ BLOCKED.
- TAGS: calendar, shared-mailbox, bugfix

- USER: «добавь в глобальные правила, чтобы агент не так много думал…»
- ASSISTANT: Правило «минимум размышлений — следуй пайплайну» в identity / pipeline_rules / orchestrator.
- TAGS: tokens, pipeline

- USER: «изучи логи агента… рекомендации… чтобы не было неоднозначных ситуаций»
- ASSISTANT: P0 из `onb_usr_k1m2n3_20260804`: calendar 7×create+7×update (~$9); HITL «Начинай»≠execute; mail success=`messageId`+accepted; expandIdsInText штатно. Пишет `onboarding_ambiguity_lessons.md`, правит skills (welcome auto-send).
- TAGS: lessons, HITL, calendar, mail, knowledge

---

## Эпилог (сквозные моменты)

| Момент | Суть | TAGS |
|--------|------|------|
| ephemeral vs task | MCP только в task (`CAPABILITY_OMISSION_MANIFEST: ephemeral_turn`) | ouroboros, mcp |
| Schema calendar | `duration_minutes` XOR `end` | calendar, schema |
| SMTP split-brain | VPN чинит OpenRouter или Yandex SMTP, не оба стабильно | smtp, vpn |
| Signal 9 / lifeline | Инфра Docker ≠ баг этапа | crash, infra |
| ONB vs SCRUM / onb scope | UI project ≠ Jira key | jira, ambiguity |
| Shared mailbox `self` | messageId есть → успех | gmail, self |
| Reverse-mask | Expand write / mask read | privacy |
| SAFETY_VIOLATION LIGHT | Сменить LIGHT-модель, не skills | safety, LIGHT |
| HITL 0.5.3 | Остановки на 0,1,2,4,5,6; welcome auto; один execute | HITL |
| Pipeline filmed | `usr_r3s7t9` + journey MD | video, e2e |

---

*Источник: Cursor agent-transcripts `C:\Users\andre\.cursor\projects\c-work-sber-hak\agent-transcripts`, приоритетные UUID из запроса + смежные onboarding/MCP сессии. ~70 эпизодов.*
