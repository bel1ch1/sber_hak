# yandex-mail-mcp

MCP-сервер для **Яндекс.Почты** через IMAP (чтение) и SMTP (отправка).

| Инструмент | Что делает |
|---|---|
| `yandex_mail_list_folders` | Список папок IMAP |
| `yandex_mail_list_messages` | Заголовки писем в папке |
| `yandex_mail_get_message` | Тело письма по `uid` + `folder` |
| `yandex_mail_send` | Отправка plain-text письма (SMTP) |

## Auth

Один из вариантов:

- **OAuth** — `YANDEX_MAIL_OAUTH_TOKEN` (scopes `mail:imap_ro` + `mail:smtp`)
- **Пароль приложения** — `YANDEX_MAIL_APP_PASSWORD` (IMAP включён в настройках почты)

Плюс `YANDEX_MAIL_LOGIN` (email ящика).

Креды CalDAV (календарь) и wiki **не подходят**.

Справка: [OAuth в Яндекс Почте](https://yandex.ru/support/yandex-360/business/mail/ru/web/security/oauth)

## Локальный запуск

```powershell
cd mcp/yandex-mail-mcp
copy .env.example .env
npm install
npm run server:http      # HTTP :3002
npm run smoke:discovery
npm test
```

## Ouroboros

```json
{
  "id": "yandex-mail",
  "name": "yandex-mail",
  "url": "http://yandex-mail-mcp:3000/mcp",
  "transport": "streamable_http",
  "enabled": true
}
```

Из Docker-сети `sber_hak_default`: `http://yandex-mail-mcp:3000/mcp`  
С хоста: `http://localhost:3006/mcp`

Playbook: `skills/yandex_mail/SKILL.md`.

## Docker

```bash
docker compose up -d --build yandex-mail-mcp
curl http://localhost:3006/healthz
```

Порт хоста: **3006** → контейнер `3000`.

## Ограничения v0.1

- Только plain-text при отправке (без вложений)
- Нет удаления/перемещения писем
- `MAIL_SEND_ENABLED=false` отключает `yandex_mail_send`
