// capture-create-request.ts — fires ONE real yandex_calendar_create_event-equivalent
// call and prints the exact JSON request (tool args) and JSON response (tool output).
// No attendees → no invitation emails are sent. The event IS created on the calendar
// (reversible: cancel it via yandex_calendar_cancel_event or the Yandex UI).
import path from "node:path"
import { fileURLToPath } from "node:url"
import { IdempotencyCache, createEvent, discoverCalendarUrl } from "./yandex-calendar-client.ts"
import {
  readYandexCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-calendar.ts"

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)

const request = {
  title: "Тестовая встреча (можно игнорировать)",
  start: "2026-06-20T15:00:00+03:00",
  duration_minutes: 30,
  description: "Проверка MCP yandex_calendar_create_event — фиксация запроса/ответа.",
  location: "Онлайн",
  reminder_minutes: 15,
  client_token: "capture-demo-2026-06-16-0001",
}

async function main() {
  await loadPackageEnv(PACKAGE_DIR)
  const creds = await readYandexCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) {
    console.error(formatNoCredentialsError(creds.diagnostic))
    process.exit(1)
  }

  let calendarUrl = creds.calendarUrl
  if (!calendarUrl) {
    const sel = await discoverCalendarUrl({
      caldavUrl: creds.caldavUrl,
      login: creds.login,
      password: creds.password,
    })
    if (!sel.ok) {
      console.error(sel.diagnostic)
      process.exit(1)
    }
    calendarUrl = sel.url
  }

  console.log("=== REQUEST (tool: yandex_calendar_create_event, JSON args) ===")
  console.log(JSON.stringify(request, null, 2))

  const result = await createEvent({
    caldavUrl: creds.caldavUrl,
    calendarUrl,
    login: creds.login,
    password: creds.password,
    cache: new IdempotencyCache(10 * 60 * 1000),
    input: request,
  })

  console.log("\n=== RESPONSE (tool output, JSON) ===")
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error("\nCREATE FAILED:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
