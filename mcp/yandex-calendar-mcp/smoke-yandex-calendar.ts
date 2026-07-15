// smoke-yandex-calendar.ts
// Manual E2E smoke for Yandex Calendar MCP.
// Run: npm run smoke -- <attendee-email>
//
// Required env: YANDEX_LOGIN, YANDEX_APP_PASSWORD. Optional: YANDEX_CALDAV_URL, YANDEX_CALDAV_CALENDAR_URL.
//
// This script is gating per spec §8.3 — HTTP 201 alone is NOT done. The engineer running it MUST
// observe attendee-side receipt of INVITE, UPDATE, and CANCEL emails to consider the work complete.
//
// SAFETY: this hits a real calendar and sends real emails to <attendee-email>. If any step between
// createEvent and cancelEvent fails, the `finally` block attempts auto-cancel with the last known
// (href, etag). If auto-cancel also fails, the script prints MANUAL CLEANUP REQUIRED with uid/href —
// at that point you must cancel the event in the Yandex Calendar UI yourself.

import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  IdempotencyCache,
  discoverCalendarUrl,
  createEvent,
  listEvents,
  updateEvent,
  cancelEvent,
  checkAvailability,
  type CreateEventResult,
} from "./yandex-calendar-client.ts"
import {
  readYandexCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-calendar.ts"

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)

async function main() {
  const attendee = process.argv[2]
  if (!attendee || !attendee.includes("@")) {
    console.error("Usage: npm run smoke -- <attendee-email>")
    process.exit(2)
  }

  await loadPackageEnv(PACKAGE_DIR)
  const creds = await readYandexCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) {
    console.error(formatNoCredentialsError(creds.diagnostic))
    process.exit(1)
  }

  const sel = creds.calendarUrl
    ? { ok: true as const, url: creds.calendarUrl, displayName: "(env)" }
    : await discoverCalendarUrl({
        caldavUrl: creds.caldavUrl,
        login: creds.login,
        password: creds.password,
      })
  if (!sel.ok) {
    console.error(sel.diagnostic)
    process.exit(1)
  }

  const ctx = {
    caldavUrl: creds.caldavUrl,
    calendarUrl: sel.url,
    login: creds.login,
    password: creds.password,
  }
  const cache = new IdempotencyCache(10 * 60 * 1000)

  const startIso = new Date(Date.now() + 24 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z")
  const endIso = new Date(Date.now() + 24 * 3_600_000 + 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z")

  console.log(`\nUsing calendar: ${sel.url}`)
  console.log(`Login: ${creds.login}`)
  console.log(`Event window: ${startIso} → ${endIso}`)

  // Live-state trackers used by the finally cleanup. We MUST keep latestHref/latestEtag
  // current after every successful mutation so cancel can target the right resource on failure.
  let created: CreateEventResult | undefined
  let latestHref: string | undefined
  let latestEtag: string | undefined
  let cancelled = false

  try {
    console.log("\n=== STEP 1: createEvent ===")
    created = await createEvent({
      ...ctx,
      cache,
      input: {
        title: "Smoke test (please ignore)",
        start: startIso,
        end: endIso,
        attendees: [attendee],
        description: "Automated smoke test for yandex_calendar MCP.",
        client_token: `smoke-${Date.now()}`,
      },
    })
    latestHref = created.href
    latestEtag = created.etag
    console.log("created:", created)
    console.log(`\n>>> Check ${attendee}'s inbox for INVITE email. Press Enter to continue.`)
    await new Promise((r) => process.stdin.once("data", r))

    console.log("\n=== STEP 2: listEvents ===")
    const events = await listEvents({
      ...ctx,
      from: new Date(Date.now() + 23 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      to: new Date(Date.now() + 26 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    })
    const seen = events.find((e) => e.uid === created!.uid)
    if (!seen) {
      console.error("events returned:", events.map((e) => ({ uid: e.uid, summary: e.summary, start: e.start })))
      throw new Error("listEvents did not return the just-created event")
    }
    console.log("listed event present:", seen.uid)

    console.log("\n=== STEP 3: updateEvent (shift +1h) ===")
    const newStart = new Date(Date.now() + 25 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z")
    const updated = await updateEvent({
      ...ctx,
      input: {
        uid: created.uid,
        href: latestHref!,
        etag: latestEtag!,
        patch: { start: newStart },
      },
    })
    latestHref = updated.href
    latestEtag = updated.etag
    console.log("updated:", updated)
    console.log(`\n>>> Check ${attendee}'s inbox for UPDATE email. Press Enter to continue.`)
    await new Promise((r) => process.stdin.once("data", r))

    console.log("\n=== STEP 4: cancelEvent ===")
    const cancelResult = await cancelEvent({
      ...ctx,
      input: { uid: created.uid, href: latestHref!, etag: latestEtag! },
    })
    cancelled = true
    console.log("cancelled:", cancelResult)
    console.log(`\n>>> Check ${attendee}'s inbox for CANCEL email. Press Enter to continue.`)
    await new Promise((r) => process.stdin.once("data", r))

    console.log("\n=== STEP 5: checkAvailability (cancelled event must NOT appear) ===")
    const avail = await checkAvailability({
      ...ctx,
      from: new Date(Date.now() + 23 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      to: new Date(Date.now() + 27 * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    })
    console.log("availability:", avail)
    const stillBusy = avail.busy_blocks.find((b) => b.event_uid === created!.uid)
    if (stillBusy) {
      throw new Error("cancelled event still appears in busy_blocks")
    }
    console.log("cancelled event correctly absent from busy_blocks.")

    console.log("\n=== SMOKE PASSED ===")
    console.log("Acceptance checklist (engineer must confirm):")
    console.log(`  [ ] ${attendee} received INVITE email`)
    console.log(`  [ ] ${attendee} received UPDATE email after step 3`)
    console.log(`  [ ] ${attendee} received CANCEL email after step 4`)
    console.log("All three confirmations are required per spec §8.3 — HTTP 201 alone is NOT done.")
  } finally {
    // Cleanup guard: if we created the event but didn't cancel it (mid-flight failure), try to
    // cancel it now so the test event doesn't stay live with the attendee already invited.
    if (created && !cancelled) {
      console.error("\n⚠ SMOKE FAILED MID-FLIGHT — attempting auto-cleanup of the test event...")
      try {
        await cancelEvent({
          ...ctx,
          input: { uid: created.uid, href: latestHref!, etag: latestEtag! },
        })
        console.error(`Auto-cleanup OK: event ${created.uid} marked STATUS:CANCELLED.`)
        console.error(`Note: ${attendee} already received the INVITE before the failure; they will also receive a CANCEL.`)
      } catch (cleanupErr) {
        console.error("\n!!! MANUAL CLEANUP REQUIRED !!!")
        console.error(`Auto-cancel failed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`)
        console.error(`The test event is STILL ACTIVE on your calendar. Cancel it manually:`)
        console.error(`  uid:  ${created.uid}`)
        console.error(`  href: ${latestHref}`)
        console.error(`  etag: ${latestEtag}`)
        console.error(`  attendee: ${attendee} (already received the INVITE)`)
        console.error(`Open Yandex Calendar UI, find «Smoke test (please ignore)», and cancel it from there.`)
      }
    }
  }
}

main().catch((e) => {
  console.error("\nSMOKE FAILED:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
