// yandex-calendar-ical-parse.test.ts
import { describe, it, expect } from "bun:test"
import {
  parseVEvent,
  detectRecurring,
  detectUnexpandedMaster,
  type ParsedVEvent,
} from "./yandex-calendar-ical-parse.ts"

const sampleIcs = (extra: string = "") => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:abc@test
DTSTAMP:20260514T120000Z
SEQUENCE:2
STATUS:CONFIRMED
SUMMARY:Meeting
DTSTART:20260515T090000Z
DTEND:20260515T100000Z
ORGANIZER;CN=me@yandex.ru:mailto:me@yandex.ru
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=alice@example.com:mailto:alice@example.com
TRANSP:OPAQUE
${extra}END:VEVENT
END:VCALENDAR`.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")

describe("parseVEvent", () => {
  it("extracts basic fields", () => {
    const parsed = parseVEvent(sampleIcs())
    expect(parsed.uid).toBe("abc@test")
    expect(parsed.sequence).toBe(2)
    expect(parsed.status).toBe("CONFIRMED")
    expect(parsed.summary).toBe("Meeting")
    expect(parsed.attendees).toEqual(["alice@example.com"])
    expect(parsed.transp).toBe("OPAQUE")
  })

  it("captures DTSTART/DTEND as ISO strings", () => {
    const parsed = parseVEvent(sampleIcs())
    expect(parsed.start).toBe("2026-05-15T09:00:00Z")
    expect(parsed.end).toBe("2026-05-15T10:00:00Z")
  })

  it("returns raw RRULE string when present", () => {
    const parsed = parseVEvent(sampleIcs("RRULE:FREQ=WEEKLY;BYDAY=MO\r\n"))
    expect(parsed.rrule).toBe("FREQ=WEEKLY;BYDAY=MO")
  })

  it("tolerates X-properties without crashing", () => {
    const parsed = parseVEvent(sampleIcs("X-YANDEX-CUSTOM:something\r\n"))
    expect(parsed.uid).toBe("abc@test")
  })

  it("captures TZID from DTSTART;TZID=Europe/Moscow form", () => {
    const tzidIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:tz1
DTSTAMP:20260514T120000Z
SUMMARY:Moscow
DTSTART;TZID=Europe/Moscow:20260515T120000
DTEND;TZID=Europe/Moscow:20260515T130000
END:VEVENT
END:VCALENDAR`.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
    const parsed = parseVEvent(tzidIcs)
    expect(parsed.timezone).toBe("Europe/Moscow")
  })

  it("leaves timezone undefined for Z-suffix DTSTART", () => {
    const parsed = parseVEvent(sampleIcs())   // sample uses DTSTART:20260515T090000Z
    expect(parsed.timezone).toBeUndefined()
  })

  it("extracts reminderMinutes from negative VALARM TRIGGER, null when no VALARM", () => {
    const withAlarm = sampleIcs(
      "BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT10M\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\n"
    )
    expect(parseVEvent(withAlarm).reminderMinutes).toBe(10)
    expect(parseVEvent(sampleIcs()).reminderMinutes).toBeNull()
  })
})

describe("detectRecurring (broad — for update/cancel rejection)", () => {
  it("true on RRULE", () => {
    expect(detectRecurring(parseVEvent(sampleIcs("RRULE:FREQ=DAILY\r\n")))).toBe(true)
  })
  it("true on RECURRENCE-ID alone", () => {
    expect(detectRecurring(parseVEvent(sampleIcs("RECURRENCE-ID:20260520T090000Z\r\n")))).toBe(true)
  })
  it("true on EXDATE alone", () => {
    expect(detectRecurring(parseVEvent(sampleIcs("EXDATE:20260520T090000Z\r\n")))).toBe(true)
  })
  it("true on RDATE alone", () => {
    expect(detectRecurring(parseVEvent(sampleIcs("RDATE:20260520T090000Z\r\n")))).toBe(true)
  })
  it("false on plain VEVENT", () => {
    expect(detectRecurring(parseVEvent(sampleIcs()))).toBe(false)
  })
})

describe("detectUnexpandedMaster (narrow — for availability warnings)", () => {
  it("true on RRULE", () => {
    expect(detectUnexpandedMaster(parseVEvent(sampleIcs("RRULE:FREQ=DAILY\r\n")))).toBe(true)
  })
  it("true on EXDATE", () => {
    expect(detectUnexpandedMaster(parseVEvent(sampleIcs("EXDATE:20260520T090000Z\r\n")))).toBe(true)
  })
  it("true on RDATE", () => {
    expect(detectUnexpandedMaster(parseVEvent(sampleIcs("RDATE:20260520T090000Z\r\n")))).toBe(true)
  })
  it("FALSE on RECURRENCE-ID alone (correctly-expanded occurrence)", () => {
    expect(detectUnexpandedMaster(parseVEvent(sampleIcs("RECURRENCE-ID:20260520T090000Z\r\n")))).toBe(false)
  })
  it("false on plain VEVENT", () => {
    expect(detectUnexpandedMaster(parseVEvent(sampleIcs()))).toBe(false)
  })
})
