# HANDOFF — `yandex_calendar_*` MCP

> Самодостаточная инструкция для команды, которая будет внедрять у себя 5 тулов для работы с Яндекс.Календарём через CalDAV: создание / список / изменение / отмена встреч и проверка свободного времени. Использует реальный API `caldav.yandex.ru`, реально шлёт приглашения и отмены attendees по почте.

---

## TL;DR

```powershell
# 1. Перейди в пакет
cd <repo>\mcp_servers\yandex-calendar-mcp

# 2. Поставь зависимости (Node.js, без Bun)
$env:Path = "C:\Users\zvonkov.a\nodejs\node-v24.14.0-win-x64;$env:Path"
npm install

# 3. Положи Yandex-креденшалы в package-local .env
copy .env.example .env
# заполнить YANDEX_LOGIN, YANDEX_APP_PASSWORD
# для HTTP/Docker ещё MCP_AUTH_TOKEN (openssl rand -hex 32)

# 4. Запуск
npm run server          # stdio для Cursor/OpenCode
npm run server:http     # HTTP :3000 (нужен MCP_AUTH_TOKEN)
npm run smoke:discovery # read-only проверка кредов

# 5. Зарегистрируй MCP-сервер в клиенте (см. §4)
```

Если приглашение пришло на ящик attendee — `create_event` работает. Полное acceptance (для прод-деплоя) — прогнать `npm run smoke -- attendee@example.com` (см. §5в) до «SMOKE PASSED» и убедиться, что attendee получил все три письма: **INVITE → UPDATE → CANCEL**. Без этого триплета может быть так, что create работает, а cancel — нет (Yandex-specific quirk, §7.1).

---

## Что это

MCP-сервер на TypeScript/Node.js, который добавляет в твоего AI-ассистента (Claude Desktop / OpenWork / Cursor / любой MCP-клиент) **5 инструментов** для Яндекс.Календаря:

| Тул | Что делает |
|---|---|
| `yandex_calendar_create_event` | Создаёт событие, приглашает attendees (Яндекс шлёт им письмо INVITE). Идемпотентен через `client_token` |
| `yandex_calendar_list_events` | Возвращает список событий за период (до 366 дней). Recurring master показан один раз с флагом |
| `yandex_calendar_update_event` | Меняет поля события (title, время, описание, место, напоминание). Шлёт UPDATE attendees |
| `yandex_calendar_cancel_event` | Отменяет событие: STATUS:CANCELLED → CANCEL email + HTTP DELETE (Yandex-quirk-fix, см. §7) |
| `yandex_calendar_check_availability` | Возвращает busy_blocks в твоём календаре за период (до 92 дней). Фильтрует cancelled / FYI |

Реально работает с реальным CalDAV-эндпоинтом Yandex. Реальные письма уходят attendees. Реальные события появляются в `calendar.yandex.ru` и любых других клиентах, привязанных к этому аккаунту.

**Что НЕ умеет (v1):**
- Yandex 360 Business OAuth (только Basic auth с app password для персональных аккаунтов)
- Несколько календарей одновременно (пишет в один — primary по discovery или указанный в env)
- Recurring events: не создаёт, не обновляет, не отменяет. Existing recurring читает с флагом `is_recurring=true`
- Free/busy внешних attendees (только твой собственный календарь)
- Видеоконференции, attachments, room/resource booking
- TZID кроме `Europe/Moscow` для naive ISO (для других зон — использовать zoned ISO с явным offset)

---

## Шаг 1. Положить папку в `.opencode/mcp_servers/`

Конвенция: MCP-сервера живут в `.opencode/mcp_servers/<имя-сервера>/` в корне проекта.

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path "<workspace>\.opencode\mcp_servers" | Out-Null
Expand-Archive -Path .\yandex-calendar-mcp.zip -DestinationPath "<workspace>\.opencode\mcp_servers\" -Force
```

**macOS / Linux (bash):**

```bash
mkdir -p <workspace>/.opencode/mcp_servers
unzip yandex-calendar-mcp.zip -d <workspace>/.opencode/mcp_servers/
```

Финальная структура:

```
<workspace>/.opencode/mcp_servers/yandex-calendar-mcp/
├── server.ts                          ← MCP entry point (регистрирует все тулы пакета)
├── yandex-calendar.ts                 ← env-cascade для YANDEX_LOGIN/PASSWORD
├── yandex-calendar-client.ts          ← CalDAV-клиент, discovery, idempotency, withTimeout, ETag/If-Match handling
├── yandex-calendar-ical.ts            ← .ics generator (escape, fold, VTIMEZONE)
├── yandex-calendar-ical-parse.ts      ← .ics parser (ical.js wrapper)
├── yandex-calendar-schemas.ts         ← Zod-схемы для входов
├── smoke-yandex-calendar.ts           ← Ручной E2E smoke (см. §5в)
├── package.json
├── bun.lock
└── HANDOFF-yandex-calendar.md         ← этот файл
```

> Если в пакете есть и другие тулы (`where_am_i`, `cargoflow_*`, `tendero_*` для логистики/тендеров) — они работают независимо. Можешь их игнорировать, если не нужны: тулы просто будут видны модели, но ты их не используешь. Удалять файлы не обязательно. Для строгого "только календарь" — обрезать `server.ts` (оставить только `yandex_calendar_*` регистрации) и удалить файлы `where-am-i.ts`, `cargoflow*.ts`, `tendero*.ts`, `fonts/`; зависимости `pdf-lib`/`@pdf-lib/fontkit` тогда можно убрать из `package.json` (cheerio оставить — он нужен calendar'у для XML-парсинга PROPFIND-ответов).

---

## Шаг 2. Зависимости

Нужен **Bun 1.3+**. Проверить: `bun --version`. Поставить: https://bun.sh/docs/installation

```powershell
cd <workspace>\.opencode\mcp_servers\yandex-calendar-mcp
bun install
```

Calendar'у нужны: `@modelcontextprotocol/sdk`, `zod`, `tsdav`, `ical.js`, `cheerio` (для XML парсинга CalDAV responses). Скачаются ~30 пакетов за 5-10 секунд.

Проверить тесты: `bun test` — должно показать `131 pass / 0 fail` (unit-тесты покрывают парсер, генератор, discovery, все 5 client functions с моками tsdav и fetch).

---

## Шаг 3. Получить app password у Яндекса

> ⚠️ **Обычный пароль от аккаунта Яндекса НЕ подойдёт.** Yandex CalDAV (как и почта через сторонние клиенты) требует отдельный **«пароль приложения»** (app password) — 16-символьный одноразово-сгенерированный токен. Это не баг, это политика Yandex для сторонних клиентов с 2FA-аккаунтами.

### Шаг 3.1. Включить 2FA (двухфакторную авторизацию), если ещё нет

Без 2FA Yandex не позволяет создавать пароли приложений вообще — кнопка просто будет неактивна.

1. Открыть **https://id.yandex.ru/** → войти в свой Yandex-аккаунт
2. В левом сайдбаре: **Безопасность** → **Двухфакторная авторизация**
3. Включить (потребуется привязка номера телефона / Yandex Key / push в Yandex Mail приложение)

### Шаг 3.2. Создать app password со scope «Календарь и почта (CalDAV)»

1. Тот же **https://id.yandex.ru/** → **Безопасность** (левый сайдбар) → **Пароли приложений** (или прямая ссылка: https://id.yandex.ru/security/app-passwords). Официальная справка Yandex по паролям приложений: https://yandex.ru/support/id/ru/authorization/app-passwords
2. Кнопка **«Создать новый пароль»** (или «Добавить пароль приложения»)
3. В выпадающем списке выбрать **«Календарь и почта (CalDAV)»**
   - Если в вашем интерфейсе точно такого пункта нет (Yandex периодически меняет UI), выбирайте любой вариант, в названии которого есть **«Календарь»** или **«CalDAV»** — но **не** обычную «Почту» / «IMAP/SMTP» отдельно, и **не** «Другое».
   - Можно **«Все сервисы»** — тоже работает, но даёт лишние права.
4. Дать любое название («OpenWork MCP», «CalDAV», что угодно — для собственной памяти)
5. Yandex покажет **16-символьный пароль** в формате типа `abcd efgh ijkl mnop` (с пробелами для удобочитаемости — при копировании пробелы можно убрать или оставить, наш парсер trim'ит).
6. **СОХРАНИ ЕГО СРАЗУ** — Yandex показывает его ровно один раз. Закроешь окно — придётся пересоздавать.

### Шаг 3.3. Что в итоге

Получишь две строки:
- **`YANDEX_LOGIN`** — твой email Yandex-аккаунта. Формат `name@yandex.ru` или `name@yandex.com` (зависит от региона). Это тот же логин, под которым ты входишь на calendar.yandex.ru.
- **`YANDEX_APP_PASSWORD`** — 16 символов (буквы + цифры). Это **НЕ пароль от аккаунта**, это отдельный сгенерированный токен с CalDAV-scope.

Пример того, что должно быть готово:
```
YANDEX_LOGIN=anya.scenarios@yandex.com
YANDEX_APP_PASSWORD=<16-symbol-app-password>
```

### Шаг 3.4. Типичные грабли

| Симптом | Причина | Лечение |
|---|---|---|
| Кнопка «Создать пароль приложения» неактивна | 2FA не включена | Включить 2FA (§3.1) |
| Создал пароль, но 401 на PROPFIND | App password создан БЕЗ scope «Календарь и почта (CalDAV)» — самая частая причина «креденшалы вроде правильные, но не работает» | Пересоздать пароль с правильным scope, старый можно отозвать там же |
| Использую пароль от аккаунта Yandex — не работает | Аккаунт-пароли запрещены для CalDAV когда включена 2FA | Только app password |
| Скопировал пароль с пробелами — не сработало в env | Yandex показывает пароль с пробелами для удобства; в env-файле они не нужны | Убрать пробелы: `<16-symbol-app-password>` (наш парсер trim'ит ведущие/конечные, но не внутри) |
| Не помню, какой пароль приложения для CalDAV — у меня их несколько | На странице «Пароли приложений» у каждого видно только название и scope, само значение увидеть нельзя | Отозвать и создать заново с понятным названием |

### Где положить креденшалы

Сервер ищет креденшалы в env-каскаде (первая находка побеждает):

1. `process.env.YANDEX_LOGIN` / `YANDEX_APP_PASSWORD` — если выставлены в окружении, где запускается MCP-сервер
2. `mcp_servers/yandex-calendar-mcp/.env` ⭐ **рекомендуется** (package-local)
3. `<workspace>/.opencode/.env`
4. `~/.config/opencode/.env` — глобальный (работает в любом воркспейсе)
5. `~/.openwork/.env`

**Package-local (рекомендуется):**

```
# mcp_servers/yandex-calendar-mcp/.env
YANDEX_LOGIN=me@yandex.ru
YANDEX_APP_PASSWORD=<16-symbol-app-password>
MCP_AUTH_TOKEN=<random-hex>   # для HTTP / Docker
```

Файл должен быть в **UTF-8 без BOM**. **НЕ коммитить в git**.

### Опциональные env-переменные

- `YANDEX_CALDAV_URL` — по умолчанию `https://caldav.yandex.ru/`. Менять только если у тебя Yandex 360 Business с custom endpoint
- `YANDEX_CALDAV_CALENDAR_URL` — explicit URL календаря. Скипает discovery. Используй, если discovery возвращает «multiple writable calendars found and none matched a well-known priority name» — скопируй один URL из diagnostic'а

### Как сервер находит «тот самый» календарь

Если `YANDEX_CALDAV_CALENDAR_URL` не задан, сервер делает discovery-цепочку через 3 PROPFIND-запроса:
1. `PROPFIND` на `caldav.yandex.ru/` → находит principal href
2. `PROPFIND` на principal → находит calendar-home-set href
3. `PROPFIND` на home-set → список календарей с правами

Дальше из writable календарей (имеющих `DAV:bind`) выбирает по приоритету displayname: «Мои события» (новый дефолт Yandex), «Мой календарь» (старый дефолт), «Личный», «My events», «Default», «Calendar», «Personal». Если совпадений нет или несколько одинаковых — возвращает diagnostic с URL'ами, попроси указать явно через `YANDEX_CALDAV_CALENDAR_URL`.

---

## Шаг 4. Регистрация в MCP-клиенте

Везде транспорт по умолчанию — **stdio**. Команда — `node --import tsx <абсолютный-путь>/server.ts`. Для Docker/remote — HTTP (`npm run server:http`, порт 3004 в общем compose).

### OpenCode / OpenWork

`opencode.jsonc` в корне воркспейса:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "yandex-calendar": {
      "command": ["node", "--import", "tsx", "C:/abs/path/to/mcp_servers/yandex-calendar-mcp/server.ts"],
      "type": "local"
    }
  }
}
```

Имя записи `yandex-calendar` можно поменять — под этим именем тулы видны модели.

### Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json` (Windows) или `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "yandex-calendar": {
      "command": "node",
      "args": ["--import", "tsx", "C:/abs/path/to/mcp_servers/yandex-calendar-mcp/server.ts"]
    }
  }
}
```

### Claude Code (CLI)

```powershell
claude mcp add yandex-calendar -- bun run C:/abs/path/to/workspace/.opencode/mcp_servers/yandex-calendar-mcp/server.ts
```

### Cursor / другой клиент

В UI или конфиге клиента указать команду `bun run <abs-path>/server.ts` с типом `stdio`.

После регистрации — **перезапустить клиент**.

---

## Шаг 5. Проверка

### 5а. Что сервер запускается и не падает

`bun run server.ts` не имеет смысла «снаружи» проверять raw-stdin'ом: MCP stdio-сервер требует специфичного JSON-RPC framing'а из MCP SDK, наивные строки JSON через newline у него висят до timeout'а. Поэтому простейший sanity-check — собрать через `bun build`, чтобы убедиться что весь импортный граф валиден.

> ⚠️ **Запускать из корня воркспейса**, а НЕ из папки сервера. На Windows Bun при build из подпапки сканирует parent directory на конфиги и натыкается на EPERM на `.opencode\`, что роняет команду с exit 1. Из корня воркспейса этой проблемы нет.

**Windows (PowerShell):**

```powershell
cd <workspace>                              # ВАЖНО: корень воркспейса, НЕ подпапка пакета
bun build .opencode/mcp_servers/yandex-calendar-mcp/server.ts `
  --target=bun `
  --outdir=.opencode/mcp_servers/yandex-calendar-mcp/.build-check
# проверь что вывод содержит "Bundled NNN modules in NNNms" без ошибок
Remove-Item -Recurse -Force .opencode\mcp_servers\yandex-calendar-mcp\.build-check
```

**macOS / Linux (bash):**

```bash
cd <workspace>
bun build .opencode/mcp_servers/yandex-calendar-mcp/server.ts \
  --target=bun \
  --outdir=.opencode/mcp_servers/yandex-calendar-mcp/.build-check
rm -rf .opencode/mcp_servers/yandex-calendar-mcp/.build-check
```

Должно отбандлить ~550 модулей за пару секунд без TS/import-ошибок (включая `yandex-calendar-*.ts`, `tsdav`, `ical.js`).

Дальше — проверка либо через **MCP Inspector** (`npx @modelcontextprotocol/inspector bun run <abs-path>/server.ts` — поднимает UI, можно нажимать тулы руками), либо сразу §5б через клиент.

### 5б. Тест через клиент

После регистрации и рестарта клиента — фразы в чат:

| Фраза в чат | Что должно произойти |
|---|---|
| «Назначь встречу на завтра в 14:00 на час с attendee@example.com, тема — обзор спринта» | Вызывается `yandex_calendar_create_event`. Attendee получает INVITE-письмо от Яндекса. В ответе модели — uid/href/etag |
| «Что у меня в календаре на следующую неделю?» | `yandex_calendar_list_events` за неделю, выводит список |
| «Перенеси встречу с attendee@example.com на час позже» | Модель сначала находит uid через `list_events`, затем `yandex_calendar_update_event`. Attendee получает UPDATE |
| «Отмени встречу с attendee@example.com завтра» | Аналогично: `list_events` → `yandex_calendar_cancel_event`. Attendee получает CANCEL, событие пропадает из календаря |
| «Я занят с 12:00 до 15:00 завтра, что у меня там?» | `yandex_calendar_check_availability` за указанный период |

### 5в. End-to-end smoke с реальной отправкой (опционально, но рекомендуется)

В пакете лежит `smoke-yandex-calendar.ts` — ручной E2E с интерактивными паузами:

```powershell
cd <workspace>\.opencode\mcp_servers\yandex-calendar-mcp
bun run smoke-yandex-calendar.ts attendee@example.com
```

Скрипт делает create → list → update → cancel → checkAvailability и паузит между шагами с просьбой проверить почту attendee. Финальная фраза — «SMOKE PASSED» + чек-лист («[ ] получен INVITE / UPDATE / CANCEL»).

При любом сбое между create и cancel — finally-блок пытается auto-cancel'нуть тестовое событие. Если auto-cancel тоже упал — печатает `!!! MANUAL CLEANUP REQUIRED !!!` с uid/href; тогда удалить руками через UI Яндекс.Календаря.

---

## Шаг 6. Контракт инструментов

### Общее: время

Все даты — ISO 8601, **либо**:
- **Zoned** — с явным offset: `2026-05-18T12:00:00+03:00`, `2026-05-18T09:00:00Z`, `2026-05-18T14:30:00-05:00`. Любая зона работает. Поле `timezone` не нужно.
- **Naive + Europe/Moscow** — `2026-05-18T12:00:00` + `timezone: "Europe/Moscow"`. **Только Europe/Moscow** для naive в v1; для других зон — использовать zoned форму.

`start`/`end` (или `range_start`/`range_end`) в одном вызове должны быть в **одной форме** (обе zoned или обе naive). Naive без `timezone` — отвергается.

### `yandex_calendar_create_event`

```ts
{
  title: string,                  // 1-200 chars
  start: string,                  // ISO 8601
  end?: string,                   // ISO 8601 — или duration_minutes (но НЕ оба)
  duration_minutes?: number,      // 1-1440
  timezone?: string,              // "Europe/Moscow" если start/end naive
  attendees?: string[],           // emails, max 50
  description?: string,           // max 4000 chars
  location?: string,              // max 500 chars
  reminder_minutes?: number,      // 0-10080 (неделя). null = без напоминания. Default null
  client_token?: string,          // 8-128 chars; СТРОНГЛИ РЕКОМЕНДУЕТСЯ для идемпотентности
}
→ { uid, href, etag, sequence, invite_status, warnings }
```

**Идемпотентность через `client_token`:** если LLM передаёт стабильный токен (например, хеш от `title + start + sorted(attendees)`), повторный вызов в течение 10 минут вернёт закэшированный результат без второго PUT. Без токена — `warnings: ["no_client_token: retries may duplicate"]`.

### `yandex_calendar_list_events`

```ts
{
  range_start: string,            // ISO 8601 — НЕ `from` (LLM мутирует)
  range_end: string,              // ISO 8601 — НЕ `to`
  timezone?: string,
}
→ { events: [{ uid, href, etag, summary, start, end, attendees, status, is_recurring, recurrence_rule? }, ...] }
```

Max диапазон: **366 дней**. Recurring master приходит один раз с `is_recurring: true` и raw `recurrence_rule` — occurrences не раскрываются на этом тулe.

`list_events` **не фильтрует** `STATUS:CANCELLED` — если сервер хранит такие события, они вернутся в выдаче со `status: "CANCELLED"`. На практике у Yandex это редко: наш `cancel_event` после CANCEL-письма делает DELETE (см. §7.1), поэтому свои отменённые события обычно отсутствуют. Можно встретить cancelled-row только если событие было отменено внешним клиентом, который оставил его на сервере без DELETE.

### `yandex_calendar_update_event`

```ts
{
  uid: string,
  href: string,                   // URL события (получен из create или list)
  etag: string,                   // для If-Match — детект конфликтов
  patch: {                        // .strict() — unknown fields рейджектятся
    title?: string,
    start?: string,
    end?: string,
    timezone?: string,
    description?: string,
    location?: string,
    reminder_minutes?: number | null,  // null = очистить, number = заменить, undefined = preserve
  }
}
→ { uid, href, etag, sequence, invite_status, warnings }
```

**Partial-time matrix:**
- `start` только → новый start, **duration сохраняется** (end сдвигается на ту же дельту)
- `end` только → старый start, новый end (duration меняется)
- оба → оба заменяются
- ни одного → time не меняется

**Что нельзя менять через update:** `attendees`. Для смены — отмени и создай заново.

**Recurring events** (events с RRULE/RECURRENCE-ID/EXDATE/RDATE) — отвергаются с `RecurringEventNotSupported`. Редактировать через UI Яндекса.

**Конфликты:** если etag устарел (событие изменено снаружи) → `EventChangedExternally`. Перечитать через list_events.

### `yandex_calendar_cancel_event`

```ts
{
  uid: string,
  href: string,
  etag: string,
  reason?: string,                // прикрепится к DESCRIPTION
}
→ { uid, cancellation: "sent" | "sent_with_warnings", warnings }
```

**Двушаговая отмена** (Yandex-specific):
1. PUT с `STATUS:CANCELLED` + `SEQUENCE++` → Yandex шлёт CANCEL-письмо attendees
2. HTTP DELETE на том же href → визуально убирает событие с календаря

Почему так: Yandex не персистит `STATUS:CANCELLED` в stored .ics, поэтому без DELETE событие останется видимым (и попадёт в `check_availability` как busy). См. §7 — подробности.

Если PUT прошёл, но DELETE упал → `cancellation: "sent_with_warnings"` + `visual_cleanup_failed: ...` warning. CANCEL email уже ушёл; событие надо удалить руками через UI.

### `yandex_calendar_check_availability`

```ts
{
  range_start: string,            // ISO 8601
  range_end: string,               // ISO 8601
  timezone?: string,
}
→ { busy_blocks: [{ start, end, event_uid?, summary? }, ...], warnings: [...] }
```

Max диапазон: **92 дня**. Фильтрует `STATUS:CANCELLED` и `TRANSP:TRANSPARENT` (free/FYI события).

Для recurring — Yandex раскрывает через server-side `<C:expand/>`, каждая occurrence приходит отдельным busy_block. Если какой-то UID не раскрылся — попадает в warnings как `recurrence_not_expanded_for_uid:<UID>` (НЕ как busy_block — лучше «I don't know» чем silent-wrong).

**Только твой собственный календарь.** Yandex не отдаёт free/busy внешних attendees через CalDAV для персональных аккаунтов.

---

## Шаг 7. Yandex-specific особенности

Эти моменты не следуют из CalDAV-стандартов — мы нашли их через реальный smoke против `caldav.yandex.ru` (2026-05-15).

### 7.1. STATUS:CANCELLED не персистится

Когда ты делаешь PUT с `STATUS:CANCELLED` + `SEQUENCE++`, Яндекс:
- ✅ Шлёт CANCEL-письмо attendees (iTIP scheduling работает)
- ❌ **НЕ сохраняет STATUS:CANCELLED** в stored .ics — последующий GET вернёт VEVENT без STATUS line

Это значит:
- Событие остаётся ВИДИМЫМ на твоём календаре (Яндекс показывает его как обычное)
- `check_availability` показывает его как busy

**Решение в v1:** `cancel_event` делает **двушаговую отмену**: PUT (для CANCEL email) → HTTP DELETE (для visual cleanup). DELETE безопасен, потому что scheduling round-trip уже произошёл.

Если делать только DELETE без PUT — Yandex не пошлёт CANCEL email attendees, и они продолжат видеть встречу. Поэтому строгий order: **PUT первым, DELETE только после успешного PUT**.

### 7.2. App password нужен с CalDAV scope

App password без scope «Календарь и почта (CalDAV)» возвращает **401** на PROPFIND даже при валидном пароле и 2FA. Лечится пересозданием пароля с правильным scope. См. §3.

### 7.3. ical.js парсит TZID-events как naive

Если событие хранится как `DTSTART;TZID=Europe/Moscow:20260518T120000`, то `ical.js` отдаёт `parsed.start = "2026-05-18T12:00:00"` (naive, без зоны), а TZID — отдельно через `parsed.timezone`. Наш код это знает; для всех GET-then-PUT флоу (update/cancel) `parsed.timezone` пробрасывается отдельным аргументом.

### 7.4. ETag без кавычек

Yandex иногда возвращает ETag без surrounding double-quotes (`1778836544621--gzip`). RFC 7232 это допускает; наш acquireEtag передаёт значение as-is, If-Match на PUT/DELETE работает.

### 7.5. Yandex's «Не забыть» — todos-collection

PROPFIND на calendar-home-set вернёт и календарь событий («Мои события»), и календарь дел («Не забыть»). Оба с `DAV:bind`, оба считаются writable. Discovery выбирает по приоритету displayname — events-календарь имеет имя из priority list, todos — нет, поэтому будет проигнорирован. Если у тебя нестандартные имена — задай `YANDEX_CALDAV_CALENDAR_URL` явно.

---

## Шаг 8. Troubleshooting

| Симптом | Что делать |
|---|---|
| «Учётные данные Яндекс.Календаря не найдены» | См. §3 — положи `YANDEX_LOGIN`/`YANDEX_APP_PASSWORD` в `<workspace>/.opencode/.env` или глобальный env. Файл — UTF-8 без BOM |
| 401 при первом запросе при наличии креденшалов | App password без CalDAV scope. Создать новый со scope «Календарь и почта (CalDAV)», старый отозвать |
| «Discovery failed» / «no writable calendar found» | App password без CalDAV scope (см. выше), либо аккаунт заблокирован, либо нет календарей |
| «Multiple writable calendars found and none matched» | Discovery нашёл больше одного writable календаря, имена не матчат priority. Скопируй один URL из diagnostic'а в `YANDEX_CALDAV_CALENDAR_URL` |
| Событие создалось, но attendee не получил INVITE | Проверить spam-папку attendee. Если SPAM пустой — Yandex может задерживать iTIP до нескольких минут на free-tier аккаунтах |
| `cancellation: "sent_with_warnings"` + `visual_cleanup_failed: ...` | PUT прошёл (CANCEL email ушёл), DELETE упал. Удалить событие руками через UI Яндекс.Календаря |
| `EventChangedExternally` | Кто-то поменял событие через другой клиент. Перечитать через `list_events`, взять свежий etag, повторить |
| `InvalidTimezone: naive ISO ... requires timezone="Europe/Moscow"` | Передал naive ISO без `timezone`. Или добавить `timezone: "Europe/Moscow"` в запрос, или передать zoned ISO с offset (`+03:00`/`Z`) |
| `BothEndAndDurationGiven` | Передал и `end`, и `duration_minutes`. Выбрать что-то одно |
| `RangeTooLarge: list_events range must be ≤ 366 days` / `check_availability ≤ 92 days` | Слишком широкий период. Запросить меньше |
| `RecurringEventNotSupported` | Пытаешься update/cancel recurring-событие. В v1 не поддерживается — редактировать через UI Яндекса |
| `bun test` падает с EPERM на Windows | Известная косметическая мелочь Bun 1.3.13 — Bun пытается сканировать `.opencode` как тест-файл. Тесты при этом проходят (exit 0). Игнорировать или сузить через `bun test --rootDir=. --pattern='*.test.ts'` |

---

## Шаг 9. Архитектура (для тех, кто будет править код)

```
server.ts
  ├── читает creds из <workspace>/.opencode/.env (через WORKSPACE_ROOT + readYandexCredentials)
  ├── lazy discovery → YANDEX_DISCOVERED_CALENDAR_URL (кэш на жизнь процесса)
  └── 5 server.tool(...) регистраций → handlers вызывают client-функции

yandex-calendar-client.ts
  ├── DiscoveryInput → discoverCalendarUrl: raw PROPFIND chain (principal → home-set → calendars)
  ├── selectCalendarFromCandidates: priority-name match, DAV:bind filter, ambiguity-safe
  ├── createEvent / listEvents / updateEvent / cancelEvent / checkAvailability
  ├── withTimeout — единый AbortController + 15s timeout для всех CalDAV-запросов
  ├── rawGet / rawDelete — для GET/DELETE напрямую (tsdav не имеет fetchCalendarObject singular)
  ├── acquireEtag — PUT header → GET fallback → throw EtagNotReturned
  ├── IdempotencyCache — Map<token, result>, TTL 10 минут
  ├── resolveEventTimes / resolveUpdateTimes — валидация форм + arithmetic offset preservation
  └── ошибки: RecurringEventNotSupported, EventChangedExternally, UidMismatch, EtagNotReturned

yandex-calendar-ical.ts
  ├── escapeText / foldLine (UTF-8-aware, 75 octets) / formatProperty (parameters BEFORE ':')
  ├── toCalDavUtcDateTime — ISO 8601 → YYYYMMDDTHHMMSSZ для time-range/expand
  ├── VTIMEZONE_EUROPE_MOSCOW — статический блок (UTC+3, no DST since 2014)
  └── generateEventIcs — собирает полный VCALENDAR с правильной RFC 5545 разметкой

yandex-calendar-ical-parse.ts
  ├── parseVEvent — обёртка над ical.js, возвращает структуру с TZID, reminderMinutes
  ├── detectRecurring — широкая проверка (RRULE/RECURRENCE-ID/EXDATE/RDATE) для update/cancel reject
  └── detectUnexpandedMaster — узкая (RRULE/RDATE/EXDATE only) для availability warnings

yandex-calendar-schemas.ts
  ├── TimeRangeInput — Zod для (start, end, timezone?) с XOR-валидацией
  └── FromToRangeInput — Zod для (from, to, timezone?) — internal name для validation
```

### Спецификация

Полный design — в `docs/superpowers/specs/2026-05-14-yandex-calendar-mcp-design.md` в корне воркспейса. Там зафиксированы все принятые design decisions, trade-off'ы и Yandex-quirk'и.

### Тесты

`bun test` запускает все unit-тесты (131 на момент написания). Покрытие:
- Парсер: escape/fold/format/timezone/recurrence/VALARM
- iCal generator: RFC 5545 line syntax, VTIMEZONE, STATUS variants
- Client functions: моки tsdav + fetch, все ветки + error paths
- Discovery: namespace-agnostic XML parsing, all branches of selection algorithm
- Schemas: form mismatch, unsupported TZ, range bounds

Live smoke против реального Yandex — отдельным скриптом (`smoke-yandex-calendar.ts`, см. §5в).

---

## Шаг 10. Что нужно для production

Перед deploy на боевой аккаунт:

- [ ] App password создан со scope «Календарь и почта (CalDAV)»
- [ ] Креденшалы в `<workspace>/.opencode/.env` (не коммитятся в git)
- [ ] MCP-сервер зарегистрирован в клиенте, клиент перезапущен
- [ ] `bun test` зелёный (131 pass / 0 fail)
- [ ] Smoke-скрипт прошёл (привет INVITE/UPDATE/CANCEL на тестовый email)
- [ ] Принято: cancelled события у Yandex удаляются физически (через DELETE) — если у вас политика хранить cancelled на календаре для аудита, надо менять `cancelEvent` логику (выкинуть DELETE, принять что они будут видимыми)
- [ ] Принято: recurring события не поддерживаются — пользователи будут получать ошибку при попытке отредактировать повторяющуюся встречу

### Если что-то не работает

1. Запусти smoke вручную (`bun run smoke-yandex-calendar.ts attendee@example.com`) — увидишь точную ошибку
2. Если smoke зелёный, но в чате не работает — проблема в регистрации в клиенте: проверь абсолютный путь в `opencode.jsonc` / `claude_desktop_config.json` и перезапусти клиент
3. Если smoke падает — диагностика в его же выводе подскажет, что чинить (auth scope / network / discovery)

### Поддержка

- Исходный код: открыт, читаемый, ~1000 строк в `yandex-calendar-client.ts` плюс ~500 в helpers
- Тесты — на каждый компонент, плюс integration-моки
- Spec — детальный design doc с rationale всех решений
- HANDOFF (этот файл) + общий `HANDOFF.md` для пакета (если решите оставить и другие тулы)

При баге: воспроизвести через `bun run smoke-yandex-calendar.ts`, скопировать output, открыть issue / написать исходному отправителю с этим логом.
