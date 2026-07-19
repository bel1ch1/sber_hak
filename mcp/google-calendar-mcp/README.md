# google-calendar-mcp

Google Calendar API (HTTPS), тот же контракт, что у `yandex-calendar-mcp`.

| Tool | Назначение |
|------|------------|
| `google_calendar_verify` | calendars.get |
| `google_calendar_list_events` | events.list |
| `google_calendar_check_availability` | freebusy.query |
| `google_calendar_create_event` | events.insert + invites |
| `google_calendar_update_event` | events.update |
| `google_calendar_cancel_event` | events.delete |

OAuth: те же `GMAIL_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN`, что у gmail-mcp.
Нужны scopes calendar (+ mail, если один token на оба MCP).

1. Cloud Console → **Library** → **Google Calendar API** → **Enable**
2. Consent → Data Access → добавить `.../auth/calendar` и `.../auth/calendar.events`
3. `npm run auth` в этой папке (или gmail-mcp с обновлёнными scopes) → новый refresh token
4. Docker порт **3010**

```json
{"id":"google_calendar","name":"google-calendar","url":"http://google-calendar-mcp:3000/mcp","transport":"streamable_http","enabled":true}
```
