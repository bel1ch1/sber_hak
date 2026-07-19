# stepik-mcp

MCP-сервер: рекомендации курсов **Stepik** для онбординга. Читает каталог курсов
из Excel (`stepik_courses_by_role.xlsx`) и подбирает курсы по роли сотрудника.
Зачисление — локальный mock (`stepik_enroll`), без вызовов Stepik.org API.

| Инструмент | Что делает |
|---|---|
| `stepik_list_roles` | Список ролей в каталоге + число курсов на роль |
| `stepik_get_courses_by_role` | Курсы для роли (JSON). Псевдонимы ролей: IT, QA, PM… |
| `stepik_suggest_onboarding` | Готовый markdown-план с ссылками для сотрудника |
| `stepik_match_role` | Разрешает свободный текст роли в каноничное имя |
| `stepik_enroll` | Фиксирует выбранный список курсов (title/description/url) локально |

## Каталог (Excel)

Путь по умолчанию: `../stepik_courses_by_role.xlsx` (рядом с папкой MCP,
т.е. `ouroboros/stepik_courses_by_role.xlsx`). Переопределяется `STEPIK_CATALOG_PATH`.

Первый лист, колонки-заголовки:

| Колонка | Обязательна | Пример |
|---|---|---|
| `Роль` | да | `IT / Разработка` |
| `Название курса` | да | `Python: основы` |
| `Ссылка` | да | `https://stepik.org/course/93704` (ID тянется из URL) |
| `Описание` | нет | … |
| `Длительность` | нет | `~20 ч` |
| `Уровень` | нет | `Начальный` |

Строки без роли/названия/ссылки пропускаются. Каталог кэшируется на время
жизни процесса — после правки Excel перезапустите сервер.

## Локальный запуск

```bash
cd stepik-mcp
npm install
npm run smoke:catalog     # проверка загрузки каталога
npm test

# HTTP :3003 (на Linux — напрямую, with-ca.cmd только для Windows)
MCP_TRANSPORT=http MCP_HTTP_PORT=3003 node --import tsx server.ts --http
# curl http://localhost:3003/healthz
```

## Ouroboros

```json
{
  "id": "stepik",
  "name": "stepik",
  "url": "http://stepik-mcp:3000/mcp",
  "transport": "streamable_http",
  "enabled": true
}
```

Из Docker-сети `sber_hak_default`: `http://stepik-mcp:3000/mcp`
С хоста: `http://localhost:3003/mcp`

## Ограничения v0.1

- Источник каталога — статичный Excel; онлайн-API Stepik не дёргается
- `stepik_enroll` пишет только локальный `enrollments.json` (mock), не регистрирует на stepik.org
- Матчинг роли по псевдонимам/подстроке; частотное слово `разработчик`
  (в отличие от `разработка`/`IT`) в псевдонимах пока нет — при необходимости
  добавьте в `ROLE_ALIASES` в `stepik-catalog.ts`
