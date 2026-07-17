# Запуск yandex-mail-mcp на Linux (из zip, упакованного на Windows)

Два подводных камня и решения:

1. **`.env` с CRLF** (Windows-переводы строк) — `source .env` падает с `$'\r': command not found`.
   Фикс: `sed -i 's/\r$//' .env`

2. **`node_modules` собраны под Windows** — tsx/esbuild падает с
   `@esbuild/win32-x64 ... needs @esbuild/linux-x64`.
   Фикс (без npm ci): запускать готовый бандл, ему esbuild не нужен:
   ```bash
   set -a; source .env; set +a
   node .build-check/server.mjs --http     # -> :3002, GET /healthz
   ```
   Либо честно пересобрать зависимости: `rm -rf node_modules && npm ci`.

Регистрация в Ouroboros:
```json
{ "id": "yandex-mail", "name": "yandex-mail", "url": "http://localhost:3002/mcp", "transport": "streamable_http", "enabled": true }
```
Тулзы всплывут как `mcp_yandex_mail__yandex_mail_*`. После добавления сервера в
работающий Ouroboros нужен мягкий `/restart` (иначе воркеры не увидят тулзы).
