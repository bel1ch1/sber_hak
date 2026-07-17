# Развернуть Jira MCP-коннектор у себя — с нуля до работающего агента

Гайд для чистой машины (Linux/macOS; Windows — через WSL). Итог: MCP-сервер на
`http://127.0.0.1:9101/mcp`, подключённый к твоей собственной Jira Cloud.

Времени: ~15 минут, из них ~10 — регистрация Jira.

---

## 1. Склонировать репу и поставить зависимости

```bash
git clone git@github.com:bel1ch1/sber_hak.git
cd sber_hak
git switch onboarding-pipeline

cd mcp
python3 -m venv .venv
./.venv/bin/pip install -r jira-mcp/requirements.txt
```

> Внимание: пути в этом гайде — под текущую раскладку репы (`mcp/jira-mcp`,
> venv в `mcp/.venv`). Старый quick-start в `README.md` со путями `hackathon/…`
> устарел.

## 2. Быстрая проверка без Jira (mock-режим)

Можно сразу убедиться, что всё собирается, ещё до регистрации Jira:

```bash
cd jira-mcp
../.venv/bin/python test_smoke.py        # -> SMOKE OK ✅
JIRA_MODE=mock ../.venv/bin/python server.py
# -> http://127.0.0.1:9101/mcp  (Ctrl+C чтобы остановить)
```

## 3. Завести СВОЮ Jira Cloud и СВОЙ API-токен

Нужны 4 значения: URL сайта, email, API-токен, ключ проекта.
Пошагово с картинками и граблями — в соседнем **[SETUP_JIRA_CLOUD.md](SETUP_JIRA_CLOUD.md)**.
Кратко:

1. Бесплатный сайт: https://www.atlassian.com/software/jira/free →
   получишь `https://<твоё-имя>.atlassian.net` (= `JIRA_BASE_URL`).
2. Создай проект (шаблон Scrum), запомни ключ, напр. `PAY` (= `JIRA_PROJECT_KEY`).
3. Токен: https://id.atlassian.com/manage-profile/security/api-tokens →
   **Create API token** (обычный, БЕЗ scopes). Скопируй сразу — второй раз не покажут.

> ⚠️ Токен — строго свой. Atlassian-токен не ограничивается одним проектом:
> это полный API-доступ ко всему аккаунту владельца. Чужой токен не проси и
> свой никому не пересылай — регистрация своего занимает 2 минуты.
> Если нужна ОБЩАЯ доска — пусть владелец сайта пригласит тебя
> (Settings → Site access → Invite), а токен ты всё равно сделаешь свой.

## 4. Заполнить .env

```bash
cp config.example.env .env
```

В `.env` впиши свои значения:

```
JIRA_MODE=real
JIRA_BASE_URL=https://твоё-имя.atlassian.net
JIRA_EMAIL=твой@email
JIRA_API_TOKEN=твой_токен
JIRA_PROJECT_KEY=PAY
MCP_PORT=9101
```

`.env` в `.gitignore` — в репу не попадёт, и пусть так и остаётся.

## 5. Проверить и запустить

```bash
../.venv/bin/python verify_real.py
# Ждём: ✅ Подключение работает. Проект: … , типы задач: [...]

./run_real.sh
# -> [jira-mcp] real mode -> http://127.0.0.1:9101/mcp
```

Если `verify_real.py` ругается — он сам подскажет причину. Частые:

| Симптом | Причина |
|---|---|
| 401 Unauthorized | опечатка в email/токене, или взят «token with scopes» вместо обычного |
| 404 project not found | не тот `JIRA_PROJECT_KEY` (смотри в Project settings → Details) |
| сайт не открывается | из РФ Atlassian бывает недоступен — VPN |

## 6. Подключить к Ouroboros

Settings → Advanced → MCP:

```json
{ "name": "jira", "url": "http://localhost:9101/mcp", "transport": "streamable_http" }
```

Тулзы появятся как `mcp_jira__jira_get_project`,
`mcp_jira__jira_create_onboarding_plan`, … — и агент сможет собирать план
онбординга прямо в твоей доске.

Сервер не демонизируется: держи его в отдельном терминале или запускай
`./run_real.sh &`. После перезагрузки машины — запустить заново.
