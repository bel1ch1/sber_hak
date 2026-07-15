// yandex-calendar-ical.test.ts
import { describe, it, expect } from "bun:test"
import { escapeText } from "./yandex-calendar-ical.ts"

describe("escapeText", () => {
  it("escapes backslash", () => {
    expect(escapeText("a\\b")).toBe("a\\\\b")
  })
  it("escapes semicolon", () => {
    expect(escapeText("a;b")).toBe("a\\;b")
  })
  it("escapes comma", () => {
    expect(escapeText("a,b")).toBe("a\\,b")
  })
  it("converts newline to literal backslash-n", () => {
    expect(escapeText("a\nb")).toBe("a\\nb")
  })
  it("handles all four in one input in correct order", () => {
    expect(escapeText("a\\;,b\nc")).toBe("a\\\\\\;\\,b\\nc")
  })
  it("leaves plain ASCII untouched", () => {
    expect(escapeText("hello world")).toBe("hello world")
  })
  it("leaves cyrillic text untouched", () => {
    expect(escapeText("встреча")).toBe("встреча")
  })
})

import { foldLine } from "./yandex-calendar-ical.ts"

describe("foldLine", () => {
  it("does not fold lines ≤ 75 octets", () => {
    const line = "SUMMARY:short event"
    expect(foldLine(line)).toBe(line)
  })

  it("folds a long ASCII line at 75-octet boundary with CRLF + space", () => {
    const line = "DESCRIPTION:" + "a".repeat(100)  // total 112 octets
    const result = foldLine(line)
    const chunks = result.split("\r\n ")
    expect(chunks[0].length).toBe(75)
    // remaining 37 octets fit in second chunk
    expect(chunks.length).toBe(2)
    expect(chunks.join("")).toBe(line)
  })

  it("does not split a multi-byte UTF-8 codepoint", () => {
    // 'ё' is 2 bytes in UTF-8. Construct a line where the 75th byte
    // would fall inside 'ё', forcing the folder to step back.
    const prefix = "DESCRIPTION:" + "a".repeat(62)  // 74 bytes total
    const line = prefix + "ё" + "b".repeat(50)      // byte 75 is 1st byte of 'ё'
    const result = foldLine(line)
    const firstChunk = result.split("\r\n ")[0]
    // First chunk must end at byte 74 (just before 'ё'), not 75 (mid-char)
    expect(Buffer.byteLength(firstChunk, "utf8")).toBe(74)
  })

  it("uses CRLF + single space as the fold separator", () => {
    const line = "X".repeat(200)
    const result = foldLine(line)
    expect(result.includes("\r\n ")).toBe(true)
    expect(result.includes("\r\n  ")).toBe(false)  // not two spaces
    expect(result.includes("\n ") && !result.includes("\r\n ")).toBe(false)
  })
})

import { formatProperty } from "./yandex-calendar-ical.ts"

describe("formatProperty", () => {
  it("formats name + value only", () => {
    expect(formatProperty("SUMMARY", "Hello")).toBe("SUMMARY:Hello")
  })

  it("formats name + params + value with parameters BEFORE ':'", () => {
    const result = formatProperty("ATTENDEE", "mailto:user@example.com", {
      CUTYPE: "INDIVIDUAL",
      ROLE: "REQ-PARTICIPANT",
      PARTSTAT: "NEEDS-ACTION",
      RSVP: "TRUE",
      CN: "user@example.com",
    })
    const expected =
      "ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=" +
      "\r\n " +
      "TRUE;CN=user@example.com:mailto:user@example.com"
    expect(result).toBe(expected)
  })

  it("escapes special characters in value (TEXT-typed property)", () => {
    expect(formatProperty("SUMMARY", "Meeting; with, friends\nTomorrow")).toBe(
      "SUMMARY:Meeting\\; with\\, friends\\nTomorrow"
    )
  })

  it("folds long line", () => {
    const longValue = "x".repeat(100)
    const result = formatProperty("DESCRIPTION", longValue)
    expect(result.includes("\r\n ")).toBe(true)
  })

  it("DTSTART with TZID parameter stays in name-before-colon form", () => {
    expect(formatProperty("DTSTART", "20260515T120000", { TZID: "Europe/Moscow" })).toBe(
      "DTSTART;TZID=Europe/Moscow:20260515T120000"
    )
  })
})

import { toCalDavUtcDateTime } from "./yandex-calendar-ical.ts"

describe("toCalDavUtcDateTime", () => {
  it("zoned ISO with positive offset converts to UTC compact", () => {
    expect(toCalDavUtcDateTime("2026-05-15T12:00:00+03:00")).toBe("20260515T090000Z")
  })

  it("zoned ISO with negative offset converts to UTC compact", () => {
    expect(toCalDavUtcDateTime("2026-05-15T12:00:00-04:00")).toBe("20260515T160000Z")
  })

  it("naive ISO with Europe/Moscow TZID converts to UTC compact (UTC+3)", () => {
    expect(toCalDavUtcDateTime("2026-05-15T12:00:00", "Europe/Moscow")).toBe("20260515T090000Z")
  })

  it("Z-suffix UTC is identity-transformed", () => {
    expect(toCalDavUtcDateTime("2026-05-15T09:00:00Z")).toBe("20260515T090000Z")
  })

  it("rejects naive ISO without timezone", () => {
    expect(() => toCalDavUtcDateTime("2026-05-15T12:00:00")).toThrow(/timezone/i)
  })

  it("rejects naive ISO with unsupported timezone in v1", () => {
    expect(() => toCalDavUtcDateTime("2026-05-15T12:00:00", "Europe/Paris")).toThrow(/Europe\/Moscow/)
  })

  it("rejects malformed ISO", () => {
    expect(() => toCalDavUtcDateTime("not-a-date")).toThrow()
  })
})

import { VTIMEZONE_EUROPE_MOSCOW } from "./yandex-calendar-ical.ts"

describe("VTIMEZONE_EUROPE_MOSCOW", () => {
  it("is a well-formed VTIMEZONE block", () => {
    expect(VTIMEZONE_EUROPE_MOSCOW).toMatch(/^BEGIN:VTIMEZONE\r\n/)
    expect(VTIMEZONE_EUROPE_MOSCOW).toMatch(/\r\nEND:VTIMEZONE$/)
  })
  it("declares TZID:Europe/Moscow", () => {
    expect(VTIMEZONE_EUROPE_MOSCOW).toMatch(/TZID:Europe\/Moscow/)
  })
  it("declares STANDARD offset +0300 / +0300 with no DST", () => {
    expect(VTIMEZONE_EUROPE_MOSCOW).toMatch(/BEGIN:STANDARD/)
    expect(VTIMEZONE_EUROPE_MOSCOW).toMatch(/TZOFFSETTO:\+0300/)
    expect(VTIMEZONE_EUROPE_MOSCOW).not.toMatch(/BEGIN:DAYLIGHT/)
  })
})

import { generateEventIcs, type EventIcsInput } from "./yandex-calendar-ical.ts"

describe("generateEventIcs", () => {
  const baseInput: EventIcsInput = {
    uid: "test-uid-1@openwork-mcp",
    sequence: 0,
    organizer: "me@yandex.ru",
    title: "Test meeting",
    start: "2026-05-15T12:00:00+03:00",
    end: "2026-05-15T13:00:00+03:00",
    timezone: undefined,
    attendees: ["alice@example.com"],
    description: undefined,
    location: undefined,
    reminderMinutes: null,
    status: "CONFIRMED",
  }

  it("produces a well-formed VCALENDAR / VEVENT pair", () => {
    const ics = generateEventIcs(baseInput)
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics).toMatch(/\r\nEND:VCALENDAR\r?\n?$/)
    expect(ics).toMatch(/BEGIN:VEVENT\r\n[\s\S]+\r\nEND:VEVENT/)
  })

  it("includes UID and DTSTAMP and SEQUENCE", () => {
    const ics = generateEventIcs(baseInput)
    expect(ics).toMatch(/\r\nUID:test-uid-1@openwork-mcp\r\n/)
    expect(ics).toMatch(/\r\nDTSTAMP:\d{8}T\d{6}Z\r\n/)
    expect(ics).toMatch(/\r\nSEQUENCE:0\r\n/)
  })

  it("ORGANIZER and ATTENDEE have parameters BEFORE the colon", () => {
    const ics = generateEventIcs(baseInput)
    // Unfold any iCalendar line folds (CRLF + space) before regex match — the
    // ATTENDEE line is intentionally folded by `formatProperty` (>75 octets) per
    // RFC 5545 §3.1; we test parameter-vs-value placement here, not folding.
    const unfolded = ics.replace(/\r\n /g, "")
    expect(unfolded).toMatch(/\nORGANIZER;CN=me@yandex\.ru:mailto:me@yandex\.ru\r?\n/)
    expect(unfolded).toMatch(
      /\nATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=alice@example\.com:mailto:alice@example\.com\r?\n/
    )
  })

  it("emits zoned ISO inputs as UTC DTSTART without VTIMEZONE", () => {
    const ics = generateEventIcs(baseInput)
    expect(ics).toMatch(/\r\nDTSTART:20260515T090000Z\r\n/)
    expect(ics).toMatch(/\r\nDTEND:20260515T100000Z\r\n/)
    expect(ics).not.toMatch(/BEGIN:VTIMEZONE/)
  })

  it("emits TZID-form DTSTART and VTIMEZONE when timezone is provided with naive ISO", () => {
    const ics = generateEventIcs({
      ...baseInput,
      start: "2026-05-15T12:00:00",
      end: "2026-05-15T13:00:00",
      timezone: "Europe/Moscow",
    })
    expect(ics).toMatch(/BEGIN:VTIMEZONE[\s\S]+TZID:Europe\/Moscow[\s\S]+END:VTIMEZONE/)
    expect(ics).toMatch(/\r\nDTSTART;TZID=Europe\/Moscow:20260515T120000\r\n/)
    expect(ics).toMatch(/\r\nDTEND;TZID=Europe\/Moscow:20260515T130000\r\n/)
  })

  it("STATUS:CANCELLED when status is cancelled", () => {
    const ics = generateEventIcs({ ...baseInput, status: "CANCELLED", sequence: 1 })
    expect(ics).toMatch(/\r\nSTATUS:CANCELLED\r\n/)
    expect(ics).toMatch(/\r\nSEQUENCE:1\r\n/)
  })

  it("emits VALARM with TRIGGER when reminderMinutes set", () => {
    const ics = generateEventIcs({ ...baseInput, reminderMinutes: 10 })
    expect(ics).toMatch(/BEGIN:VALARM\r\n[\s\S]+TRIGGER:-PT10M[\s\S]+END:VALARM/)
  })

  it("omits VALARM block when reminderMinutes is null", () => {
    const ics = generateEventIcs({ ...baseInput, reminderMinutes: null })
    expect(ics).not.toMatch(/BEGIN:VALARM/)
  })

  it("escapes special characters in SUMMARY/DESCRIPTION/LOCATION", () => {
    const ics = generateEventIcs({
      ...baseInput,
      title: "Meeting; with, friends\nTomorrow",
      description: "Notes; line1\nline2",
      location: "Office, 5th floor",
    })
    expect(ics).toMatch(/\r\nSUMMARY:Meeting\\; with\\, friends\\nTomorrow\r\n/)
    expect(ics).toMatch(/\r\nDESCRIPTION:Notes\\; line1\\nline2\r\n/)
    expect(ics).toMatch(/\r\nLOCATION:Office\\, 5th floor\r\n/)
  })

  it("omits ORGANIZER and ATTENDEE when attendees is empty", () => {
    const ics = generateEventIcs({ ...baseInput, attendees: [] })
    expect(ics).not.toMatch(/ORGANIZER/)
    expect(ics).not.toMatch(/ATTENDEE/)
  })
})
