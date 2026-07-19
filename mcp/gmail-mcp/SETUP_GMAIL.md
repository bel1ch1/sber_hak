# Куда нажать: креды для Gmail MCP

Нужны три значения в `mcp/gmail-mcp/.env`:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

Ниже — клики в Google Cloud / Google Account.

---

## 1. Проект и Gmail API

1. Открой [Google Cloud Console](https://console.cloud.google.com/).
2. Сверху: **Select a project** → **New Project** → имя (например `ouroboros-gmail`) → **Create**.
3. Меню ☰ → **APIs & Services** → **Library**.
4. Найди **Gmail API** → открой → **Enable**.

## 2. OAuth consent screen

1. ☰ → **APIs & Services** → **OAuth consent screen**.
2. User type: **External** (если личный Gmail) → **Create**.
3. App name: любое (например `Ouroboros Mail MCP`).
4. User support email / Developer contact: свой Gmail → **Save and Continue**.
5. Scopes: **Add or Remove Scopes** → найди и отметь:
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.send`
   - `.../auth/calendar`
   - `.../auth/calendar.events`  
   → **Update** → **Save and Continue**.
6. Test users: **Add Users** → добавь **свой** Gmail (тот, с которого будешь слать) → **Save**.
7. Summary → **Back to Dashboard**.

> Пока приложение в статусе **Testing**, слать/читать может только test user.

## 3. OAuth Client (Client ID + Secret)

1. ☰ → **APIs & Services** → **Credentials**.
2. **+ Create Credentials** → **OAuth client ID**.
3. Application type: **Desktop app** (имя любое) → **Create**.
4. В диалоге скопируй:
   - **Client ID** → `GMAIL_CLIENT_ID`
   - **Client secret** → `GMAIL_CLIENT_SECRET`
5. (Опционально) **Download JSON** — не коммить в git.

Добавь в `mcp/gmail-mcp/.env`:

```env
GMAIL_CLIENT_ID=....apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-....
MAIL_SEND_ENABLED=true
MAIL_OBFUSCATION=true
```

## 4. Refresh token (один раз)

На машине с браузером:

```powershell
cd c:\work\sber_hak\mcp\gmail-mcp
npm install
npm run auth
```

Скрипт:

1. Печатает URL — **открой в браузере**.
2. Войди тем же Google-аккаунтом, что в Test users.
3. Разреши доступ к Gmail.
4. В терминале появится `GMAIL_REFRESH_TOKEN=...` — **допиши в `.env`**.

Redirect URI уже зашит: `http://127.0.0.1:53682/oauth2callback` (для Desktop client Google обычно не требует ручного добавления; если спросит — добавь в клиенте **Authorized redirect URIs**).

## 5. Recipients + Docker

1. В `mcp/gmail-mcp/recipients.csv` поставь **свой Gmail** (или адреса коллег) в колонку `email` для `usr_*`.
2. Подними MCP:

```powershell
cd c:\work\sber_hak
docker compose -f docker-compose.mcp.yml up -d --build gmail-mcp
```

Порт хоста: **3009** → `http://127.0.0.1:3009/mcp` (health: `/healthz`).

В `agent.env` / Ouroboros Settings добавь сервер `gmail` (см. README).

## Если refresh token не пришёл

1. [Google Account → Third-party access](https://myaccount.google.com/permissions) → удали приложение.
2. Снова `npm run auth` (скрипт уже шлёт `prompt=consent`).

## Scopes (что видит агент)

| Scope | Зачем |
|-------|--------|
| `gmail.readonly` | labels, list, get, Sent reconcile |
| `gmail.send` | отправка + вложения |

Календарь по-прежнему через Yandex CalDAV (`yandex-calendar-mcp`), не через этот MCP.
