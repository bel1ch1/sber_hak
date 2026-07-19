# gmail-mcp

Gmail через **Gmail API (HTTPS)** — тот же контракт, что у `yandex-mail-mcp`, без SMTP/IMAP.

| Tool | Назначение |
|------|------------|
| `gmail_verify` | profile + labels |
| `gmail_list_folders` | labels (INBOX, SENT, …) |
| `gmail_list_messages` | заголовки (`uid` = Gmail message id) |
| `gmail_get_message` | тело по `uid` |
| `gmail_send` | отправка + вложения (base64) |

## Креды

Пошагово, куда кликать: **[SETUP_GMAIL.md](./SETUP_GMAIL.md)**.

Кратко: Google Cloud → Enable Gmail API → OAuth consent → Desktop OAuth client → `npm run auth` → `.env`.

## Локально

```powershell
cd mcp/gmail-mcp
copy .env.example .env
# заполнить CLIENT_ID/SECRET, npm run auth → REFRESH_TOKEN
# поправить recipients.csv
npm install
npm run server:http
```

## Docker

Сервис `gmail-mcp` в `docker-compose.mcp.yml`, порт **3009**.

```yaml
# agent.env / Ouroboros MCP list (пример)
{"id":"gmail","name":"gmail","url":"http://gmail-mcp:3000/mcp","transport":"streamable_http","enabled":true}
```

На хосте без Docker network: `http://127.0.0.1:3009/mcp`.

## Privacy

При `MAIL_OBFUSCATION=true` агент работает с opaque id (`usr_employee`, …); реальные адреса только в `recipients.csv`.
