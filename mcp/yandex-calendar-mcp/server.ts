// server.ts — MCP server: Яндекс Календарь через CalDAV
// (yandex_calendar_create_event / list_events / update_event / cancel_event /
// check_availability). Выделен из openwork-mcp-tools
// (см. docs/superpowers/specs/2026-07-09-mcp-servers-split-design.md).
// Launch: `npm run server` (Node.js + tsx). Docker: `node dist/server.mjs`.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { runServer } from "./http-transport.ts"
import { z } from "zod"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  readYandexCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./yandex-calendar.ts"
import {
  IdempotencyCache,
  discoverCalendarUrl,
  createEvent,
  listEvents,
  updateEvent,
  cancelEvent,
  checkAvailability,
  isoToUtcMs,
} from "./yandex-calendar-client.ts"
import { FromToRangeInput } from "./yandex-calendar-schemas.ts"
import {
  accountsCsvPath,
  loadAccounts,
  maskEmail,
  obfuscationEnabled,
  resolveAttendeeIds,
  type AccountDirectory,
} from "./accounts.ts"

// ===== shared helpers =====

function asText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

// Docker runs `node dist/server.mjs`: import.meta.url is under /app/dist, but
// package root (`.env`) is /app.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.basename(HERE) === "dist" ? path.dirname(HERE) : HERE
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)
const isMain = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))

// ===== server =====

// ----- Yandex Calendar module state -----
const YANDEX_CACHE = new IdempotencyCache(10 * 60 * 1000)
let YANDEX_DISCOVERED_CALENDAR_URL: string | null = null
let ACCOUNTS_PROMISE: Promise<AccountDirectory> | null = null

async function getAccounts(): Promise<AccountDirectory> {
  if (!ACCOUNTS_PROMISE) {
    ACCOUNTS_PROMISE = loadAccounts(accountsCsvPath(PACKAGE_DIR))
  }
  return ACCOUNTS_PROMISE
}

async function resolveAttendees(raw?: string[]): Promise<{ emails?: string[]; error?: string }> {
  if (!raw?.length) return {}
  if (!obfuscationEnabled()) {
    // Legacy: allow emails directly when obfuscation off
    return { emails: raw }
  }
  const dir = await getAccounts()
  const { emails, unknown } = resolveAttendeeIds(dir, raw)
  if (unknown.length) {
    return {
      error:
        `UnknownAttendeeId: ${unknown.join(", ")}. ` +
        "Pass opaque ids from accounts.csv (e.g. usr_employee, usr_buddy), not email addresses.",
    }
  }
  return { emails }
}

function maskEventAttendees<T extends { attendees?: string[] }>(dir: AccountDirectory, events: T[]): T[] {
  if (!obfuscationEnabled()) return events
  return events.map((ev) => ({
    ...ev,
    attendees: (ev.attendees ?? []).map((a) => maskEmail(dir, a)),
  }))
}

async function getYandexContext() {
  const creds = await readYandexCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!creds.ok) {
    throw new Error(formatNoCredentialsError(creds.diagnostic))
  }
  let calendarUrl = creds.calendarUrl ?? YANDEX_DISCOVERED_CALENDAR_URL
  if (!calendarUrl) {
    const sel = await discoverCalendarUrl({
      caldavUrl: creds.caldavUrl,
      login: creds.login,
      password: creds.password,
    })
    if (!sel.ok) throw new Error(sel.diagnostic)
    calendarUrl = sel.url
    YANDEX_DISCOVERED_CALENDAR_URL = calendarUrl
  }
  return {
    caldavUrl: creds.caldavUrl,
    login: creds.login,
    password: creds.password,
    calendarUrl,
  }
}

// ===== yandex_calendar_* =====

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "yandex-calendar-mcp",
    version: "0.1.0",
  })

  server.tool(
    "yandex_calendar_create_event",
    "Creates a calendar event in the user's Yandex Calendar via CalDAV. Sends invitations to attendees. " +
      "TIME RULE: start/end must both be ISO 8601 with explicit offset (e.g. 2026-05-15T12:00:00+03:00) " +
      "OR both naive with timezone=Europe/Moscow. Other timezones require zoned ISO. " +
      "Specify end OR duration_minutes (default 60 min if neither). If both are sent, duration_minutes wins. " +
      "PRIVACY: attendees are opaque ids from accounts.csv (e.g. usr_employee, usr_buddy), NOT emails. " +
      "IDEMPOTENCY: pass a stable client_token (e.g. SHA-1 of title+start+sorted(attendees)+session-id) " +
      "so retries within 10 minutes don't double-book. " +
      "Does NOT promise external attendee availability — only writes to the user's own calendar.",
    {
      title: z.string().min(1).max(200),
      start: z.string(),
      end: z.string().optional(),
      duration_minutes: z.number().int().min(1).max(1440).optional(),
      timezone: z.string().optional(),
      attendees: z.array(z.string().min(1).max(64)).max(50).optional(),
      description: z.string().max(4000).optional(),
      location: z.string().max(500).optional(),
      reminder_minutes: z.number().int().min(0).max(7 * 24 * 60).nullable().optional(),
      client_token: z.string().min(8).max(128).optional(),
    },
    async (args) => {
      try {
        const resolved = await resolveAttendees(args.attendees)
        if (resolved.error) return asText(resolved.error)
        const ctx = await getYandexContext()
        const result = await createEvent({
          ...ctx,
          cache: YANDEX_CACHE,
          input: { ...args, attendees: resolved.emails },
        })
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_calendar_list_events",
    "Lists events in the user's Yandex Calendar within a time range. " +
      "ALWAYS extract range_start and range_end (both ISO 8601). Time rule per yandex_calendar_create_event. " +
      "Recurring events: master is returned once with is_recurring=true and the raw RRULE; " +
      "individual occurrences are NOT expanded by this tool (use yandex_calendar_check_availability for that). " +
      "Includes STATUS:CANCELLED events so the caller can see cancellation history. Max range: 366 days. " +
      "Does NOT promise external attendee availability — only reads the user's own calendar.",
    {
      range_start: z.string(),
      range_end: z.string(),
      timezone: z.string().optional(),
    },
    async (args) => {
      // Map public MCP arg names (range_start/range_end) → internal {from, to}.
      // Public names avoid `from`/`to` because LLMs in OpenWork have been observed
      // spelling-mutating those (`from1_`, `from11_` — same class of bug as cargoflow's
      // `from_address` → `from1_address`). Internal FromToRangeInput Zod schema and
      // listEvents client function continue to use `from`/`to`.
      const mapped = { from: args.range_start, to: args.range_end, timezone: args.timezone }
      const parsed = FromToRangeInput.safeParse(mapped)
      if (!parsed.success) return asText("Invalid time range: " + parsed.error.message)
      let fromMs: number, toMs: number
      try {
        fromMs = isoToUtcMs(mapped.from, mapped.timezone)
        toMs = isoToUtcMs(mapped.to, mapped.timezone)
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
      if (toMs - fromMs > 366 * 24 * 3_600_000) {
        return asText("RangeTooLarge: list_events range must be ≤ 366 days.")
      }
      try {
        const ctx = await getYandexContext()
        const events = await listEvents({ ...ctx, ...mapped })
        const dir = await getAccounts()
        return asText(JSON.stringify(maskEventAttendees(dir, events), null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_calendar_update_event",
    "Updates an event in the user's Yandex Calendar. Pass uid, href, etag (from create or list). " +
      "Patch fields: title, start, end, timezone, description, location, reminder_minutes. " +
      "TIME RULES (§4.4.1): start without end preserves duration; end without start changes duration; " +
      "both replaces; neither no-op. ATTENDEES CANNOT be changed via this tool — use cancel + create instead. " +
      "RECURRING events are rejected with RecurringEventNotSupported. " +
      "Does NOT promise external attendee availability — only writes to the user's own calendar.",
    {
      uid: z.string(),
      href: z.string().url(),
      etag: z.string(),
      patch: z.object({
        title: z.string().min(1).max(200).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        timezone: z.string().optional(),
        description: z.string().max(4000).optional(),
        location: z.string().max(500).optional(),
        reminder_minutes: z.number().int().min(0).max(7 * 24 * 60).nullable().optional(),
      }).strict(),
    },
    async (args) => {
      try {
        const ctx = await getYandexContext()
        const result = await updateEvent({ ...ctx, input: args })
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_calendar_cancel_event",
    "Cancels an event in the user's Yandex Calendar. Sends CANCEL to attendees. " +
      "Pass uid, href, etag. Optionally pass reason (appended to DESCRIPTION). " +
      "Implementation is two-step: PUT with STATUS:CANCELLED + SEQUENCE++ (triggers Yandex's CANCEL iTIP " +
      "scheduling email to attendees) THEN HTTP DELETE on the same href (visual cleanup — Yandex does NOT " +
      "persist STATUS:CANCELLED in stored .ics, so without DELETE the event remains visible and breaks " +
      "checkAvailability). If PUT succeeds but DELETE fails, returns cancellation=sent_with_warnings + " +
      "visual_cleanup_failed warning (CANCEL email already went out; only visual cleanup failed). " +
      "RECURRING events are rejected. Does NOT promise external attendee availability — only writes to the user's own calendar.",
    {
      uid: z.string(),
      href: z.string().url(),
      etag: z.string(),
      reason: z.string().max(500).optional(),
    },
    async (args) => {
      try {
        const ctx = await getYandexContext()
        const result = await cancelEvent({ ...ctx, input: args })
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_calendar_check_availability",
    "Returns busy time blocks in the user's OWN Yandex Calendar within a time range. " +
      "ALWAYS extract range_start and range_end (both ISO 8601). " +
      "Does NOT check availability of external attendees — Yandex doesn't expose that reliably. " +
      "Filters STATUS:CANCELLED and TRANSP:TRANSPARENT (free/FYI) events out of busy_blocks. " +
      "Recurring events are server-side expanded via <C:expand/>. If expansion fails for some UIDs, " +
      "they appear in warnings as 'recurrence_not_expanded_for_uid:<UID>' rather than as silently-wrong busy blocks. " +
      "Max range: 92 days.",
    {
      range_start: z.string(),
      range_end: z.string(),
      timezone: z.string().optional(),
    },
    async (args) => {
      // See yandex_calendar_list_events for the rationale behind range_start/range_end
      // vs internal from/to.
      const mapped = { from: args.range_start, to: args.range_end, timezone: args.timezone }
      const parsed = FromToRangeInput.safeParse(mapped)
      if (!parsed.success) return asText("Invalid time range: " + parsed.error.message)
      let fromMs: number, toMs: number
      try {
        fromMs = isoToUtcMs(mapped.from, mapped.timezone)
        toMs = isoToUtcMs(mapped.to, mapped.timezone)
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
      if (toMs - fromMs > 92 * 24 * 3_600_000) {
        return asText("RangeTooLarge: check_availability range must be ≤ 92 days.")
      }
      try {
        const ctx = await getYandexContext()
        const result = await checkAvailability({ ...ctx, ...mapped })
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "yandex_calendar_verify",
    "Проверка доступа к Яндекс.Календарю: CalDAV discovery (current-user-principal → calendar). " +
      "READ-ONLY, ничего не создаёт. Возвращает выбранный календарь или диагностику ошибки кредов.",
    {},
    async () => {
      try {
        const creds = await readYandexCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
        if (!creds.ok) {
          return asText(JSON.stringify({ ok: false, error: formatNoCredentialsError(creds.diagnostic) }, null, 2))
        }
        if (creds.calendarUrl) {
          return asText(
            JSON.stringify(
              {
                ok: true,
                mode: "explicit_calendar_url",
                calendar_url: creds.calendarUrl,
                login: creds.login,
              },
              null,
              2,
            ),
          )
        }
        const sel = await discoverCalendarUrl({
          caldavUrl: creds.caldavUrl,
          login: creds.login,
          password: creds.password,
        })
        if (!sel.ok) {
          return asText(JSON.stringify({ ok: false, error: sel.diagnostic }, null, 2))
        }
        YANDEX_DISCOVERED_CALENDAR_URL = sel.url
        return asText(
          JSON.stringify(
            {
              ok: true,
              mode: "discovery",
              calendar_name: sel.displayName,
              calendar_url: sel.url,
              login: creds.login,
            },
            null,
            2,
          ),
        )
      } catch (e) {
        return asText(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2))
      }
    },
  )

  return server
}

// ===== startup =====

if (isMain) {
  await loadPackageEnv(PACKAGE_DIR)
  if (process.argv.includes("--http")) {
    process.env.MCP_TRANSPORT = "http"
  }
  await runServer(buildServer, {
    name: "yandex-calendar-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
