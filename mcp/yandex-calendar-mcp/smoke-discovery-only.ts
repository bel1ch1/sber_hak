// smoke-discovery-only.ts — READ-ONLY credential + calendar discovery check.
// Does NOT create events, send emails, or mutate anything. 3 PROPFIND calls only.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { discoverCalendarUrl } from "./yandex-calendar-client.ts"
import {
  readYandexCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-calendar.ts"

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)

async function main() {
  await loadPackageEnv(PACKAGE_DIR)
  const creds = await readYandexCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) {
    console.error(formatNoCredentialsError(creds.diagnostic))
    process.exit(1)
  }
  console.log("Credentials OK")
  console.log("  login:    ", creds.login)
  console.log("  caldavUrl:", creds.caldavUrl)
  console.log("  explicit calendarUrl:", creds.calendarUrl ?? "(none — will run discovery)")

  if (creds.calendarUrl) {
    console.log("\nExplicit calendar URL set, skipping discovery. DONE.")
    return
  }

  console.log("\nRunning discovery (current-user-principal → calendar-home-set → calendars)...")
  const sel = await discoverCalendarUrl({
    caldavUrl: creds.caldavUrl,
    login: creds.login,
    password: creds.password,
  })
  if (!sel.ok) {
    console.error("\nDISCOVERY FAILED:\n" + sel.diagnostic)
    process.exit(1)
  }
  console.log("\nDISCOVERY OK")
  console.log("  selected calendar:", sel.displayName)
  console.log("  url:              ", sel.url)
  console.log("\nCreds work and a writable calendar was found. No events created, no emails sent.")
}

main().catch((e) => {
  console.error("\nDISCOVERY ERROR:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
