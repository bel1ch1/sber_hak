# Wiki (mock) MCP-коннектор для Ouroboros

Мок корпоративной вики: отдаёт инфо о компании (команды, политика доступов,
чек-лист онбординга, каталог курсов, стандарты) из локальных markdown-файлов.
**Никакой внешней вики и OAuth не нужно** — обезличенные данные, идеально для демо.
Замена реальной Яндекс.Вики в сценарии онбординга.

Бонус против Яндекс.Вики коллеги: здесь **есть полнотекстовый поиск**.

## Запуск

```bash
cd hackathon
python3 -m venv .venv && ./.venv/bin/pip install -r jira_mcp/requirements.txt  # если venv ещё нет
cd wiki_mock_mcp
MCP_PORT=9102 ../.venv/bin/python server.py     # -> http://127.0.0.1:9102/mcp
```
Тест логики: `../.venv/bin/python test_smoke.py` → `SMOKE OK ✅`.

## Подключение к Ouroboros

Settings → Advanced → MCP:
```json
{ "id": "wiki", "name": "wiki", "url": "http://localhost:9102/mcp", "transport": "streamable_http", "enabled": true }
```
Тулзы всплывут как `mcp_wiki__wiki_search`, `mcp_wiki__wiki_get_page`, `mcp_wiki__wiki_list_pages`.

## Тулзы (все read-only)

| Тул | Что делает |
|-----|-----------|
| `wiki_list_pages` | список всех страниц (slug, title, parent, tags) — начни с него |
| `wiki_search` | полнотекстовый поиск, возвращает slug + title + сниппет |
| `wiki_get_page` | полный markdown страницы по slug |

## Контент (`pages/*.md`)

`company-overview`, `team-payments`, `onboarding-checklist`, `access-policy`,
`buddy-program`, `training-courses`, `dev-standards`.

Каждая страница — markdown с frontmatter (`slug`, `title`, `parent`, `tags`).
Чтобы добавить/поправить знания — просто редактируй/создавай файлы в `pages/`,
перезапуск сервера подхватит.

## Роль в сценарии онбординга

Агент читает вики → понимает контекст (какие доступы нужны backend-разработчику,
какие встречи у команды, какие курсы обязательны) → и на основе этого собирает
план в Jira через [jira-mcp](../jira_mcp/README.md). Два коннектора в одной связке.
