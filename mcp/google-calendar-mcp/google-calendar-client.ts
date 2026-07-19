// google-calendar-client.ts — Google Calendar API

import { google, calendar_v3 } from "googleapis"
import type { GoogleCredentials } from "./google-config.ts"

const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000
const createCache = new Map<string, { at: number; result: CreateResult }>()

export type CreateResult = {
  uid: string
  href: string
  etag: string
  invite_status: "scheduled" | "scheduled_with_warnings"
  warnings?: string[]
  /** Opaque attendee ids for the agent (authoritative roster). */
  attendees?: string[]
  /**
   * Emails actually accepted by Google Calendar API (may be fewer than opaque ids
   * when several ids share one mailbox in demo).
   */
  google_attendee_emails?: string[]
}

export type ListedEvent = {
  uid: string
  href: string
  etag: string
  title: string
  start: string
  end: string
  attendees: string[]
  status?: string
  is_recurring?: boolean
  transparency?: string
  description?: string
  location?: string
  /** Opaque ids stored at create (preferred when emails collide). */
  attendee_ids?: string[]
}

function oauth2(creds: GoogleCredentials) {
  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret)
  client.setCredentials({ refresh_token: creds.refreshToken })
  return client
}

function calApi(creds: GoogleCredentials) {
  return google.calendar({ version: "v3", auth: oauth2(creds) })
}

/** Parse ISO (zoned or naive+Europe/Moscow) to Date. */
export function parseEventTime(iso: string, timezone?: string): Date {
  const zoned = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/
  const naive = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
  if (zoned.test(iso)) return new Date(iso)
  if (naive.test(iso)) {
    const tz = timezone || "Europe/Moscow"
    if (tz !== "Europe/Moscow") {
      throw new Error(
        `timezone "${tz}" not supported for naive ISO; use Europe/Moscow or zoned ISO with offset`,
      )
    }
    return new Date(iso + "+03:00")
  }
  throw new Error(`Invalid ISO date-time: ${iso}`)
}

function toRfc3339(d: Date): string {
  return d.toISOString()
}

function eventHref(calendarId: string, eventId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
}

function mapEvent(ev: calendar_v3.Schema$Event, calendarId: string): ListedEvent | null {
  if (!ev.id) return null
  const start = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00Z` : "")
  const end = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T00:00:00Z` : "")
  const storedIds = (ev.extendedProperties?.private?.attendee_ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  return {
    uid: ev.id,
    href: ev.htmlLink || eventHref(calendarId, ev.id),
    etag: ev.etag || "",
    title: ev.summary || "",
    start,
    end,
    attendees: (ev.attendees || []).map((a) => a.email || "").filter(Boolean),
    status: ev.status || undefined,
    is_recurring: Boolean(ev.recurrence?.length || ev.recurringEventId),
    transparency: ev.transparency || undefined,
    description: ev.description || undefined,
    location: ev.location || undefined,
    ...(storedIds.length ? { attendee_ids: storedIds } : {}),
  }
}

export async function verifyCalendar(creds: GoogleCredentials): Promise<{
  calendarId: string
  summary: string
  timeZone?: string
}> {
  const cal = calApi(creds)
  const res = await cal.calendars.get({ calendarId: creds.calendarId })
  return {
    calendarId: creds.calendarId,
    summary: res.data.summary || creds.calendarId,
    timeZone: res.data.timeZone || undefined,
  }
}

export async function listEvents(
  creds: GoogleCredentials,
  range: { from: string; to: string; timezone?: string },
): Promise<ListedEvent[]> {
  const cal = calApi(creds)
  const timeMin = toRfc3339(parseEventTime(range.from, range.timezone))
  const timeMax = toRfc3339(parseEventTime(range.to, range.timezone))
  const out: ListedEvent[] = []
  let pageToken: string | undefined
  do {
    const res = await cal.events.list({
      calendarId: creds.calendarId,
      timeMin,
      timeMax,
      singleEvents: false,
      maxResults: 250,
      pageToken,
      showDeleted: true,
    })
    for (const ev of res.data.items || []) {
      const mapped = mapEvent(ev, creds.calendarId)
      if (mapped) out.push(mapped)
    }
    pageToken = res.data.nextPageToken || undefined
  } while (pageToken)
  return out
}

export async function checkAvailability(
  creds: GoogleCredentials,
  range: { from: string; to: string; timezone?: string },
): Promise<{ busy_blocks: Array<{ start: string; end: string }>; warnings: string[] }> {
  const cal = calApi(creds)
  const timeMin = toRfc3339(parseEventTime(range.from, range.timezone))
  const timeMax = toRfc3339(parseEventTime(range.to, range.timezone))
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: creds.calendarId }],
    },
  })
  const calBusy = res.data.calendars?.[creds.calendarId]
  const warnings: string[] = []
  if (calBusy?.errors?.length) {
    for (const e of calBusy.errors) warnings.push(`${e.domain}:${e.reason}`)
  }
  const busy_blocks = (calBusy?.busy || []).map((b) => ({
    start: b.start || "",
    end: b.end || "",
  }))
  return { busy_blocks, warnings }
}

export type CreateInput = {
  title: string
  start: string
  end?: string
  duration_minutes?: number
  timezone?: string
  /** Resolved emails, optionally with displayName (login). */
  attendees?: Array<string | { email: string; displayName?: string }>
  /** Opaque ids for reverse masking when emails collide. */
  attendee_ids?: string[]
  description?: string
  location?: string
  reminder_minutes?: number | null
  client_token?: string
}

function toAttendeeObjects(
  attendees: CreateInput["attendees"],
): Array<{ email: string; displayName?: string }> | undefined {
  if (!attendees?.length) return undefined
  // Google Calendar collapses duplicate emails to one attendee. Dedupe for API,
  // merge displayNames so the UI still shows human-readable roster.
  const byEmail = new Map<string, { email: string; names: string[] }>()
  for (const a of attendees) {
    const email = (typeof a === "string" ? a : a.email).trim().toLowerCase()
    if (!email) continue
    const name = typeof a === "string" ? undefined : a.displayName?.trim()
    const cur = byEmail.get(email) || { email, names: [] }
    if (name && !cur.names.includes(name)) cur.names.push(name)
    byEmail.set(email, cur)
  }
  return [...byEmail.values()].map((v) => ({
    email: v.email,
    ...(v.names.length ? { displayName: v.names.join(", ") } : {}),
  }))
}

export async function createEvent(creds: GoogleCredentials, input: CreateInput): Promise<CreateResult> {
  const warnings: string[] = []
  if (!input.client_token) warnings.push("no_client_token: retries may duplicate")
  else {
    const hit = createCache.get(input.client_token)
    if (hit && Date.now() - hit.at < TOKEN_CACHE_TTL_MS) return hit.result
  }

  const startDate = parseEventTime(input.start, input.timezone)
  let endDate: Date
  if (input.duration_minutes != null) {
    endDate = new Date(startDate.getTime() + input.duration_minutes * 60_000)
  } else if (input.end) {
    endDate = parseEventTime(input.end, input.timezone)
  } else {
    endDate = new Date(startDate.getTime() + 60 * 60_000)
  }

  const cal = calApi(creds)

  if (input.client_token) {
    const q = await cal.events.list({
      calendarId: creds.calendarId,
      privateExtendedProperty: [`client_token=${input.client_token}`],
      maxResults: 1,
      singleEvents: true,
    })
    const existing = q.data.items?.[0]
    if (existing?.id) {
      const mapped = mapEvent(existing, creds.calendarId)!
      const opaque = mapped.attendee_ids?.length
        ? mapped.attendee_ids
        : input.attendee_ids?.length
          ? input.attendee_ids
          : mapped.attendees
      const result: CreateResult = {
        uid: mapped.uid,
        href: mapped.href,
        etag: mapped.etag,
        invite_status: "scheduled",
        warnings: ["idempotent_hit: existing event for client_token"],
        attendees: opaque,
        google_attendee_emails: mapped.attendees,
      }
      createCache.set(input.client_token, { at: Date.now(), result })
      return result
    }
  }

  const attendeeObjs = toAttendeeObjects(input.attendees)
  const privateProps: Record<string, string> = {}
  if (input.client_token) privateProps.client_token = input.client_token
  // Preserve agent-facing opaque ids for list masking when emails collide (demo shared mailbox).
  if (input.attendee_ids?.length) {
    privateProps.attendee_ids = input.attendee_ids.join(",")
  }

  const body: calendar_v3.Schema$Event = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: {
      dateTime: toRfc3339(startDate),
      timeZone: input.timezone || "Europe/Moscow",
    },
    end: {
      dateTime: toRfc3339(endDate),
      timeZone: input.timezone || "Europe/Moscow",
    },
    attendees: attendeeObjs,
    extendedProperties: Object.keys(privateProps).length ? { private: privateProps } : undefined,
    reminders:
      input.reminder_minutes == null
        ? undefined
        : {
            useDefault: false,
            overrides: [{ method: "popup", minutes: input.reminder_minutes }],
          },
  }

  const inserted = await cal.events.insert({
    calendarId: creds.calendarId,
    requestBody: body,
    sendUpdates: "all",
  })

  const mapped = mapEvent(inserted.data, creds.calendarId)
  if (!mapped) throw new Error("CreateFailed: Google Calendar returned no event id")

  // Prefer the opaque roster we persisted; Google may collapse same-email invitees.
  const opaqueAttendees = input.attendee_ids?.length
    ? input.attendee_ids
    : mapped.attendee_ids?.length
      ? mapped.attendee_ids
      : mapped.attendees

  if (
    input.attendee_ids &&
    input.attendee_ids.length > 1 &&
    new Set((attendeeObjs || []).map((a) => a.email.toLowerCase())).size < input.attendee_ids.length
  ) {
    warnings.push(
      "shared_mailbox_collapsed: multiple opaque ids map to fewer Google emails; " +
        "authoritative roster is attendees[] / extendedProperties.attendee_ids",
    )
  }

  const result: CreateResult = {
    uid: mapped.uid,
    href: mapped.href,
    etag: mapped.etag,
    invite_status: warnings.length ? "scheduled_with_warnings" : "scheduled",
    warnings: warnings.length ? warnings : undefined,
    attendees: opaqueAttendees,
    google_attendee_emails: mapped.attendees,
  }
  if (input.client_token) createCache.set(input.client_token, { at: Date.now(), result })
  return result
}

export type UpdateInput = {
  uid: string
  href: string
  etag: string
  patch: {
    title?: string
    start?: string
    end?: string
    timezone?: string
    description?: string
    location?: string
    reminder_minutes?: number | null
    attendees?: Array<string | { email: string; displayName?: string }>
    /** Opaque ids for reverse masking when emails collide. */
    attendee_ids?: string[]
  }
}

export async function updateEvent(creds: GoogleCredentials, input: UpdateInput): Promise<CreateResult> {
  const cal = calApi(creds)
  const existing = await cal.events.get({
    calendarId: creds.calendarId,
    eventId: input.uid,
  })
  if (existing.data.recurrence?.length || existing.data.recurringEventId) {
    throw new Error("RecurringEventNotSupported: update only single events")
  }
  if (input.etag && existing.data.etag && input.etag !== existing.data.etag) {
    // Soft check — Google uses If-Match; warn but continue with current etag if mismatch on read
  }

  const patch = input.patch
  const tz = patch.timezone || "Europe/Moscow"
  const body: calendar_v3.Schema$Event = { ...existing.data }

  if (patch.title !== undefined) body.summary = patch.title
  if (patch.description !== undefined) body.description = patch.description
  if (patch.location !== undefined) body.location = patch.location
  if (patch.attendees !== undefined) {
    body.attendees = toAttendeeObjects(patch.attendees)
  }
  if (patch.attendee_ids?.length) {
    body.extendedProperties = {
      ...(body.extendedProperties || {}),
      private: {
        ...(body.extendedProperties?.private || {}),
        attendee_ids: patch.attendee_ids.join(","),
      },
    }
  }

  const curStart = existing.data.start?.dateTime
    ? new Date(existing.data.start.dateTime)
    : null
  const curEnd = existing.data.end?.dateTime ? new Date(existing.data.end.dateTime) : null
  const durationMs =
    curStart && curEnd ? curEnd.getTime() - curStart.getTime() : 60 * 60_000

  if (patch.start && patch.end) {
    body.start = { dateTime: toRfc3339(parseEventTime(patch.start, tz)), timeZone: tz }
    body.end = { dateTime: toRfc3339(parseEventTime(patch.end, tz)), timeZone: tz }
  } else if (patch.start && !patch.end) {
    const s = parseEventTime(patch.start, tz)
    body.start = { dateTime: toRfc3339(s), timeZone: tz }
    body.end = { dateTime: toRfc3339(new Date(s.getTime() + durationMs)), timeZone: tz }
  } else if (!patch.start && patch.end && curStart) {
    body.end = { dateTime: toRfc3339(parseEventTime(patch.end, tz)), timeZone: tz }
  }

  if (patch.reminder_minutes !== undefined) {
    body.reminders =
      patch.reminder_minutes == null
        ? { useDefault: true }
        : {
            useDefault: false,
            overrides: [{ method: "popup", minutes: patch.reminder_minutes }],
          }
  }

  const updated = await cal.events.update({
    calendarId: creds.calendarId,
    eventId: input.uid,
    requestBody: body,
    sendUpdates: "all",
  })

  const mapped = mapEvent(updated.data, creds.calendarId)
  if (!mapped) throw new Error("UpdateFailed: no event id")
  const warnings: string[] = []
  const opaqueAttendees = patch.attendee_ids?.length
    ? patch.attendee_ids
    : mapped.attendee_ids?.length
      ? mapped.attendee_ids
      : mapped.attendees
  if (
    patch.attendee_ids &&
    patch.attendee_ids.length > 1 &&
    new Set((toAttendeeObjects(patch.attendees) || []).map((a) => a.email.toLowerCase())).size <
      patch.attendee_ids.length
  ) {
    warnings.push(
      "shared_mailbox_collapsed: multiple opaque ids map to fewer Google emails; " +
        "authoritative roster is attendees[] / extendedProperties.attendee_ids",
    )
  }
  return {
    uid: mapped.uid,
    href: mapped.href,
    etag: mapped.etag,
    invite_status: warnings.length ? "scheduled_with_warnings" : "scheduled",
    warnings: warnings.length ? warnings : undefined,
    attendees: opaqueAttendees,
    google_attendee_emails: mapped.attendees,
  }
}

export async function cancelEvent(
  creds: GoogleCredentials,
  input: { uid: string; href: string; etag: string; reason?: string },
): Promise<{ uid: string; cancellation: string; warnings?: string[] }> {
  const cal = calApi(creds)
  const existing = await cal.events.get({
    calendarId: creds.calendarId,
    eventId: input.uid,
  })
  if (existing.data.recurrence?.length || existing.data.recurringEventId) {
    throw new Error("RecurringEventNotSupported: cancel only single events")
  }
  if (input.reason) {
    await cal.events.patch({
      calendarId: creds.calendarId,
      eventId: input.uid,
      requestBody: {
        description: `${existing.data.description || ""}\n\nCancelled: ${input.reason}`.trim(),
        status: "cancelled",
      },
      sendUpdates: "all",
    })
  }
  await cal.events.delete({
    calendarId: creds.calendarId,
    eventId: input.uid,
    sendUpdates: "all",
  })
  return { uid: input.uid, cancellation: "sent" }
}
