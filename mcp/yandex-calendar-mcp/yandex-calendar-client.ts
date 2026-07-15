// yandex-calendar-client.ts

export interface CalendarPrivileges {
  hasBind: boolean             // DAV:bind, required to CREATE new resources
  hasWriteContent: boolean     // DAV:write-content, MODIFY existing resources
}

export interface CalendarCandidate {
  displayName: string
  url: string
  privileges: CalendarPrivileges
}

const PRIORITY_NAMES = [
  // Russian-localized Yandex defaults (current and historical)
  "Мои события",     // Yandex's current default for new accounts (events collection)
  "Мой календарь",   // Yandex's older default
  "Личный",
  // English defaults
  "My events",
  "Default",
  "Calendar",
  "Personal",
]

export type CalendarSelection =
  | { ok: true; url: string; displayName: string }
  | { ok: false; diagnostic: string }

export function selectCalendarFromCandidates(all: CalendarCandidate[]): CalendarSelection {
  const writable = all.filter((c) => c.privileges.hasBind)

  if (writable.length === 0) {
    const lines = ["no writable calendar found (none has DAV:bind privilege)."]
    if (all.length > 0) {
      lines.push("Calendars seen:")
      for (const c of all) {
        lines.push(
          `  ${c.displayName} (${c.url}) — bind=${c.privileges.hasBind}, write-content=${c.privileges.hasWriteContent}`
        )
      }
    }
    lines.push("")
    lines.push("Likely causes: app password is missing CalDAV scope; account locked; no calendars provisioned.")
    return { ok: false, diagnostic: lines.join("\n") }
  }

  if (writable.length === 1) {
    return { ok: true, url: writable[0].url, displayName: writable[0].displayName }
  }

  for (const priority of PRIORITY_NAMES) {
    const matches = writable.filter((c) => c.displayName === priority)
    if (matches.length === 1) {
      return { ok: true, url: matches[0].url, displayName: matches[0].displayName }
    }
    if (matches.length > 1) {
      const lines = [
        `Multiple writable calendars share the displayname "${priority}". Cannot disambiguate.`,
        "Candidates:",
      ]
      for (const m of matches) lines.push(`  ${m.displayName} — ${m.url}`)
      lines.push("")
      lines.push("Set YANDEX_CALDAV_CALENDAR_URL to the URL of the calendar you want to use.")
      return { ok: false, diagnostic: lines.join("\n") }
    }
  }

  const lines = [
    "Multiple writable calendars found and none matched a well-known priority name.",
    `Priority list: ${PRIORITY_NAMES.map((n) => `"${n}"`).join(", ")}.`,
    "Candidates:",
  ]
  for (const c of writable) lines.push(`  ${c.displayName} — ${c.url}`)
  lines.push("")
  lines.push("Set YANDEX_CALDAV_CALENDAR_URL to the URL of the calendar you want to use.")
  return { ok: false, diagnostic: lines.join("\n") }
}

import * as cheerio from "cheerio"

export interface DiscoveryInput {
  caldavUrl: string
  login: string
  password: string
  explicitCalendarUrl?: string
}

const PROPFIND_PRINCIPAL_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:">
  <D:prop><D:current-user-principal/></D:prop>
</D:propfind>`

const PROPFIND_HOMESET_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop><C:calendar-home-set/></D:prop>
</D:propfind>`

const PROPFIND_CALENDARS_BODY = `<?xml version="1.0" encoding="utf-8"?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <D:current-user-privilege-set/>
  </D:prop>
</D:propfind>`

// --- Namespace-agnostic XML selector helpers ---
function localName(el: any): string {
  const tag = String(el?.tagName ?? el?.name ?? "")
  return tag.toLowerCase().split(":").pop() ?? ""
}

function findByLocal(
  $: cheerio.CheerioAPI,
  $scope: cheerio.Cheerio<any>,
  name: string,
): cheerio.Cheerio<any> {
  return $scope.find("*").filter((_, el) => localName(el) === name)
}

function absolutizeHref(baseUrl: string, href: string): string {
  if (!href) return href
  if (/^https?:\/\//i.test(href)) return href
  return new URL(href, baseUrl).toString()
}

const NETWORK_TIMEOUT_MS = 15_000

/**
 * Wraps an async network operation with an AbortController-backed timeout.
 * On timeout, throws `"<operationName> timed out after <X>s on <url> (limit Ns)"`.
 * Use for all CalDAV network paths so failures share a consistent diagnostic shape.
 */
export async function withTimeout<T>(
  operationName: string,
  urlForError: string,
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = NETWORK_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()
  try {
    return await fn(controller.signal)
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || /aborted|abort/i.test(error.message))) {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
      throw new Error(
        `${operationName} timed out after ${elapsedSec}s on ${urlForError} (limit ${timeoutMs / 1000}s)`,
      )
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function rawPropfind(
  url: string,
  body: string,
  login: string,
  password: string,
  depth: "0" | "1",
  operationName = "PROPFIND",
): Promise<string> {
  return withTimeout(operationName, url, async (signal) => {
    const res = await fetch(url, {
      method: "PROPFIND",
      headers: {
        authorization: "Basic " + btoa(`${login}:${password}`),
        depth,
        "content-type": "application/xml; charset=utf-8",
      },
      body,
      signal,
    })
    if (res.status !== 207 && !res.ok) {
      throw new Error(`${operationName} HTTP ${res.status} on ${url}: ${await res.text()}`)
    }
    return await res.text()
  })
}

async function rawGet(
  url: string,
  login: string,
  password: string,
  operationName: string,
): Promise<{ data: string; etag?: string; status: number }> {
  return withTimeout(operationName, url, async (signal) => {
    const res = await fetch(url, {
      method: "GET",
      headers: { authorization: "Basic " + btoa(`${login}:${password}`) },
      signal,
    })
    if (!res.ok) {
      throw new Error(`${operationName} HTTP ${res.status} on ${url}: ${(await res.text()).slice(0, 200)}`)
    }
    return { data: await res.text(), etag: res.headers.get("etag") ?? undefined, status: res.status }
  })
}

async function rawDelete(
  url: string,
  login: string,
  password: string,
  operationName: string,
): Promise<{ ok: boolean; status: number; bodySnippet?: string }> {
  return withTimeout(operationName, url, async (signal) => {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { authorization: "Basic " + btoa(`${login}:${password}`) },
      signal,
    })
    const bodySnippet = res.ok ? undefined : (await res.text()).slice(0, 200)
    return { ok: res.ok, status: res.status, bodySnippet }
  })
}

async function fetchPrincipalUrl(serverUrl: string, login: string, password: string): Promise<string> {
  const xml = await rawPropfind(serverUrl, PROPFIND_PRINCIPAL_BODY, login, password, "0", "PROPFIND current-user-principal")
  const $ = cheerio.load(xml, { xmlMode: true })
  const principalNode = findByLocal($, $.root(), "current-user-principal").first()
  const href = findByLocal($, principalNode, "href").first().text().trim()
  if (!href) {
    throw new Error(`Could not resolve current-user-principal from PROPFIND on ${serverUrl}. Response head: ${xml.slice(0, 400)}`)
  }
  return absolutizeHref(serverUrl, href)
}

async function fetchCalendarHomeUrl(principalUrl: string, login: string, password: string): Promise<string> {
  const xml = await rawPropfind(principalUrl, PROPFIND_HOMESET_BODY, login, password, "0", "PROPFIND calendar-home-set")
  const $ = cheerio.load(xml, { xmlMode: true })
  const homeSet = findByLocal($, $.root(), "calendar-home-set").first()
  const href = findByLocal($, homeSet, "href").first().text().trim()
  if (!href) {
    throw new Error(`Could not resolve calendar-home-set from PROPFIND on ${principalUrl}. Response head: ${xml.slice(0, 400)}`)
  }
  return absolutizeHref(principalUrl, href)
}

export function parseCalendarsPropfindXml(xml: string): CalendarCandidate[] {
  const $ = cheerio.load(xml, { xmlMode: true })
  const candidates: CalendarCandidate[] = []
  findByLocal($, $.root(), "response").each((_, el) => {
    const $el = $(el)
    const href = findByLocal($, $el, "href").first().text().trim()
    let displayName = ""
    let isCalendar = false
    let hasBind = false
    let hasWriteContent = false
    // Properties may be split across multiple 200 OK propstat blocks per RFC 4918 §9.1;
    // we merge them by accumulating into the outer-scoped variables.
    findByLocal($, $el, "propstat").each((_, ps) => {
      const $ps = $(ps)
      const statusEl = $ps.children().filter((_, c) => localName(c) === "status").first()
      if (!/\bHTTP\/\d+\.\d+\s+200\b/.test(statusEl.text())) return
      const $prop = $ps.children().filter((_, c) => localName(c) === "prop").first()
      if (!$prop.length) return

      const dn = findByLocal($, $prop, "displayname").first().text().trim()
      if (dn) displayName = dn

      const rt = findByLocal($, $prop, "resourcetype").first()
      if (findByLocal($, rt, "calendar").length > 0) isCalendar = true

      findByLocal($, $prop, "privilege").each((_, pv) => {
        const child = $(pv).children().first()
        const ln = localName(child[0])
        if (ln === "bind") hasBind = true
        else if (ln === "write-content") hasWriteContent = true
        else if (ln === "write" || ln === "all") { hasBind = true; hasWriteContent = true }
      })
    })
    if (isCalendar && href) {
      candidates.push({ displayName, url: href, privileges: { hasBind, hasWriteContent } })
    }
  })
  return candidates
}

async function propfindCalendarsAt(
  url: string,
  login: string,
  password: string,
): Promise<CalendarCandidate[]> {
  const xml = await rawPropfind(url, PROPFIND_CALENDARS_BODY, login, password, "1", "PROPFIND calendars")
  const candidates = parseCalendarsPropfindXml(xml)
  // RFC 4918 §8.3: hrefs in multistatus are relative to request URL. Absolutize them.
  return candidates.map((c) => ({ ...c, url: absolutizeHref(url, c.url) }))
}

export async function discoverCalendarUrl(input: DiscoveryInput): Promise<CalendarSelection> {
  if (input.explicitCalendarUrl) {
    return { ok: true, url: input.explicitCalendarUrl, displayName: "(explicit)" }
  }
  try {
    const principalUrl = await fetchPrincipalUrl(input.caldavUrl, input.login, input.password)
    const homeUrl = await fetchCalendarHomeUrl(principalUrl, input.login, input.password)
    const candidates = await propfindCalendarsAt(homeUrl, input.login, input.password)
    return selectCalendarFromCandidates(candidates)
  } catch (err) {
    return {
      ok: false,
      diagnostic:
        `Discovery failed: ${err instanceof Error ? err.message : String(err)}. ` +
        `Either set YANDEX_CALDAV_CALENDAR_URL explicitly, or verify the app password has CalDAV scope ` +
        `(id.yandex.ru → Безопасность → Пароли приложений → «Календарь и почта (CalDAV)»).`,
    }
  }
}

export class EtagNotReturned extends Error {
  constructor() {
    super("EtagNotReturned: PUT response had no ETag header and follow-up GET also returned none. Refusing to return success without an etag (would break update/cancel conflict detection).")
    this.name = "EtagNotReturned"
  }
}

export interface AcquireEtagInput {
  putResponse: Pick<Response, "headers">
  doFollowUpGet: () => Promise<Pick<Response, "headers">>
}

export async function acquireEtag(input: AcquireEtagInput): Promise<string> {
  const fromPut = input.putResponse.headers.get("etag")
  if (fromPut) return fromPut
  const getResp = await input.doFollowUpGet()
  const fromGet = getResp.headers.get("etag")
  if (fromGet) return fromGet
  throw new EtagNotReturned()
}

export interface CachedCreate {
  uid: string
  href: string
  etag: string
  sequence: number
}

export class IdempotencyCache {
  private readonly map = new Map<string, { value: CachedCreate; expiresAt: number }>()

  constructor(private readonly ttlMs: number) {}

  get(token: string): CachedCreate | undefined {
    const e = this.map.get(token)
    if (!e) return undefined
    if (Date.now() > e.expiresAt) {
      this.map.delete(token)
      return undefined
    }
    return e.value
  }

  set(token: string, value: CachedCreate): void {
    this.map.set(token, { value, expiresAt: Date.now() + this.ttlMs })
  }
}

import { generateEventIcs, type EventIcsInput } from "./yandex-calendar-ical.ts"

export interface CreateEventInput {
  title: string
  start: string
  end?: string
  duration_minutes?: number
  timezone?: string
  attendees?: string[]
  description?: string
  location?: string
  reminder_minutes?: number | null
  client_token?: string
}

export interface CreateEventResult {
  uid: string
  href: string
  etag: string
  sequence: number
  invite_status: "scheduled" | "scheduled_with_warnings"
  warnings: string[]
}

export interface CreateEventDeps {
  caldavUrl: string
  calendarUrl: string
  login: string
  password: string
  cache: IdempotencyCache
  input: CreateEventInput
}

/** LLMs often send both end (computed) and duration_minutes — prefer duration. */
export function normalizeCreateEventInput(input: CreateEventInput): {
  input: CreateEventInput
  warnings: string[]
} {
  const warnings: string[] = []
  const normalized: CreateEventInput = { ...input }

  if (typeof normalized.end === "string") {
    const trimmed = normalized.end.trim()
    if (trimmed === "") delete normalized.end
    else normalized.end = trimmed
  }

  if (normalized.end !== undefined && normalized.duration_minutes !== undefined) {
    warnings.push("both_end_and_duration_given: using duration_minutes, ignoring end")
    delete normalized.end
  }

  return { input: normalized, warnings }
}

const ISO_ZONED_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/
const ISO_NAIVE_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

function parseOffsetSuffixToMinutes(suffix: string): number {
  if (suffix === "Z") return 0
  const m = suffix.match(/^([+-])(\d{2}):(\d{2})$/)
  if (!m) throw new Error(`Invalid offset suffix: ${suffix}`)
  return (m[1] === "-" ? -1 : 1) * (parseInt(m[2]) * 60 + parseInt(m[3]))
}

export function isoToUtcMs(iso: string, timezone: string | undefined): number {
  if (ISO_ZONED_LOCAL.test(iso)) return Date.parse(iso)
  if (ISO_NAIVE_LOCAL.test(iso)) {
    if (timezone !== "Europe/Moscow") {
      throw new Error(
        `InvalidTimezone: naive ISO "${iso}" requires timezone="Europe/Moscow" in v1 (got ${timezone ?? "<none>"})`,
      )
    }
    const [, y, mo, d, h, mi, s] = ISO_NAIVE_LOCAL.exec(iso)!
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - 180 * 60_000
  }
  throw new Error(`Invalid ISO 8601 date-time: ${iso}`)
}

function formatIsoInOffset(utcMs: number, offsetMinutes: number, offsetSuffix: string): string {
  const wall = new Date(utcMs + offsetMinutes * 60_000)
  const pad = (n: number, w = 2) => String(n).padStart(w, "0")
  return (
    `${wall.getUTCFullYear()}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
    `T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}` +
    offsetSuffix
  )
}

/**
 * Convert an ISO 8601 input (zoned or naive+Moscow) to a standard ISO 8601 UTC string
 * (e.g. `2026-05-15T09:00:00Z`). Useful when passing dates to tsdav APIs that expect
 * a format `new Date(...)` can parse — compact CalDAV form `YYYYMMDDTHHMMSSZ` fails there.
 */
export function isoToUtcIso(iso: string, timezone: string | undefined): string {
  const ms = isoToUtcMs(iso, timezone)
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z")
}

function formatEndIsoLikeStart(start: string, endUtcMs: number): string {
  if (start.endsWith("Z")) {
    return new Date(endUtcMs).toISOString().replace(/\.\d{3}Z$/, "Z")
  }
  if (ISO_ZONED_LOCAL.test(start)) {
    const offsetSuffix = start.slice(-6)
    return formatIsoInOffset(endUtcMs, parseOffsetSuffixToMinutes(offsetSuffix), offsetSuffix)
  }
  return formatIsoInOffset(endUtcMs, 180, "")
}

export function resolveEventTimes(input: CreateEventInput): { start: string; end: string; timezone?: string } {
  const { input: resolved } = normalizeCreateEventInput(input)

  const startZoned = ISO_ZONED_LOCAL.test(resolved.start)
  const startNaive = ISO_NAIVE_LOCAL.test(resolved.start)
  if (!startZoned && !startNaive) throw new Error(`InvalidStart: ${resolved.start}`)
  if (startNaive && resolved.timezone !== "Europe/Moscow") {
    throw new Error("InvalidTimezone: naive ISO start requires timezone='Europe/Moscow' in v1.")
  }

  let end: string
  if (resolved.end !== undefined) {
    const endZoned = ISO_ZONED_LOCAL.test(resolved.end)
    const endNaive = ISO_NAIVE_LOCAL.test(resolved.end)
    if (!endZoned && !endNaive) throw new Error(`InvalidEnd: ${resolved.end}`)
    if (startZoned !== endZoned) {
      throw new Error("MixedTimeForms: start and end must use the same form (both zoned or both naive).")
    }
    end = resolved.end
  } else {
    const durMs = (resolved.duration_minutes ?? 60) * 60_000
    const startMs = isoToUtcMs(resolved.start, resolved.timezone)
    end = formatEndIsoLikeStart(resolved.start, startMs + durMs)
  }

  const startMsCheck = isoToUtcMs(resolved.start, resolved.timezone)
  const endMsCheck = isoToUtcMs(end, resolved.timezone)
  if (endMsCheck <= startMsCheck) {
    throw new Error("InvalidTimeRange: resolved end must be > start.")
  }
  if (endMsCheck - startMsCheck > 24 * 60 * 60_000) {
    throw new Error("InvalidEventDuration: event must not exceed 24h in v1.")
  }
  if (resolved.duration_minutes !== undefined) {
    if (resolved.duration_minutes < 1 || resolved.duration_minutes > 1440 || !Number.isInteger(resolved.duration_minutes)) {
      throw new Error("InvalidDurationMinutes: duration_minutes must be an integer in [1, 1440].")
    }
  }

  return { start: resolved.start, end, timezone: resolved.timezone }
}

export async function createEvent(deps: CreateEventDeps): Promise<CreateEventResult> {
  const { input, warnings: normWarnings } = normalizeCreateEventInput(deps.input)
  const { start, end, timezone } = resolveEventTimes(input)

  const warnings: string[] = [...normWarnings]

  if (input.client_token) {
    const hit = deps.cache.get(input.client_token)
    if (hit) {
      return {
        uid: hit.uid,
        href: hit.href,
        etag: hit.etag,
        sequence: hit.sequence,
        invite_status: "scheduled",
        warnings: ["served_from_cache"],
      }
    }
  } else {
    warnings.push("no_client_token: retries may duplicate")
  }

  const uid = `${crypto.randomUUID()}@openwork-mcp`

  const icsInput: EventIcsInput = {
    uid,
    sequence: 0,
    organizer: deps.login,
    title: input.title,
    start,
    end,
    timezone,
    attendees: input.attendees ?? [],
    description: input.description,
    location: input.location,
    reminderMinutes: input.reminder_minutes ?? null,
    status: "CONFIRMED",
  }
  const iCalString = generateEventIcs(icsInput)

  // No defaultAccountType: tsdav's account discovery duplicates the raw PROPFIND chain
  // we built in T11. Pass calendar URL explicitly to each call instead.
  const { createDAVClient } = await import("tsdav")
  const client = await createDAVClient({
    serverUrl: deps.caldavUrl,
    credentials: { username: deps.login, password: deps.password },
    authMethod: "Basic",
  })

  const resp: any = await withTimeout("createCalendarObject", deps.calendarUrl, async (signal) => {
    return await client.createCalendarObject({
      calendar: { url: deps.calendarUrl } as any,
      filename: `${uid}.ics`,
      iCalString,
      fetchOptions: { signal },
    } as any)
  })

  // Non-2xx PUT must surface as an explicit error — otherwise it would slip into
  // acquireEtag's "no etag → EtagNotReturned" path and the caller would see a
  // misleading diagnostic that hides the real auth/permission/conflict cause.
  if (resp.ok === false || (typeof resp.status === "number" && resp.status >= 400)) {
    const bodyHint = typeof resp.body === "string" ? resp.body.slice(0, 200) : ""
    throw new Error(
      `createCalendarObject failed: HTTP ${resp.status ?? "?"} on ${deps.calendarUrl}${bodyHint ? ` — ${bodyHint}` : ""}`,
    )
  }

  const etag = await acquireEtag({
    putResponse: { headers: new Headers((resp.headers as any) ?? {}) },
    doFollowUpGet: async () => {
      return await withTimeout("GET resource (etag fallback)", resp.url, async (signal) => {
        const gr = await fetch(resp.url, {
          headers: { authorization: "Basic " + btoa(`${deps.login}:${deps.password}`) },
          signal,
        })
        return { headers: gr.headers }
      })
    },
  })

  const result: CreateEventResult = {
    uid,
    href: resp.url,
    etag,
    sequence: 0,
    invite_status: warnings.length === 0 ? "scheduled" : "scheduled_with_warnings",
    warnings,
  }

  if (input.client_token) {
    deps.cache.set(input.client_token, { uid, href: resp.url, etag, sequence: 0 })
  }

  return result
}

import {
  parseVEvent,
  detectRecurring,
  type ParsedVEvent,
} from "./yandex-calendar-ical-parse.ts"
import { toCalDavUtcDateTime } from "./yandex-calendar-ical.ts"

export interface ListedEvent {
  uid: string
  href: string
  etag: string
  summary: string
  start: string
  end: string
  attendees: string[]
  status: "CONFIRMED" | "CANCELLED" | "TENTATIVE"
  is_recurring: boolean
  recurrence_rule?: string
}

export interface ListEventsDeps {
  caldavUrl: string
  calendarUrl: string
  login: string
  password: string
  from: string
  to: string
  timezone?: string
}

export async function listEvents(deps: ListEventsDeps): Promise<ListedEvent[]> {
  const fromIso = isoToUtcIso(deps.from, deps.timezone)
  const toIso = isoToUtcIso(deps.to, deps.timezone)

  const { createDAVClient } = await import("tsdav")
  const client = await createDAVClient({
    serverUrl: deps.caldavUrl,
    credentials: { username: deps.login, password: deps.password },
    authMethod: "Basic",
  })

  const objects = await withTimeout("fetchCalendarObjects (list)", deps.calendarUrl, async (signal) => {
    return await client.fetchCalendarObjects({
      calendar: { url: deps.calendarUrl } as any,
      timeRange: { start: fromIso, end: toIso },
      fetchOptions: { signal },
    } as any)
  })

  const out: ListedEvent[] = []
  for (const obj of objects) {
    let parsed: ParsedVEvent
    try {
      parsed = parseVEvent((obj as any).data)
    } catch {
      continue
    }
    out.push({
      uid: parsed.uid,
      href: (obj as any).url,
      etag: (obj as any).etag,
      summary: parsed.summary,
      start: parsed.start,
      end: parsed.end,
      attendees: parsed.attendees,
      status: parsed.status,
      is_recurring: detectRecurring(parsed),
      recurrence_rule: parsed.rrule,
    })
  }
  return out
}

export class RecurringEventNotSupported extends Error {
  constructor() {
    super("RecurringEventNotSupported: событие повторяющееся (RRULE/RECURRENCE-ID/EXDATE/RDATE); редактирование и отмена recurring-событий не поддерживаются в v1, используй UI Яндекс.Календаря.")
    this.name = "RecurringEventNotSupported"
  }
}

export class EventChangedExternally extends Error {
  constructor() {
    super("EventChangedExternally: событие изменено в Яндекс.Календаре снаружи; перечитай через list_events и повтори с новым etag.")
    this.name = "EventChangedExternally"
  }
}

export class UidMismatch extends Error {
  constructor(expected: string, actual: string) {
    super(`UidMismatch: GET on href returned UID="${actual}" but the call asked to mutate UID="${expected}". Refusing to mutate the wrong event. Verify href, then retry.`)
    this.name = "UidMismatch"
  }
}

export interface UpdateEventPatch {
  title?: string
  start?: string
  end?: string
  timezone?: string
  description?: string
  location?: string
  reminder_minutes?: number | null
}

export interface UpdateEventInput {
  uid: string
  href: string
  etag: string
  patch: UpdateEventPatch
}

export interface UpdateEventResult {
  uid: string
  href: string
  etag: string
  sequence: number
  invite_status: "scheduled" | "scheduled_with_warnings"
  warnings: string[]
}

function resolveUpdateTimes(
  oldStart: string,
  oldEnd: string,
  oldTimezone: string | undefined,
  patch: UpdateEventPatch,
): { start: string; end: string; timezone?: string } {
  const startGiven = patch.start !== undefined
  const endGiven = patch.end !== undefined

  let start: string
  let end: string
  const timezone = patch.timezone

  if (!startGiven && !endGiven) {
    start = oldStart
    end = oldEnd
  } else if (startGiven && !endGiven) {
    start = patch.start!
    const newStartMs = isoToUtcMs(start, timezone)
    // OLD start/end may be naive ISO (when the event is stored with TZID — ical.js
    // returns "2026-05-16T12:00:00" without the zone, and TZID is captured separately
    // as parsed.timezone, passed in here as `oldTimezone`). Earlier draft assumed
    // ical.js always returns zoned ISO and passed `undefined` — that broke any
    // start-only shift on a TZID-stored event (smoke 2026-05-16, OpenWork session).
    const oldDurMs = isoToUtcMs(oldEnd, oldTimezone) - isoToUtcMs(oldStart, oldTimezone)
    end = formatEndIsoLikeStart(start, newStartMs + oldDurMs)
  } else if (!startGiven && endGiven) {
    start = oldStart
    end = patch.end!
    if (ISO_NAIVE_LOCAL.test(end) && !ISO_NAIVE_LOCAL.test(start)) {
      throw new Error(
        "MixedTimeForms: patch.end is naive but the existing event's start is zoned. Pass a zoned patch.end, or pass both patch.start and patch.end in naive form with timezone='Europe/Moscow'.",
      )
    }
    isoToUtcMs(end, timezone ?? oldTimezone)
  } else {
    start = patch.start!
    end = patch.end!
    const startZoned = ISO_ZONED_LOCAL.test(start)
    const endZoned = ISO_ZONED_LOCAL.test(end)
    const startNaive = ISO_NAIVE_LOCAL.test(start)
    const endNaive = ISO_NAIVE_LOCAL.test(end)
    if (!(startZoned || startNaive) || !(endZoned || endNaive)) {
      throw new Error(`InvalidPatchTimes: malformed start/end (${start}, ${end})`)
    }
    if (startZoned !== endZoned) {
      throw new Error("MixedTimeForms: patch.start and patch.end must both be zoned or both naive.")
    }
    isoToUtcMs(start, timezone)
    isoToUtcMs(end, timezone)
  }

  // Final invariants — `oldTimezone` is the fallback when the resolved (start, end)
  // still reference the OLD naive times (e.g. neither branch overrode them).
  const effectiveTz = timezone ?? oldTimezone
  const startMs = isoToUtcMs(start, effectiveTz)
  const endMs = isoToUtcMs(end, effectiveTz)
  if (endMs <= startMs) {
    throw new Error("InvalidTimeRange: resolved end must be > start.")
  }
  if (endMs - startMs > 24 * 60 * 60_000) {
    throw new Error("InvalidEventDuration: event must not exceed 24h in v1.")
  }

  return { start, end, timezone }
}

export interface UpdateEventDeps {
  caldavUrl: string
  calendarUrl: string
  login: string
  password: string
  input: UpdateEventInput
}

export async function updateEvent(deps: UpdateEventDeps): Promise<UpdateEventResult> {
  const { createDAVClient } = await import("tsdav")
  const client = await createDAVClient({
    serverUrl: deps.caldavUrl,
    credentials: { username: deps.login, password: deps.password },
    authMethod: "Basic",
  })

  const obj = await rawGet(deps.input.href, deps.login, deps.password, "GET resource (update)")
  const parsed = parseVEvent(obj.data)
  if (parsed.uid !== deps.input.uid) throw new UidMismatch(deps.input.uid, parsed.uid)
  if (detectRecurring(parsed)) throw new RecurringEventNotSupported()

  // Preserve the event's existing TZID when the patch doesn't override it — so a
  // title-only update of a Europe/Moscow event re-emits DTSTART;TZID=Europe/Moscow,
  // not a broken naive ISO without zone. Passed both into effectivePatch (so patch
  // validation accepts naive start/end without an explicit timezone= override) AND
  // into resolveUpdateTimes as `oldTimezone` (so the start-only-shift duration math
  // can convert OLD naive times back to UTC ms correctly — ical.js returns naive
  // strings for TZID-form DTSTART, so we need the TZID separately).
  const effectivePatch = { ...deps.input.patch, timezone: deps.input.patch.timezone ?? parsed.timezone }
  const { start, end, timezone } = resolveUpdateTimes(parsed.start, parsed.end, parsed.timezone, effectivePatch)

  const newSeq = parsed.sequence + 1
  const ics = generateEventIcs({
    uid: parsed.uid,
    sequence: newSeq,
    organizer: parsed.organizer ?? deps.login,
    title: deps.input.patch.title ?? parsed.summary,
    start,
    end,
    timezone,
    attendees: parsed.attendees,
    description: deps.input.patch.description ?? parsed.description,
    location: deps.input.patch.location ?? parsed.location,
    // undefined = preserve existing VALARM; null = explicit clear; number = replace.
    reminderMinutes:
      deps.input.patch.reminder_minutes !== undefined
        ? deps.input.patch.reminder_minutes
        : parsed.reminderMinutes,
    status: "CONFIRMED",
  })

  let resp: any
  try {
    resp = await withTimeout("updateCalendarObject", deps.input.href, async (signal) => {
      return await client.updateCalendarObject({
        calendarObject: {
          url: deps.input.href,
          data: ics,
          etag: deps.input.etag,
        },
        fetchOptions: { signal },
      } as any)
    })
  } catch (err: any) {
    if (err?.status === 412 || /412/.test(String(err))) throw new EventChangedExternally()
    throw err
  }
  if (resp?.status === 412) throw new EventChangedExternally()
  if (resp.ok === false || (typeof resp.status === "number" && resp.status >= 400)) {
    const bodyHint = typeof resp.body === "string" ? resp.body.slice(0, 200) : ""
    throw new Error(
      `updateCalendarObject failed: HTTP ${resp.status ?? "?"} on ${deps.input.href}${bodyHint ? ` — ${bodyHint}` : ""}`,
    )
  }

  const etag = await acquireEtag({
    putResponse: { headers: new Headers((resp?.headers as any) ?? {}) },
    doFollowUpGet: async () => {
      return await withTimeout("GET resource (etag fallback)", deps.input.href, async (signal) => {
        const gr = await fetch(deps.input.href, {
          headers: { authorization: "Basic " + btoa(`${deps.login}:${deps.password}`) },
          signal,
        })
        return { headers: gr.headers }
      })
    },
  })

  return {
    uid: parsed.uid,
    href: deps.input.href,
    etag,
    sequence: newSeq,
    invite_status: "scheduled",
    warnings: [],
  }
}

export interface CancelEventInput {
  uid: string
  href: string
  etag: string
  reason?: string
}

export interface CancelEventResult {
  uid: string
  cancellation: "sent" | "sent_with_warnings"
  warnings: string[]
}

export interface CancelEventDeps {
  caldavUrl: string
  calendarUrl: string
  login: string
  password: string
  input: CancelEventInput
}

export async function cancelEvent(deps: CancelEventDeps): Promise<CancelEventResult> {
  const { createDAVClient } = await import("tsdav")
  const client = await createDAVClient({
    serverUrl: deps.caldavUrl,
    credentials: { username: deps.login, password: deps.password },
    authMethod: "Basic",
  })

  const obj = await rawGet(deps.input.href, deps.login, deps.password, "GET resource (cancel)")
  const parsed = parseVEvent(obj.data)
  if (parsed.uid !== deps.input.uid) throw new UidMismatch(deps.input.uid, parsed.uid)
  if (detectRecurring(parsed)) throw new RecurringEventNotSupported()

  const newSeq = parsed.sequence + 1
  const description = deps.input.reason
    ? `${parsed.description ?? ""}\n[CANCELLED] ${deps.input.reason}`.trim()
    : parsed.description

  const ics = generateEventIcs({
    uid: parsed.uid,
    sequence: newSeq,
    organizer: parsed.organizer ?? deps.login,
    title: parsed.summary,
    start: parsed.start,
    end: parsed.end,
    timezone: parsed.timezone,                // preserve TZID for naive-ISO-Moscow events
    attendees: parsed.attendees,
    description,
    location: parsed.location,
    reminderMinutes: parsed.reminderMinutes,  // preserve existing VALARM on cancel
    status: "CANCELLED",
  })

  let resp: any
  try {
    resp = await withTimeout("updateCalendarObject (cancel)", deps.input.href, async (signal) => {
      return await client.updateCalendarObject({
        calendarObject: { url: deps.input.href, data: ics, etag: deps.input.etag },
        fetchOptions: { signal },
      } as any)
    })
  } catch (err: any) {
    if (err?.status === 412 || /412/.test(String(err))) throw new EventChangedExternally()
    throw err
  }
  if (resp?.status === 412) throw new EventChangedExternally()
  if (resp.ok === false || (typeof resp.status === "number" && resp.status >= 400)) {
    const bodyHint = typeof resp.body === "string" ? resp.body.slice(0, 200) : ""
    throw new Error(
      `updateCalendarObject failed: HTTP ${resp.status ?? "?"} on ${deps.input.href}${bodyHint ? ` — ${bodyHint}` : ""}`,
    )
  }

  // Yandex-specific cleanup: Yandex's CalDAV does not persist STATUS:CANCELLED in stored .ics
  // even though the PUT triggers the CANCEL iTIP scheduling message to attendees. Without an
  // additional DELETE the event remains visible on the user's calendar AND appears as busy in
  // checkAvailability. Confirmed by 2026-05-15 live smoke: cancelled resources stored as
  // SEQUENCE:N with no STATUS line.
  //
  // Order is strict: PUT must succeed first (so the scheduling CANCEL is sent). DELETE failure
  // here is non-fatal — CANCEL email already went out.
  const cancelWarnings: string[] = []
  let cancellationStatus: "sent" | "sent_with_warnings" = "sent"
  try {
    const delRes = await rawDelete(deps.input.href, deps.login, deps.password, "DELETE resource (cancel cleanup)")
    if (delRes.status === 404) {
      cancelWarnings.push("visual_cleanup_already_gone")
    } else if (!delRes.ok) {
      cancellationStatus = "sent_with_warnings"
      cancelWarnings.push(
        `visual_cleanup_failed: HTTP ${delRes.status} on ${deps.input.href}${delRes.bodySnippet ? ` — ${delRes.bodySnippet}` : ""}`,
      )
    }
  } catch (err) {
    cancellationStatus = "sent_with_warnings"
    cancelWarnings.push(`visual_cleanup_failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { uid: parsed.uid, cancellation: cancellationStatus, warnings: cancelWarnings }
}

import { detectUnexpandedMaster } from "./yandex-calendar-ical-parse.ts"

export interface BusyBlock {
  start: string
  end: string
  event_uid?: string
  summary?: string
}

export interface AvailabilityResult {
  busy_blocks: BusyBlock[]
  warnings: string[]
}

export interface CheckAvailabilityDeps {
  caldavUrl: string
  calendarUrl: string
  login: string
  password: string
  from: string
  to: string
  timezone?: string
}

async function runCalendarQuery(
  client: any,
  calendarUrl: string,
  fromUtc: string,
  toUtc: string,
  withExpand: boolean,
): Promise<any[]> {
  // tsdav v2 expects xml-js "compact" shape (prefix:tag keys, `_attributes` for attrs).
  // Earlier draft used the structured `{ name, namespace, attributes }` form, which
  // tsdav serialized as `<d:prop><c:name>…</c:name>…</d:prop>` instead of
  // `<c:calendar-data><c:expand .../></c:calendar-data>` — Yandex rejects that REPORT.
  const calendarDataProp: any = withExpand
    ? { "c:expand": { _attributes: { start: fromUtc, end: toUtc } } }
    : {}

  // withTimeout lets timeout errors propagate just like REPORT errors, which is the
  // correct behavior — a timeout on the expand call should fall back to the non-expand
  // path via the try/catch in checkAvailability, same as a 501 would.
  return await withTimeout("calendarQuery (availability)", calendarUrl, async (signal) => {
    return await client.calendarQuery({
      url: calendarUrl,
      props: {
        "d:getetag": {},
        "c:calendar-data": calendarDataProp,
      },
      filters: [
        {
          "comp-filter": {
            _attributes: { name: "VCALENDAR" },
            "comp-filter": {
              _attributes: { name: "VEVENT" },
              "time-range": { _attributes: { start: fromUtc, end: toUtc } },
            },
          },
        },
      ],
      depth: "1",
      fetchOptions: { signal },
    } as any)
  })
}

export async function checkAvailability(deps: CheckAvailabilityDeps): Promise<AvailabilityResult> {
  // calendarQuery's filters DO accept compact CalDAV form (YYYYMMDDTHHMMSSZ) in
  // structured time-range attributes per RFC 4791 §9.9 — keep toCalDavUtcDateTime here.
  // (listEvents uses isoToUtcIso because tsdav's fetchCalendarObjects.timeRange goes
  // through a different code path that does new Date().toISOString() internally.)
  const fromUtc = toCalDavUtcDateTime(deps.from, deps.timezone)
  const toUtc = toCalDavUtcDateTime(deps.to, deps.timezone)

  const { createDAVClient } = await import("tsdav")
  const client = await createDAVClient({
    serverUrl: deps.caldavUrl,
    credentials: { username: deps.login, password: deps.password },
    authMethod: "Basic",
  })

  const warnings: string[] = []
  let objects: any[]
  try {
    objects = await runCalendarQuery(client, deps.calendarUrl, fromUtc, toUtc, /*withExpand*/ true)
  } catch (err) {
    warnings.push(
      `expand_failed_fallback_without_expand: ${err instanceof Error ? err.message : String(err)}`,
    )
    try {
      objects = await runCalendarQuery(client, deps.calendarUrl, fromUtc, toUtc, /*withExpand*/ false)
    } catch (err2) {
      throw new Error(
        `check_availability failed: REPORT failed both with and without <C:expand/>: ${err2 instanceof Error ? err2.message : String(err2)}`,
      )
    }
  }

  const busy_blocks: BusyBlock[] = []
  for (const obj of objects as any[]) {
    let parsed: ParsedVEvent
    try {
      // tsdav (via xml-js compact) normalizes calendar-data several ways depending on
      // CDATA vs text content. Try the canonical shape first, then fall back through
      // alternates. `obj.data` is the test-stub field; real tsdav doesn't expose it.
      const raw =
        obj.props?.calendarData?._cdata ??
        obj.props?.calendarData ??
        obj.props?.["calendar-data"] ??
        obj.data ??
        ""
      parsed = parseVEvent(raw)
    } catch {
      continue
    }
    if (parsed.status === "CANCELLED") continue
    if (parsed.transp === "TRANSPARENT") continue
    if (detectUnexpandedMaster(parsed)) {
      warnings.push(`recurrence_not_expanded_for_uid:${parsed.uid}`)
      continue
    }
    busy_blocks.push({
      start: parsed.start,
      end: parsed.end,
      event_uid: parsed.uid,
      summary: parsed.summary || undefined,
    })
  }

  return { busy_blocks, warnings }
}
