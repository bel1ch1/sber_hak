// server.ts — MCP: Google Calendar API (HTTPS). Tool contract mirrors yandex-calendar-mcp.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { runServer } from "./http-transport.ts"
import { z } from "zod"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  readGoogleCredentials,
  formatNoCredentialsError,
  loadPackageEnv,
  resolveWorkspaceRoot,
} from "./google-config.ts"
import {
  verifyCalendar,
  listEvents,
  checkAvailability,
  createEvent,
  updateEvent,
  cancelEvent,
  parseEventTime,
} from "./google-calendar-client.ts"
import { FromToRangeInput } from "./calendar-schemas.ts"
import {
  accountsCsvPath,
  loadAccounts,
  obfuscationEnabled,
  resolveAttendeeIds,
  maskEmail,
  type AccountDirectory,
} from "./accounts.ts"

function asText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.basename(HERE) === "dist" ? path.dirname(HERE) : HERE
const WORKSPACE_ROOT = resolveWorkspaceRoot(PACKAGE_DIR)
const isMain = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))

let accountsPromise: Promise<AccountDirectory> | null = null

async function getAccounts(): Promise<AccountDirectory> {
  if (!accountsPromise) {
    accountsPromise = loadAccounts(accountsCsvPath(PACKAGE_DIR))
  }
  return accountsPromise
}

async function resolveAttendees(
  ids: string[] | undefined,
): Promise<{ emails?: string[]; error?: string }> {
  if (ids === undefined) return {}
  if (!obfuscationEnabled()) return { emails: ids }
  const dir = await getAccounts()
  const { emails, unknown } = resolveAttendeeIds(dir, ids)
  if (unknown.length) {
    return {
      error:
        `UnknownAttendeeId: ${unknown.join(", ")}. ` +
        "Pass opaque ids from accounts.csv (e.g. usr_employee, usr_buddy), not email addresses.",
    }
  }
  return { emails }
}

function maskEventAttendees<T extends { attendees: string[] }>(dir: AccountDirectory, events: T[]): T[] {
  if (!obfuscationEnabled()) return events
  return events.map((e) => ({
    ...e,
    attendees: e.attendees.map((a) => maskEmail(dir, a)),
  }))
}

async function getCreds() {
  const result = await readGoogleCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
  if (!result.ok) throw new Error(formatNoCredentialsError(result.diagnostic))
  return result.creds
}

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "google-calendar-mcp",
    version: "0.1.0",
  })

  server.tool(
    "google_calendar_create_event",
    "Creates a Google Calendar event. Sends invitations to attendees. " +
      "TIME RULE: start/end ISO 8601 with offset OR naive with timezone=Europe/Moscow. " +
      "end OR duration_minutes (default 60). PRIVACY: attendees are opaque ids from accounts.csv. " +
      "IDEMPOTENCY: pass client_token so retries within 10 minutes don't double-book.",
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
        const creds = await getCreds()
        const result = await createEvent(creds, { ...args, attendees: resolved.emails })
        const dir = await getAccounts()
        if (result.attendees && obfuscationEnabled()) {
          result.attendees = result.attendees.map((a) => maskEmail(dir, a))
        }
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "google_calendar_list_events",
    "Lists Google Calendar events in a time range. ALWAYS pass range_start and range_end (ISO 8601). " +
      "Max range: 366 days. Recurring masters returned with is_recurring=true (not expanded).",
    {
      range_start: z.string(),
      range_end: z.string(),
      timezone: z.string().optional(),
    },
    async (args) => {
      const mapped = { from: args.range_start, to: args.range_end, timezone: args.timezone }
      const parsed = FromToRangeInput.safeParse(mapped)
      if (!parsed.success) return asText("Invalid time range: " + parsed.error.message)
      try {
        const fromMs = parseEventTime(mapped.from, mapped.timezone).getTime()
        const toMs = parseEventTime(mapped.to, mapped.timezone).getTime()
        if (toMs - fromMs > 366 * 24 * 3_600_000) {
          return asText("RangeTooLarge: list_events range must be ≤ 366 days.")
        }
        const creds = await getCreds()
        const events = await listEvents(creds, mapped)
        const dir = await getAccounts()
        return asText(JSON.stringify(maskEventAttendees(dir, events), null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "google_calendar_update_event",
    "Updates a Google Calendar event. Pass uid, href, etag from create/list. " +
      "patch.attendees = full opaque-id replacement when CALENDAR_OBFUSCATION=true. " +
      "Recurring events rejected.",
    {
      uid: z.string(),
      href: z.string().min(1),
      etag: z.string(),
      patch: z
        .object({
          title: z.string().min(1).max(200).optional(),
          start: z.string().optional(),
          end: z.string().optional(),
          timezone: z.string().optional(),
          description: z.string().max(4000).optional(),
          location: z.string().max(500).optional(),
          reminder_minutes: z.number().int().min(0).max(7 * 24 * 60).nullable().optional(),
          attendees: z.array(z.string().min(1).max(64)).max(50).optional(),
        })
        .strict(),
    },
    async (args) => {
      try {
        const creds = await getCreds()
        let patch = args.patch
        if (args.patch.attendees !== undefined) {
          const resolved = await resolveAttendees(args.patch.attendees)
          if (resolved.error) return asText(resolved.error)
          patch = { ...args.patch, attendees: resolved.emails ?? [] }
        }
        const result = await updateEvent(creds, { ...args, patch })
        const dir = await getAccounts()
        if (result.attendees && obfuscationEnabled()) {
          result.attendees = result.attendees.map((a) => maskEmail(dir, a))
        }
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "google_calendar_cancel_event",
    "Cancels a Google Calendar event and notifies attendees. Pass uid, href, etag. Recurring rejected.",
    {
      uid: z.string(),
      href: z.string().min(1),
      etag: z.string(),
      reason: z.string().max(500).optional(),
    },
    async (args) => {
      try {
        const creds = await getCreds()
        const result = await cancelEvent(creds, args)
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "google_calendar_check_availability",
    "Returns busy time blocks on the user's Google Calendar (freeBusy). " +
      "ALWAYS pass range_start and range_end. Max range: 92 days. Does NOT check external attendees.",
    {
      range_start: z.string(),
      range_end: z.string(),
      timezone: z.string().optional(),
    },
    async (args) => {
      const mapped = { from: args.range_start, to: args.range_end, timezone: args.timezone }
      const parsed = FromToRangeInput.safeParse(mapped)
      if (!parsed.success) return asText("Invalid time range: " + parsed.error.message)
      try {
        const fromMs = parseEventTime(mapped.from, mapped.timezone).getTime()
        const toMs = parseEventTime(mapped.to, mapped.timezone).getTime()
        if (toMs - fromMs > 92 * 24 * 3_600_000) {
          return asText("RangeTooLarge: check_availability range must be ≤ 92 days.")
        }
        const creds = await getCreds()
        const result = await checkAvailability(creds, mapped)
        return asText(JSON.stringify(result, null, 2))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "google_calendar_verify",
    "Проверка доступа к Google Calendar API (calendars.get primary). READ-ONLY.",
    {},
    async () => {
      try {
        const result = await readGoogleCredentials(WORKSPACE_ROOT, PACKAGE_DIR)
        if (!result.ok) {
          return asText(JSON.stringify({ ok: false, error: formatNoCredentialsError(result.diagnostic) }, null, 2))
        }
        const v = await verifyCalendar(result.creds)
        return asText(JSON.stringify({ ok: true, ...v }, null, 2))
      } catch (e) {
        return asText(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2))
      }
    },
  )

  return server
}

if (isMain) {
  await loadPackageEnv(PACKAGE_DIR)
  if (process.argv.includes("--http")) {
    process.env.MCP_TRANSPORT = "http"
  }
  await runServer(buildServer, {
    name: "google-calendar-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
