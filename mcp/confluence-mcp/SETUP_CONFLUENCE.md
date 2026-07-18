# Настройка реальной вики на Confluence Cloud — пошагово

Confluence включается **бесплатно** на твоём существующем сайте
`collar34.atlassian.net` и использует **те же email + API-token**, что и Jira.
В `.env` уже прописаны base_url, email и токен — тебе останется добавить только
**ключ space**.

---

## Шаг 1. Включить Confluence (~3 мин)
1. Открой **https://collar34.atlassian.net/wiki**
2. Если Confluence ещё не активен — Atlassian предложит **добавить Confluence**
   (бесплатный план). Согласись, дождись создания.
   *(Альтернатива: сетка приложений ▦ вверху слева → Confluence.)*

## Шаг 2. Создать space (~2 мин)
1. В Confluence: **Spaces → Create space → Blank/Team space**.
2. Назови, например **«Онбординг»** или **«База знаний»**.
3. Запомни **ключ space** — короткие заглавные буквы (напр. `ONB`).
   Виден в адресе `…/wiki/spaces/`**`ONB`**`/…` и в **Space settings → Details**.

## Шаг 3. Наполнить вики (на выбор)

**Вариант А — руками (интереснее):** в space нажми **Create** и добавь
несколько страниц, например:
- «Политика доступов» (какие системы нужны backend-разработчику)
- «Команда Платёжные сервисы»
- «Чек-лист онбординга»
- «Каталог обучающих курсов»

**Вариант Б — авто из наших мок-страниц:** пропиши ключ space в `.env` и запусти
сидер — он создаст недостающие страницы и **обновит** существующие с тем же title:
```bash
cd mcp/confluence-mcp
python seed_confluence.py
```
(только создать новые, не трогать старые: `python seed_confluence.py --create-only`)  
(откатить: `python seed_confluence.py --wipe`)

В MCP также есть `confluence_update_page` для точечного обновления страницы.

## Шаг 4. Прописать ключ space в .env
Открой `hackathon/confluence_mcp/.env` и впиши:
```
CONFLUENCE_SPACE_KEY=ONB
```
(base_url, email, token уже заполнены — те же, что у Jira.)

## Шаг 5. Проверить подключение
```bash
cd hackathon/confluence_mcp
../.venv/bin/python verify_confluence.py
```
Ждём: `✅ Подключение работает. Найдено space: …` и список страниц.

## Шаг 6. Запустить сервер
```bash
./run.sh          # -> http://127.0.0.1:9103/mcp
```

## Шаг 7. Подключить к Ouroboros
Settings → Advanced → MCP:
```json
{ "id": "confluence", "name": "confluence", "url": "http://localhost:9103/mcp", "transport": "streamable_http", "enabled": true }
```
Агент увидит `mcp_confluence__*` и сможет читать твою реальную вики.

---

### Что мне прислать
Как включишь Confluence и создашь space — просто напиши **ключ space** (напр. `ONB`).
Я впишу его в `.env`, запущу `verify_confluence.py`, при желании залью контент
сидером и подключу к Ouroboros для комбо-демо (вика → Jira).
