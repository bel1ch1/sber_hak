# Настройка реальной Jira Cloud (free) — пошагово

Цель: получить 4 значения — **URL сайта**, **email**, **API-token**,
**ключ проекта** — вписать их в `.env` и запустить коннектор в режиме `real`.

---

## Шаг 1. Завести бесплатный Jira Cloud (~5 мин)

1. Открой **https://www.atlassian.com/software/jira/free**
2. Нажми **Get it free** / **Try it free**.
3. Войди через Google или зарегистрируй email + пароль, подтверди почту.
4. Придумай имя сайта — Jira создаст адрес вида
   **`https://<твоё-имя>.atlassian.net`**.
   👉 Этот адрес и есть `JIRA_BASE_URL`. Запиши его.
5. Email, которым вошла, — это `JIRA_EMAIL`.

> ⚠️ VPN: если Atlassian не открывается из РФ — включи VPN (как для OpenRouter).

## Шаг 2. Создать проект и узнать его ключ (~3 мин)

1. После регистрации Jira предложит **Create project** — выбери шаблон
   **Scrum** или **Kanban** (раздел Software development). Если не предложила:
   слева вверху **Projects → Create project**.
2. Назови проект, например **Payments**. Jira сама сгенерит **ключ** —
   например `PAY` (2–4 буквы заглавными).
3. Ключ виден: слева в списке проектов, и в адресе доски
   `…/jira/software/projects/**PAY**/board`, и в **Project settings → Details**.
   👉 Это `JIRA_PROJECT_KEY`. Запиши (например `PAY`).

## Шаг 3. Создать API-token (~2 мин)

1. Открой **https://id.atlassian.com/manage-profile/security/api-tokens**
2. Нажми **Create API token** — именно этот, **обычный, БЕЗ scopes**
   (не «Create API token with scopes» — тот для другого способа входа).
3. Дай ему имя, например `ouroboros-jira`, создай.
4. **Скопируй токен сразу** — второй раз он не покажется.
   👉 Это `JIRA_API_TOKEN`.

## Шаг 4. Заполнить .env

```bash
cd mcp/jira-mcp
cp config.example.env .env
uv sync
```
Открой `.env` и впиши свои 4 значения:
```
JIRA_MODE=real
JIRA_BASE_URL=https://твоё-имя.atlassian.net
JIRA_EMAIL=твой@email
JIRA_API_TOKEN=вставь_токен
JIRA_PROJECT_KEY=PAY
MCP_PORT=9101
```
Сохрани файл. (`.env` — локальный, в репозиторий не коммить.)

## Шаг 5. Проверить подключение

```bash
uv run verify_real.py
```
Ждём:
```
✅ Подключение работает. Проект: Payments (PAY), типы задач: [...]
```
Если ❌ — скрипт подскажет что не так (обычно: не тот email, scoped-токен
вместо обычного, опечатка в URL или ключе проекта).

## Шаг 6. Запустить сервер против реальной Jira

```bash
uv run --env-file .env server.py
# или: ./run_real.sh
# -> http://127.0.0.1:9101/mcp
```

## Шаг 7. Подключить к Ouroboros

Settings → Advanced → MCP:
```json
{ "name": "jira", "url": "http://localhost:9101/mcp", "transport": "streamable_http" }
```
Готово — агент увидит `mcp_jira__*` и сможет собирать план онбординга прямо в
твоей Jira.

---

### Что мне прислать, когда сделаешь

Впиши всё в `.env` сама (токен я не читаю) и напиши «готово» — я запущу
`verify_real.py` и `run_real.sh`, проверю подключение и прогоню создание
реального плана из 20 задач в твоём проекте.
