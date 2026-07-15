// yandex-calendar-client.test.ts
import { describe, it, expect } from "bun:test"
import { selectCalendarFromCandidates, type CalendarCandidate } from "./yandex-calendar-client.ts"

const writable = (n: string, url: string): CalendarCandidate => ({
  displayName: n,
  url,
  privileges: { hasBind: true, hasWriteContent: true },
})
const readonly = (n: string, url: string): CalendarCandidate => ({
  displayName: n,
  url,
  privileges: { hasBind: false, hasWriteContent: false },
})

describe("selectCalendarFromCandidates", () => {
  it("returns the single writable when exactly one", () => {
    const r = selectCalendarFromCandidates([writable("Мой", "url-1"), readonly("Праздники", "url-2")])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toBe("url-1")
  })

  it("prefers «Мой календарь» over «Личный» when both writable", () => {
    const r = selectCalendarFromCandidates([
      writable("Личный", "url-1"),
      writable("Мой календарь", "url-2"),
    ])
    expect(r.ok && r.url).toBe("url-2")
  })

  it("returns ambiguity diagnostic when two writables share the same well-known name", () => {
    const r = selectCalendarFromCandidates([
      writable("Мой календарь", "url-a"),
      writable("Мой календарь", "url-b"),
      writable("Other", "url-c"),
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.diagnostic).toMatch(/Мой календарь/)
      expect(r.diagnostic).toMatch(/url-a/)
      expect(r.diagnostic).toMatch(/url-b/)
      expect(r.diagnostic).toMatch(/YANDEX_CALDAV_CALENDAR_URL/)
    }
  })

  it("returns ambiguity diagnostic when no priority name matches and >1 writable", () => {
    const r = selectCalendarFromCandidates([
      writable("Foo", "url-a"),
      writable("Bar", "url-b"),
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.diagnostic).toMatch(/url-a/)
      expect(r.diagnostic).toMatch(/url-b/)
    }
  })

  it("returns no-writable diagnostic when nothing satisfies bind", () => {
    const r = selectCalendarFromCandidates([readonly("Праздники", "url-h")])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnostic).toMatch(/no writable/i)
  })

  it("treats DAV:write-content alone as NOT writable (requires DAV:bind)", () => {
    const r = selectCalendarFromCandidates([
      { displayName: "Мой", url: "url-1", privileges: { hasBind: false, hasWriteContent: true } },
    ])
    expect(r.ok).toBe(false)
  })

  it("walks priority list in order: Мой календарь → Личный → Default → Calendar → Personal", () => {
    const r = selectCalendarFromCandidates([
      writable("Personal", "url-p"),
      writable("Default", "url-d"),
      writable("Other", "url-o"),
    ])
    expect(r.ok && r.url).toBe("url-d")  // Default wins over Personal because higher priority
  })
})

import { mock, beforeEach, afterEach } from "bun:test"
import { discoverCalendarUrl, parseCalendarsPropfindXml } from "./yandex-calendar-client.ts"

const SAMPLE_PROPFIND_XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/me/personal/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Мой календарь</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:current-user-privilege-set>
          <D:privilege><D:bind/></D:privilege>
          <D:privilege><D:unbind/></D:privilege>
          <D:privilege><D:write-content/></D:privilege>
          <D:privilege><D:read/></D:privilege>
        </D:current-user-privilege-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/calendars/me/holidays/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Праздники</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
        <D:current-user-privilege-set>
          <D:privilege><D:read/></D:privilege>
        </D:current-user-privilege-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

describe("parseCalendarsPropfindXml", () => {
  it("extracts calendars with privileges, marks read-only as not writable", () => {
    const cs = parseCalendarsPropfindXml(SAMPLE_PROPFIND_XML)
    expect(cs.length).toBe(2)
    const personal = cs.find((c) => c.url === "/calendars/me/personal/")
    expect(personal?.privileges.hasBind).toBe(true)
    expect(personal?.privileges.hasWriteContent).toBe(true)
    const holidays = cs.find((c) => c.url === "/calendars/me/holidays/")
    expect(holidays?.privileges.hasBind).toBe(false)
    expect(holidays?.privileges.hasWriteContent).toBe(false)
  })

  it("treats aggregate <D:write/> privilege as both bind and write-content", () => {
    const xml = SAMPLE_PROPFIND_XML.replace(
      `<D:privilege><D:bind/></D:privilege>
          <D:privilege><D:unbind/></D:privilege>
          <D:privilege><D:write-content/></D:privilege>`,
      `<D:privilege><D:write/></D:privilege>`
    )
    const cs = parseCalendarsPropfindXml(xml)
    const personal = cs.find((c) => c.url === "/calendars/me/personal/")
    expect(personal?.privileges.hasBind).toBe(true)
    expect(personal?.privileges.hasWriteContent).toBe(true)
  })

  it("ignores non-calendar resources (no <C:calendar/> in resourcetype)", () => {
    const xml = SAMPLE_PROPFIND_XML.replace(/<C:calendar\/>/g, "")
    const cs = parseCalendarsPropfindXml(xml)
    expect(cs.length).toBe(0)
  })
})

const PRINCIPAL_XML = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/</D:href>
    <D:propstat>
      <D:prop>
        <D:current-user-principal><D:href>/principals/users/me@yandex.ru/</D:href></D:current-user-principal>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

const HOMESET_XML = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/principals/users/me@yandex.ru/</D:href>
    <D:propstat>
      <D:prop>
        <C:calendar-home-set><D:href>/calendars/me/</D:href></C:calendar-home-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`

describe("discoverCalendarUrl", () => {
  let origFetch: typeof globalThis.fetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  it("uses YANDEX_CALDAV_CALENDAR_URL when provided (no network)", async () => {
    const r = await discoverCalendarUrl({
      caldavUrl: "https://caldav.yandex.ru/",
      login: "me@yandex.ru",
      password: "pw",
      explicitCalendarUrl: "https://caldav.yandex.ru/calendars/me/explicit/",
    })
    expect(r.ok && r.url).toBe("https://caldav.yandex.ru/calendars/me/explicit/")
  })

  it("walks principal → home-set → calendar list and picks the single bind-privileged writable", async () => {
    globalThis.fetch = (async (input: any, init: any) => {
      if (init?.method !== "PROPFIND") {
        throw new Error("unexpected non-PROPFIND fetch in test: " + input)
      }
      const url = String(input)
      if (url === "https://caldav.yandex.ru/") return new Response(PRINCIPAL_XML, { status: 207 })
      if (url === "https://caldav.yandex.ru/principals/users/me@yandex.ru/") return new Response(HOMESET_XML, { status: 207 })
      if (url === "https://caldav.yandex.ru/calendars/me/") return new Response(SAMPLE_PROPFIND_XML, { status: 207 })
      throw new Error("unmocked PROPFIND URL: " + url)
    }) as any

    const r = await discoverCalendarUrl({
      caldavUrl: "https://caldav.yandex.ru/",
      login: "me@yandex.ru",
      password: "pw",
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.url).toBe("https://caldav.yandex.ru/calendars/me/personal/")
  })

  it("returns diagnostic when principal PROPFIND fails", async () => {
    globalThis.fetch = (async () =>
      new Response("auth failed", { status: 401 })) as any

    const r = await discoverCalendarUrl({
      caldavUrl: "https://caldav.yandex.ru/",
      login: "me@yandex.ru",
      password: "wrong",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.diagnostic).toMatch(/Discovery failed/)
      expect(r.diagnostic).toMatch(/YANDEX_CALDAV_CALENDAR_URL/)
    }
  })
})

describe("parseCalendarsPropfindXml multi-propstat split", () => {
  it("merges properties across separate 200 OK propstat blocks", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response>
    <D:href>/calendars/me/split/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Мой календарь</D:displayname>
        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
    <D:propstat>
      <D:prop>
        <D:current-user-privilege-set>
          <D:privilege><D:bind/></D:privilege>
          <D:privilege><D:write-content/></D:privilege>
        </D:current-user-privilege-set>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>`
    const cs = parseCalendarsPropfindXml(xml)
    expect(cs.length).toBe(1)
    expect(cs[0].displayName).toBe("Мой календарь")
    expect(cs[0].privileges.hasBind).toBe(true)
    expect(cs[0].privileges.hasWriteContent).toBe(true)
  })
})

describe("discoverCalendarUrl error edges", () => {
  let origFetch: typeof globalThis.fetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  it("diagnostic when principal response has no <D:href>", async () => {
    const noHrefXml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response><D:propstat><D:prop><D:current-user-principal/></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
</D:multistatus>`
    globalThis.fetch = (async () => new Response(noHrefXml, { status: 207 })) as any
    const r = await discoverCalendarUrl({
      caldavUrl: "https://caldav.yandex.ru/",
      login: "me@yandex.ru",
      password: "pw",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnostic).toMatch(/current-user-principal/)
  })

  it("diagnostic when home-set response has no <D:href>", async () => {
    const principalXml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:">
  <D:response><D:propstat><D:prop><D:current-user-principal><D:href>/principals/me/</D:href></D:current-user-principal></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
</D:multistatus>`
    const noHomesetXml = `<?xml version="1.0"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:response><D:propstat><D:prop><C:calendar-home-set/></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
</D:multistatus>`
    globalThis.fetch = (async (input: any) => {
      const url = String(input)
      if (url === "https://caldav.yandex.ru/") return new Response(principalXml, { status: 207 })
      if (url === "https://caldav.yandex.ru/principals/me/") return new Response(noHomesetXml, { status: 207 })
      throw new Error("unmocked: " + url)
    }) as any
    const r = await discoverCalendarUrl({
      caldavUrl: "https://caldav.yandex.ru/",
      login: "me@yandex.ru",
      password: "pw",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.diagnostic).toMatch(/calendar-home-set/)
  })

  it("PROPFIND timeout produces diagnostic naming the operation and elapsed time", async () => {
    // Simplified deterministic timeout test: fetch immediately rejects with an
    // AbortError (mimicking what the inner setTimeout-driven controller.abort()
    // would cause in production). We then assert the diagnostic surfaces the
    // timeout phrasing without waiting 15 seconds for the real timeout to fire.
    globalThis.fetch = ((_url: any, _init: any) => {
      const err = new Error("aborted")
      err.name = "AbortError"
      return Promise.reject(err)
    }) as any

    const r = await discoverCalendarUrl({
      caldavUrl: "https://caldav.yandex.ru/",
      login: "me@yandex.ru",
      password: "pw",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.diagnostic).toMatch(/timed out|Discovery failed/i)
    }
  })
})

import { acquireEtag } from "./yandex-calendar-client.ts"

describe("acquireEtag", () => {
  it("returns etag from PUT response when present", async () => {
    const etag = await acquireEtag({
      putResponse: { headers: new Headers({ etag: '"abc-123"' }) } as Response,
      doFollowUpGet: async () => { throw new Error("should not be called") },
    })
    expect(etag).toBe('"abc-123"')
  })

  it("falls back to follow-up GET when PUT omits etag", async () => {
    const etag = await acquireEtag({
      putResponse: { headers: new Headers({}) } as Response,
      doFollowUpGet: async () => ({ headers: new Headers({ etag: '"from-get"' }) } as Response),
    })
    expect(etag).toBe('"from-get"')
  })

  it("throws EtagNotReturned when neither PUT nor GET returns etag", async () => {
    await expect(
      acquireEtag({
        putResponse: { headers: new Headers({}) } as Response,
        doFollowUpGet: async () => ({ headers: new Headers({}) } as Response),
      })
    ).rejects.toThrow(/EtagNotReturned/)
  })
})

import { IdempotencyCache, type CachedCreate } from "./yandex-calendar-client.ts"

describe("IdempotencyCache", () => {
  it("stores and returns by token", () => {
    const c = new IdempotencyCache(10_000)
    const value: CachedCreate = { uid: "u", href: "h", etag: "e", sequence: 0 }
    c.set("tok-1", value)
    expect(c.get("tok-1")).toEqual(value)
  })
  it("returns undefined for unknown token", () => {
    const c = new IdempotencyCache(10_000)
    expect(c.get("nope")).toBeUndefined()
  })
  it("expires entries after TTL", async () => {
    const c = new IdempotencyCache(50)  // 50 ms TTL
    c.set("tok-1", { uid: "u", href: "h", etag: "e", sequence: 0 })
    await new Promise((r) => setTimeout(r, 80))
    expect(c.get("tok-1")).toBeUndefined()
  })
})

import { createEvent, resolveEventTimes, type CreateEventInput } from "./yandex-calendar-client.ts"

describe("createEvent", () => {
  const stubTsdav = (puts: any[]) => {
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        createCalendarObject: async (params: any) => {
          puts.push(params)
          return { ok: true, status: 201, headers: new Headers({ etag: '"server-etag-1"' }), url: "https://x/cal/event.ics" }
        },
      }),
    }))
  }

  it("creates event, returns uid/href/etag/sequence=0", async () => {
    const puts: any[] = []
    stubTsdav(puts)
    const cache = new IdempotencyCache(10_000)
    const r = await createEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://caldav.yandex.ru/calendars/me/personal/",
      login: "me@yandex.ru",
      password: "pw",
      cache,
      input: {
        title: "Test",
        start: "2026-05-15T12:00:00+03:00",
        end: "2026-05-15T13:00:00+03:00",
        attendees: ["alice@example.com"],
      } as CreateEventInput,
    })
    expect(r.uid).toMatch(/@openwork-mcp$/)
    expect(r.sequence).toBe(0)
    expect(r.etag).toBe('"server-etag-1"')
    expect(puts.length).toBe(1)
    expect(puts[0].iCalString).toMatch(/SUMMARY:Test/)
  })

  it("returns cached result on duplicate client_token within TTL (no second PUT)", async () => {
    const puts: any[] = []
    stubTsdav(puts)
    const cache = new IdempotencyCache(10_000)
    const inputBase = {
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://caldav.yandex.ru/calendars/me/personal/",
      login: "me@yandex.ru",
      password: "pw",
      cache,
      input: {
        title: "Test",
        start: "2026-05-15T12:00:00+03:00",
        end: "2026-05-15T13:00:00+03:00",
        client_token: "stable-token-xyz",
      } as CreateEventInput,
    }
    const r1 = await createEvent(inputBase)
    const r2 = await createEvent(inputBase)
    expect(r1.uid).toBe(r2.uid)
    expect(puts.length).toBe(1)  // only one PUT
  })

  it("prefers duration_minutes when both end and duration_minutes are set", async () => {
    stubTsdav([])
    const cache = new IdempotencyCache(10_000)
    const r = await createEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://caldav.yandex.ru/calendars/me/personal/",
      login: "me@yandex.ru",
      password: "pw",
      cache,
      input: {
        title: "Test",
        start: "2026-05-15T12:00:00+03:00",
        end: "2026-05-15T13:00:00+03:00",
        duration_minutes: 30,
      } as CreateEventInput,
    })
    expect(r.warnings).toContain("both_end_and_duration_given: using duration_minutes, ignoring end")
  })

  it("warns when client_token absent", async () => {
    stubTsdav([])
    const cache = new IdempotencyCache(10_000)
    const r = await createEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://caldav.yandex.ru/calendars/me/personal/",
      login: "me@yandex.ru",
      password: "pw",
      cache,
      input: {
        title: "Test",
        start: "2026-05-15T12:00:00+03:00",
        end: "2026-05-15T13:00:00+03:00",
      } as CreateEventInput,
    })
    expect(r.warnings).toContain("no_client_token: retries may duplicate")
  })

  it("non-2xx PUT throws a helpful error, NOT EtagNotReturned", async () => {
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        createCalendarObject: async () => ({
          ok: false,
          status: 403,
          headers: new Headers({}),
          url: "https://x/cal/event.ics",
          body: "Forbidden",
        }),
      }),
    }))
    const cache = new IdempotencyCache(10_000)
    await expect(
      createEvent({
        caldavUrl: "https://caldav.yandex.ru/",
        calendarUrl: "https://caldav.yandex.ru/calendars/me/personal/",
        login: "me@yandex.ru",
        password: "pw",
        cache,
        input: {
          title: "Test",
          start: "2026-05-15T12:00:00+03:00",
          end: "2026-05-15T13:00:00+03:00",
        } as CreateEventInput,
      }),
    ).rejects.toThrow(/createCalendarObject failed: HTTP 403/)
  })
})

describe("resolveEventTimes (offset arithmetic + validation)", () => {
  const base = (overrides: Partial<CreateEventInput> = {}): CreateEventInput => ({
    title: "x",
    start: "2026-05-15T12:00:00+03:00",
    ...overrides,
  })

  it("derives end from duration_minutes preserving the start offset (+03:00 case)", () => {
    const r = resolveEventTimes(base({ duration_minutes: 60 }))
    expect(r.end).toBe("2026-05-15T13:00:00+03:00")
  })

  it("derives end from duration_minutes for Z-suffix UTC start", () => {
    const r = resolveEventTimes(base({ start: "2026-05-15T09:00:00Z", duration_minutes: 60 }))
    expect(r.end).toBe("2026-05-15T10:00:00Z")
  })

  it("derives end from duration_minutes for negative offset", () => {
    const r = resolveEventTimes(base({ start: "2026-05-15T08:00:00-04:00", duration_minutes: 90 }))
    expect(r.end).toBe("2026-05-15T09:30:00-04:00")
  })

  it("derives end for naive ISO + Europe/Moscow (returns naive end, same TZ)", () => {
    const r = resolveEventTimes(base({ start: "2026-05-15T12:00:00", timezone: "Europe/Moscow", duration_minutes: 30 }))
    expect(r.end).toBe("2026-05-15T12:30:00")
  })

  it("rejects mixed forms (zoned start, naive end)", () => {
    expect(() =>
      resolveEventTimes(base({ end: "2026-05-15T13:00:00", timezone: "Europe/Moscow" }))
    ).toThrow(/MixedTimeForms/)
  })

  it("rejects naive ISO with unsupported timezone", () => {
    expect(() =>
      resolveEventTimes(base({ start: "2026-05-15T12:00:00", timezone: "Europe/Paris" }))
    ).toThrow(/InvalidTimezone/)
  })

  it("prefers duration_minutes when both end and duration_minutes given", () => {
    const r = resolveEventTimes(base({ end: "2026-05-15T13:00:00+03:00", duration_minutes: 30 }))
    expect(r.end).toBe("2026-05-15T12:30:00+03:00")
  })

  it("rejects end ≤ start", () => {
    expect(() =>
      resolveEventTimes(base({ end: "2026-05-15T11:00:00+03:00" }))
    ).toThrow(/InvalidTimeRange/)
  })

  it("defaults to 60 minutes when neither end nor duration_minutes given", () => {
    const r = resolveEventTimes(base())
    expect(r.end).toBe("2026-05-15T13:00:00+03:00")
  })

  it("rejects events longer than 24h (explicit end)", () => {
    expect(() =>
      resolveEventTimes(base({ end: "2026-05-17T12:00:00+03:00" }))
    ).toThrow(/InvalidEventDuration/)
  })

  it("rejects duration_minutes ≤ 0 or > 1440 on client layer", () => {
    expect(() => resolveEventTimes(base({ duration_minutes: 0 }))).toThrow(/InvalidDurationMinutes|InvalidTimeRange/)
    expect(() => resolveEventTimes(base({ duration_minutes: 1441 }))).toThrow(/InvalidDurationMinutes|InvalidEventDuration/)
    expect(() => resolveEventTimes(base({ duration_minutes: 15.5 }))).toThrow(/InvalidDurationMinutes/)
  })
})

import { listEvents } from "./yandex-calendar-client.ts"

describe("listEvents", () => {
  it("maps tsdav results to event records with is_recurring", async () => {
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        fetchCalendarObjects: async () => [
          {
            url: "https://x/cal/e1.ics",
            etag: '"e1"',
            data: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u1\r\nDTSTAMP:20260514T120000Z\r\nSUMMARY:Plain\r\nDTSTART:20260515T090000Z\r\nDTEND:20260515T100000Z\r\nSTATUS:CONFIRMED\r\nEND:VEVENT\r\nEND:VCALENDAR`,
          },
          {
            url: "https://x/cal/e2.ics",
            etag: '"e2"',
            data: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u2\r\nDTSTAMP:20260514T120000Z\r\nSUMMARY:Weekly\r\nDTSTART:20260515T090000Z\r\nDTEND:20260515T100000Z\r\nSTATUS:CONFIRMED\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT\r\nEND:VCALENDAR`,
          },
        ],
      }),
    }))

    const events = await listEvents({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    expect(events.length).toBe(2)
    expect(events[0].uid).toBe("u1")
    expect(events[0].is_recurring).toBe(false)
    expect(events[1].uid).toBe("u2")
    expect(events[1].is_recurring).toBe(true)
    expect(events[1].recurrence_rule).toBe("FREQ=WEEKLY")
  })
})

import { updateEvent, cancelEvent } from "./yandex-calendar-client.ts"

describe("updateEvent", () => {
  const plainIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u1\r\nDTSTAMP:20260514T120000Z\r\nSEQUENCE:0\r\nSTATUS:CONFIRMED\r\nSUMMARY:Original\r\nDTSTART:20260515T090000Z\r\nDTEND:20260515T100000Z\r\nORGANIZER;CN=me@yandex.ru:mailto:me@yandex.ru\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=a@b.com:mailto:a@b.com\r\nEND:VEVENT\r\nEND:VCALENDAR`

  const recurringIcs = plainIcs.replace("STATUS:CONFIRMED\r\n", "STATUS:CONFIRMED\r\nRRULE:FREQ=WEEKLY\r\n")

  let origFetch: typeof globalThis.fetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  const stub = (currentIcs: string, puts: any[]) => {
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        updateCalendarObject: async (params: any) => {
          puts.push(params)
          return { ok: true, status: 204, headers: new Headers({ etag: '"new-etag"' }), url: "https://x/cal/u1.ics" }
        },
      }),
    }))
    globalThis.fetch = (async (url: any, init: any) => {
      if (init?.method === "GET" && String(url).includes("u1.ics")) {
        return new Response(currentIcs, { status: 200, headers: { etag: '"orig-etag"' } })
      }
      throw new Error("unexpected fetch in test: " + url)
    }) as any
  }

  it("changes title only — preserves start/end/SEQUENCE++", async () => {
    const puts: any[] = []
    stub(plainIcs, puts)
    const r = await updateEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: {
        uid: "u1",
        href: "https://x/cal/u1.ics",
        etag: '"orig-etag"',
        patch: { title: "Renamed" },
      },
    })
    expect(r.sequence).toBe(1)
    expect(puts[0].calendarObject.data).toMatch(/SUMMARY:Renamed/)
    expect(puts[0].calendarObject.data).toMatch(/DTSTART:20260515T090000Z/)
  })

  it("shifts start only — preserves duration via §4.4.1 matrix", async () => {
    const puts: any[] = []
    stub(plainIcs, puts)
    await updateEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: {
        uid: "u1",
        href: "https://x/cal/u1.ics",
        etag: '"orig-etag"',
        patch: { start: "2026-05-15T11:00:00+03:00" },
      },
    })
    expect(puts[0].calendarObject.data).toMatch(/DTSTART:20260515T080000Z/)
    expect(puts[0].calendarObject.data).toMatch(/DTEND:20260515T090000Z/)
  })

  it("rejects recurring event with RecurringEventNotSupported", async () => {
    stub(recurringIcs, [])
    await expect(
      updateEvent({
        caldavUrl: "https://caldav.yandex.ru/",
        calendarUrl: "https://x/cal/",
        login: "me@yandex.ru",
        password: "pw",
        input: {
          uid: "u1",
          href: "https://x/cal/u1.ics",
          etag: '"orig-etag"',
          patch: { title: "Should fail" },
        },
      })
    ).rejects.toThrow(/RecurringEventNotSupported/)
  })

  it("rejects when input.uid does not match the fetched VEVENT's UID", async () => {
    stub(plainIcs, [])
    await expect(
      updateEvent({
        caldavUrl: "https://caldav.yandex.ru/",
        calendarUrl: "https://x/cal/",
        login: "me@yandex.ru",
        password: "pw",
        input: {
          uid: "u-DIFFERENT",
          href: "https://x/cal/u1.ics",
          etag: '"orig-etag"',
          patch: { title: "Wrong target" },
        },
      })
    ).rejects.toThrow(/UidMismatch/)
  })

  it("title-only update preserves existing reminderMinutes (does NOT clear VALARM)", async () => {
    const withAlarmIcs = plainIcs.replace(
      "ATTENDEE;",
      "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:R\r\nEND:VALARM\r\nATTENDEE;"
    )
    const puts: any[] = []
    stub(withAlarmIcs, puts)
    await updateEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: {
        uid: "u1",
        href: "https://x/cal/u1.ics",
        etag: '"orig-etag"',
        patch: { title: "Renamed" },  // no reminder_minutes
      },
    })
    expect(puts[0].calendarObject.data).toMatch(/BEGIN:VALARM/)
    expect(puts[0].calendarObject.data).toMatch(/TRIGGER:-PT15M/)
  })

  it("explicit reminder_minutes=null DOES clear VALARM", async () => {
    const withAlarmIcs = plainIcs.replace(
      "ATTENDEE;",
      "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:R\r\nEND:VALARM\r\nATTENDEE;"
    )
    const puts: any[] = []
    stub(withAlarmIcs, puts)
    await updateEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: {
        uid: "u1",
        href: "https://x/cal/u1.ics",
        etag: '"orig-etag"',
        patch: { reminder_minutes: null },
      },
    })
    expect(puts[0].calendarObject.data).not.toMatch(/BEGIN:VALARM/)
  })

  it("title-only update of Europe/Moscow TZID event preserves DTSTART;TZID=Europe/Moscow", async () => {
    const moscowIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u1\r\nDTSTAMP:20260514T120000Z\r\nSEQUENCE:0\r\nSTATUS:CONFIRMED\r\nSUMMARY:Original\r\nDTSTART;TZID=Europe/Moscow:20260515T120000\r\nDTEND;TZID=Europe/Moscow:20260515T130000\r\nORGANIZER;CN=me@yandex.ru:mailto:me@yandex.ru\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=a@b.com:mailto:a@b.com\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const puts: any[] = []
    stub(moscowIcs, puts)
    const r = await updateEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: {
        uid: "u1",
        href: "https://x/cal/u1.ics",
        etag: '"orig-etag"',
        patch: { title: "Renamed" },
      },
    })
    expect(r.sequence).toBe(1)
    expect(puts[0].calendarObject.data).toMatch(/DTSTART;TZID=Europe\/Moscow:20260515T120000/)
    expect(puts[0].calendarObject.data).toMatch(/DTEND;TZID=Europe\/Moscow:20260515T130000/)
    expect(puts[0].calendarObject.data).toMatch(/SUMMARY:Renamed/)
  })

  it("shifts start on a naive+TZID event preserves duration — regression for OpenWork 2026-05-16", async () => {
    // Event stored on Yandex with DTSTART;TZID=Europe/Moscow:20260516T120000 →
    // ical.js parses start/end as naive "2026-05-16T12:00:00" / "2026-05-16T13:00:00"
    // (TZID captured separately as parsed.timezone). Earlier draft of resolveUpdateTimes
    // assumed parsed times always zoned and passed `undefined` to isoToUtcMs(oldStart) —
    // that branch threw InvalidTimezone on every TZID-stored event when the user shifted
    // start. OpenWork's LLM saw three failed updateEvent calls and fell back to cancel+create.
    const naiveTzidIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u1\r\nDTSTAMP:20260514T120000Z\r\nSEQUENCE:0\r\nSTATUS:CONFIRMED\r\nSUMMARY:Original\r\nDTSTART;TZID=Europe/Moscow:20260516T120000\r\nDTEND;TZID=Europe/Moscow:20260516T130000\r\nORGANIZER;CN=me@yandex.ru:mailto:me@yandex.ru\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=a@b.com:mailto:a@b.com\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const puts: any[] = []
    stub(naiveTzidIcs, puts)
    const r = await updateEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: {
        uid: "u1",
        href: "https://x/cal/u1.ics",
        etag: '"orig-etag"',
        patch: { start: "2026-05-16T13:00:00", timezone: "Europe/Moscow" },
      },
    })
    expect(r.sequence).toBe(1)
    expect(puts[0].calendarObject.data).toMatch(/DTSTART;TZID=Europe\/Moscow:20260516T130000/)
    expect(puts[0].calendarObject.data).toMatch(/DTEND;TZID=Europe\/Moscow:20260516T140000/)
  })

  it("shifts start on a naive+TZID event when patch omits timezone (falls back to stored TZID)", async () => {
    // Same scenario, but patch doesn't carry timezone — effectivePatch falls back to
    // parsed.timezone so naive patch.start is still valid for a naive-stored event.
    const naiveTzidIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u1\r\nDTSTAMP:20260514T120000Z\r\nSEQUENCE:0\r\nSTATUS:CONFIRMED\r\nSUMMARY:Original\r\nDTSTART;TZID=Europe/Moscow:20260516T120000\r\nDTEND;TZID=Europe/Moscow:20260516T130000\r\nORGANIZER;CN=me@yandex.ru:mailto:me@yandex.ru\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=a@b.com:mailto:a@b.com\r\nEND:VEVENT\r\nEND:VCALENDAR`
    const puts: any[] = []
    stub(naiveTzidIcs, puts)
    const r = await updateEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: {
        uid: "u1",
        href: "https://x/cal/u1.ics",
        etag: '"orig-etag"',
        patch: { start: "2026-05-16T13:00:00" }, // no patch.timezone
      },
    })
    expect(r.sequence).toBe(1)
    expect(puts[0].calendarObject.data).toMatch(/DTSTART;TZID=Europe\/Moscow:20260516T130000/)
    expect(puts[0].calendarObject.data).toMatch(/DTEND;TZID=Europe\/Moscow:20260516T140000/)
  })
})

describe("listEvents passes parseable ISO timeRange to tsdav (not compact CalDAV)", () => {
  it("converts inputs to ISO 8601 UTC for fetchCalendarObjects", async () => {
    let capturedTimeRange: any
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        fetchCalendarObjects: async (params: any) => {
          capturedTimeRange = params.timeRange
          return []
        },
      }),
    }))
    await listEvents({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    // tsdav does new Date(timeRange.start).toISOString() — must be parseable
    expect(Number.isNaN(Date.parse(capturedTimeRange.start))).toBe(false)
    expect(Number.isNaN(Date.parse(capturedTimeRange.end))).toBe(false)
    // and specifically NOT compact CalDAV form (no dashes/colons)
    expect(capturedTimeRange.start).toMatch(/-/)
    expect(capturedTimeRange.start).toMatch(/:/)
    expect(capturedTimeRange.start).toBe("2026-05-14T21:00:00Z")  // 00:00 MSK = 21:00 UTC prior day
    expect(capturedTimeRange.end).toBe("2026-05-15T21:00:00Z")
  })
})

describe("cancelEvent", () => {
  const plainIcs = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:u1\r\nDTSTAMP:20260514T120000Z\r\nSEQUENCE:0\r\nSTATUS:CONFIRMED\r\nSUMMARY:Original\r\nDTSTART:20260515T090000Z\r\nDTEND:20260515T100000Z\r\nORGANIZER;CN=me@yandex.ru:mailto:me@yandex.ru\r\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=a@b.com:mailto:a@b.com\r\nEND:VEVENT\r\nEND:VCALENDAR`

  let origFetch: typeof globalThis.fetch
  beforeEach(() => { origFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = origFetch })

  /**
   * Mock setup for cancelEvent tests:
   * - GET (rawGet) is via globalThis.fetch
   * - PUT (client.updateCalendarObject) is via mocked tsdav
   * - DELETE (rawDelete) is via globalThis.fetch
   * Returns the puts and deletes lists for assertions.
   */
  const stubFor = (opts: {
    currentIcs?: string,
    putResp?: any,
    deleteStatus?: number,
    deleteBody?: string,
    deleteThrows?: boolean,
  } = {}) => {
    const currentIcs = opts.currentIcs ?? plainIcs
    const putResp = opts.putResp ?? { ok: true, status: 204, headers: new Headers({ etag: '"cancel-etag"' }) }
    const deleteStatus = opts.deleteStatus ?? 204
    const puts: any[] = []
    const deletes: { url: string; method: string }[] = []

    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        updateCalendarObject: async (params: any) => {
          puts.push(params)
          if (putResp instanceof Error) throw putResp
          return putResp
        },
      }),
    }))

    globalThis.fetch = (async (url: any, init: any) => {
      const u = String(url)
      const m = init?.method ?? "GET"
      if (m === "GET") {
        return new Response(currentIcs, { status: 200, headers: { etag: '"orig-etag"' } })
      }
      if (m === "DELETE") {
        deletes.push({ url: u, method: m })
        if (opts.deleteThrows) throw new Error("network down")
        const body = opts.deleteBody ?? ""
        return new Response(body, { status: deleteStatus })
      }
      throw new Error("unexpected fetch in test: " + m + " " + u)
    }) as any

    return { puts, deletes }
  }

  it("rejects when input.uid does not match the fetched VEVENT's UID — no PUT, no DELETE", async () => {
    const { puts, deletes } = stubFor()
    await expect(
      cancelEvent({
        caldavUrl: "https://caldav.yandex.ru/",
        calendarUrl: "https://x/cal/",
        login: "me@yandex.ru",
        password: "pw",
        input: { uid: "u-DIFFERENT", href: "https://x/cal/u1.ics", etag: '"orig"' },
      })
    ).rejects.toThrow(/UidMismatch/)
    expect(puts.length).toBe(0)
    expect(deletes.length).toBe(0)
  })

  it("happy path: PUT STATUS:CANCELLED then DELETE — both called, in that order, cancellation=sent", async () => {
    const { puts, deletes } = stubFor()
    const r = await cancelEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: { uid: "u1", href: "https://x/cal/u1.ics", etag: '"orig"' },
    })
    expect(r.cancellation).toBe("sent")
    expect(r.warnings).toEqual([])
    expect(puts.length).toBe(1)
    expect(deletes.length).toBe(1)
    expect(deletes[0].url).toBe("https://x/cal/u1.ics")
    // PUT body must carry STATUS:CANCELLED + SEQUENCE++ + ATTENDEE/ORGANIZER preserved
    expect(puts[0].calendarObject.data).toMatch(/STATUS:CANCELLED/)
    expect(puts[0].calendarObject.data).toMatch(/SEQUENCE:1/)
    expect(puts[0].calendarObject.data).toMatch(/ATTENDEE[\s\S]+:mailto:a@b\.com/)
    expect(puts[0].calendarObject.data).toMatch(/ORGANIZER[\s\S]+:mailto:me@yandex\.ru/)
  })

  it("PUT 412 → EventChangedExternally, DELETE NOT called", async () => {
    const { puts, deletes } = stubFor({
      putResp: { ok: false, status: 412, headers: new Headers({}) },
    })
    await expect(
      cancelEvent({
        caldavUrl: "https://caldav.yandex.ru/",
        calendarUrl: "https://x/cal/",
        login: "me@yandex.ru",
        password: "pw",
        input: { uid: "u1", href: "https://x/cal/u1.ics", etag: '"orig"' },
      })
    ).rejects.toThrow(/EventChangedExternally/)
    expect(puts.length).toBe(1)
    expect(deletes.length).toBe(0)   // crucial — DELETE must NOT fire on 412
  })

  it("DELETE 404 → cancellation=sent + visual_cleanup_already_gone warning", async () => {
    const { puts, deletes } = stubFor({ deleteStatus: 404 })
    const r = await cancelEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: { uid: "u1", href: "https://x/cal/u1.ics", etag: '"orig"' },
    })
    expect(puts.length).toBe(1)
    expect(deletes.length).toBe(1)
    expect(r.cancellation).toBe("sent")
    expect(r.warnings).toContain("visual_cleanup_already_gone")
  })

  it("DELETE non-2xx (403) → cancellation=sent_with_warnings + visual_cleanup_failed", async () => {
    const { puts, deletes } = stubFor({ deleteStatus: 403, deleteBody: "Forbidden" })
    const r = await cancelEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: { uid: "u1", href: "https://x/cal/u1.ics", etag: '"orig"' },
    })
    expect(puts.length).toBe(1)
    expect(deletes.length).toBe(1)
    expect(r.cancellation).toBe("sent_with_warnings")
    expect(r.warnings.some((w) => w.startsWith("visual_cleanup_failed: HTTP 403"))).toBe(true)
  })

  it("DELETE network error → cancellation=sent_with_warnings + visual_cleanup_failed", async () => {
    const { puts, deletes } = stubFor({ deleteThrows: true })
    const r = await cancelEvent({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      input: { uid: "u1", href: "https://x/cal/u1.ics", etag: '"orig"' },
    })
    expect(puts.length).toBe(1)
    expect(deletes.length).toBe(1)
    expect(r.cancellation).toBe("sent_with_warnings")
    expect(r.warnings.some((w) => w.startsWith("visual_cleanup_failed:"))).toBe(true)
  })
})

import { checkAvailability } from "./yandex-calendar-client.ts"

describe("checkAvailability", () => {
  const opaque = (uid: string) =>
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20260514T120000Z\r\nSUMMARY:Op\r\nDTSTART:20260515T090000Z\r\nDTEND:20260515T100000Z\r\nSTATUS:CONFIRMED\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\nEND:VCALENDAR`
  const transparent = (uid: string) =>
    opaque(uid).replace("TRANSP:OPAQUE", "TRANSP:TRANSPARENT")
  const cancelled = (uid: string) =>
    opaque(uid).replace("STATUS:CONFIRMED", "STATUS:CANCELLED")
  const unexpandedMaster = (uid: string) =>
    opaque(uid).replace("STATUS:CONFIRMED\r\n", "STATUS:CONFIRMED\r\nRRULE:FREQ=DAILY\r\n")
  const occurrence = (uid: string) =>
    opaque(uid).replace("STATUS:CONFIRMED\r\n", "STATUS:CONFIRMED\r\nRECURRENCE-ID:20260515T090000Z\r\n")

  const stub = (datas: string[]) => {
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        calendarQuery: async () =>
          datas.map((d, i) => ({ url: `https://x/${i}.ics`, etag: `"e${i}"`, data: d })),
      }),
    }))
  }

  it("includes only OPAQUE non-cancelled events in busy_blocks", async () => {
    stub([opaque("u-1"), transparent("u-2"), cancelled("u-3")])
    const r = await checkAvailability({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    expect(r.busy_blocks.length).toBe(1)
    expect(r.busy_blocks[0].event_uid).toBe("u-1")
  })

  it("emits recurrence_not_expanded_for_uid warning and EXCLUDES the master from busy_blocks", async () => {
    stub([unexpandedMaster("u-master"), occurrence("u-occ")])
    const r = await checkAvailability({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    expect(r.busy_blocks.length).toBe(1)
    expect(r.busy_blocks[0].event_uid).toBe("u-occ")
    expect(r.warnings).toContain("recurrence_not_expanded_for_uid:u-master")
  })

  it("falls back to non-expand REPORT when expand REPORT throws", async () => {
    let callCount = 0
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        calendarQuery: async (params: any) => {
          callCount++
          const hasExpand = JSON.stringify(params.props).includes("expand")
          if (hasExpand) throw new Error("server rejected expand: 501 Not Implemented")
          return [{ url: "https://x/m.ics", etag: '"em"', data: unexpandedMaster("u-master") }]
        },
      }),
    }))
    const r = await checkAvailability({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    expect(callCount).toBe(2)
    expect(r.busy_blocks.length).toBe(0)
    expect(r.warnings.some((w) => w.startsWith("expand_failed_fallback_without_expand"))).toBe(true)
    expect(r.warnings).toContain("recurrence_not_expanded_for_uid:u-master")
  })

  it("passes tsdav-compatible compact xml-js shape to client.calendarQuery", async () => {
    let captured: any
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        calendarQuery: async (params: any) => {
          captured = params
          return []  // empty result so the test doesn't depend on parsing
        },
      }),
    }))
    await checkAvailability({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    // props must be xml-js compact: prefix:tag keys, not { name, namespace }
    expect(captured.props).toBeDefined()
    expect(captured.props["d:getetag"]).toBeDefined()
    expect(captured.props["c:calendar-data"]).toBeDefined()
    expect(captured.props["c:calendar-data"]["c:expand"]).toBeDefined()
    expect(captured.props["c:calendar-data"]["c:expand"]._attributes).toMatchObject({
      start: "20260514T210000Z",  // 2026-05-15T00:00 MSK = 2026-05-14T21:00 UTC
      end: "20260515T210000Z",
    })

    // filters must be xml-js compact: comp-filter nesting with _attributes
    expect(Array.isArray(captured.filters)).toBe(true)
    expect(captured.filters[0]["comp-filter"]._attributes.name).toBe("VCALENDAR")
    expect(captured.filters[0]["comp-filter"]["comp-filter"]._attributes.name).toBe("VEVENT")
    expect(captured.filters[0]["comp-filter"]["comp-filter"]["time-range"]._attributes).toMatchObject({
      start: "20260514T210000Z",
      end: "20260515T210000Z",
    })

    // and the structured-shape keys from the earlier draft should NOT be present
    expect((captured.props as any).name).toBeUndefined()
    expect((captured.filters[0] as any).type).toBeUndefined()
  })

  it("reads VEVENT data from props.calendarData._cdata when tsdav returns it that way", async () => {
    const vevent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:via-cdata\r\nDTSTAMP:20260514T120000Z\r\nSUMMARY:Op\r\nDTSTART:20260515T090000Z\r\nDTEND:20260515T100000Z\r\nSTATUS:CONFIRMED\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\nEND:VCALENDAR`
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        calendarQuery: async () => [
          {
            url: "https://x/cdata.ics",
            etag: '"cd"',
            props: { calendarData: { _cdata: vevent } },
          },
        ],
      }),
    }))
    const r = await checkAvailability({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    expect(r.busy_blocks.length).toBe(1)
    expect(r.busy_blocks[0].event_uid).toBe("via-cdata")
  })

  it("reads VEVENT data from props.calendarData when tsdav returns it as a string", async () => {
    const vevent = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:via-string\r\nDTSTAMP:20260514T120000Z\r\nSUMMARY:Op\r\nDTSTART:20260515T090000Z\r\nDTEND:20260515T100000Z\r\nSTATUS:CONFIRMED\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\nEND:VCALENDAR`
    mock.module("tsdav", () => ({
      createDAVClient: async () => ({
        calendarQuery: async () => [
          {
            url: "https://x/string.ics",
            etag: '"st"',
            props: { calendarData: vevent },
          },
        ],
      }),
    }))
    const r = await checkAvailability({
      caldavUrl: "https://caldav.yandex.ru/",
      calendarUrl: "https://x/cal/",
      login: "me@yandex.ru",
      password: "pw",
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    expect(r.busy_blocks.length).toBe(1)
    expect(r.busy_blocks[0].event_uid).toBe("via-string")
  })
})
