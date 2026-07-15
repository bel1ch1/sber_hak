// save-create-capture.ts — fires ONE real create_event call and SAVES the JSON
// request + response to files. No attendees → no emails. Creates a real event each run.
//
//   npm run capture -- [out-dir]   OR   node --import tsx save-create-capture.ts [out-dir]
//
// Writes <out-dir>/create-input.json and <out-dir>/create-output.json
// (default out-dir = ./captured). The event is reversible via yandex_calendar_cancel_event.
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
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
const OUT_DIR = path.resolve(process.argv[2] ?? path.join(PACKAGE_DIR, "captured"))

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

  const result = await createEvent({
    caldavUrl: creds.caldavUrl,
    calendarUrl,
    login: creds.login,
    password: creds.password,
    cache: new IdempotencyCache(10 * 60 * 1000),
    input: request,
  })

  await mkdir(OUT_DIR, { recursive: true })
  const inputPath = path.join(OUT_DIR, "create-input.json")
  const outputPath = path.join(OUT_DIR, "create-output.json")
  await writeFile(inputPath, JSON.stringify(request, null, 2) + "\n", "utf8")
  await writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8")

  console.log("Saved:")
  console.log("  " + inputPath)
  console.log("  " + outputPath)
}

main().catch((e) => {
  console.error("\nCREATE FAILED:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
