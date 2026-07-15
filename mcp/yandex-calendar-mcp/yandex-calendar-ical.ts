// yandex-calendar-ical.ts

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")  // MUST be first
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

const MAX_OCTETS_PER_LINE = 75

export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8")
  if (bytes.length <= MAX_OCTETS_PER_LINE) return line

  const chunks: string[] = []
  let offset = 0
  while (offset < bytes.length) {
    let end = Math.min(offset + MAX_OCTETS_PER_LINE, bytes.length)
    // Step back if we'd split a UTF-8 continuation byte.
    // Continuation bytes have the form 10xxxxxx (bit 7 set, bit 6 clear).
    while (end > offset && end < bytes.length && (bytes[end] & 0xC0) === 0x80) {
      end--
    }
    chunks.push(bytes.subarray(offset, end).toString("utf8"))
    offset = end
  }
  return chunks.join("\r\n ")
}

const TEXT_PROPERTIES = new Set([
  "SUMMARY", "DESCRIPTION", "LOCATION", "COMMENT", "CATEGORIES",
])

export function formatProperty(
  name: string,
  value: string,
  params?: Record<string, string>,
): string {
  let line = name
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      line += `;${k}=${v}`
    }
  }
  const escapedValue = TEXT_PROPERTIES.has(name) ? escapeText(value) : value
  line += `:${escapedValue}`
  return foldLine(line)
}

const SUPPORTED_TZIDS = new Set(["Europe/Moscow"])  // v1: only Moscow
const MOSCOW_OFFSET_MINUTES = 180                    // UTC+3, no DST since 2014

const ISO_ZONED = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/
const ISO_NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

export function toCalDavUtcDateTime(input: string, timezone?: string): string {
  if (ISO_ZONED.test(input)) {
    const ms = Date.parse(input)
    if (Number.isNaN(ms)) throw new Error(`Invalid ISO date-time: ${input}`)
    return msToCalDavUtc(ms)
  }
  if (ISO_NAIVE.test(input)) {
    if (!timezone) {
      throw new Error(
        `Naive ISO date-time ${input} requires explicit timezone; got none. Use zoned ISO (e.g. ${input}+03:00) or pass timezone="Europe/Moscow".`,
      )
    }
    if (!SUPPORTED_TZIDS.has(timezone)) {
      throw new Error(
        `Unsupported timezone "${timezone}" in v1. Only Europe/Moscow is supported for naive ISO; for other zones use zoned ISO form.`,
      )
    }
    const [, y, mo, d, h, mi, s] = ISO_NAIVE.exec(input)!
    const wallUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
    const realUtc = wallUtc - MOSCOW_OFFSET_MINUTES * 60_000
    return msToCalDavUtc(realUtc)
  }
  throw new Error(`Invalid ISO 8601 date-time: ${input}`)
}

function msToCalDavUtc(ms: number): string {
  const d = new Date(ms)
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0")
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0")
  const dd = d.getUTCDate().toString().padStart(2, "0")
  const hh = d.getUTCHours().toString().padStart(2, "0")
  const mi = d.getUTCMinutes().toString().padStart(2, "0")
  const ss = d.getUTCSeconds().toString().padStart(2, "0")
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`
}

export const VTIMEZONE_EUROPE_MOSCOW = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Moscow",
  "BEGIN:STANDARD",
  "DTSTART:20140126T020000",         // when Russia froze permanent UTC+3
  "TZOFFSETFROM:+0400",
  "TZOFFSETTO:+0300",
  "TZNAME:MSK",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n")

export interface EventIcsInput {
  uid: string
  sequence: number
  organizer: string                  // YANDEX_LOGIN email
  title: string
  start: string                      // ISO 8601 (validated upstream by Zod)
  end: string                        // ISO 8601 (validated upstream)
  timezone?: string                  // present iff start/end are naive
  attendees: string[]
  description?: string
  location?: string
  reminderMinutes: number | null
  status: "CONFIRMED" | "CANCELLED"
}

const CRLF = "\r\n"

function dtstampNow(): string {
  return msToCalDavUtc(Date.now())
}

function emitDateTime(name: "DTSTART" | "DTEND", iso: string, tz?: string): string {
  const isNaive = ISO_NAIVE.test(iso)
  if (isNaive && tz) {
    // strip dashes/colons from naive ISO → compact form, keep wall-clock
    const [, y, mo, d, h, mi, s] = ISO_NAIVE.exec(iso)!
    return formatProperty(name, `${y}${mo}${d}T${h}${mi}${s}`, { TZID: tz })
  }
  // zoned (or Z-suffix) → UTC compact
  return formatProperty(name, toCalDavUtcDateTime(iso, tz))
}

export function generateEventIcs(input: EventIcsInput): string {
  const usesTzidForm =
    input.timezone !== undefined &&
    ISO_NAIVE.test(input.start) &&
    ISO_NAIVE.test(input.end)

  const lines: string[] = []
  lines.push("BEGIN:VCALENDAR")
  lines.push("VERSION:2.0")
  lines.push("PRODID:-//openwork-mcp//yandex-calendar//EN")
  lines.push("CALSCALE:GREGORIAN")
  if (usesTzidForm) {
    lines.push(VTIMEZONE_EUROPE_MOSCOW)  // already CRLF-internal; safe to push as block
  }
  lines.push("BEGIN:VEVENT")
  lines.push(formatProperty("UID", input.uid))
  lines.push(formatProperty("DTSTAMP", dtstampNow()))
  lines.push(formatProperty("SEQUENCE", String(input.sequence)))
  lines.push(formatProperty("STATUS", input.status))
  lines.push(formatProperty("SUMMARY", input.title))
  lines.push(emitDateTime("DTSTART", input.start, input.timezone))
  lines.push(emitDateTime("DTEND", input.end, input.timezone))
  if (input.attendees.length > 0) {
    lines.push(
      formatProperty("ORGANIZER", `mailto:${input.organizer}`, {
        CN: input.organizer,
      })
    )
    for (const email of input.attendees) {
      lines.push(
        formatProperty("ATTENDEE", `mailto:${email}`, {
          CUTYPE: "INDIVIDUAL",
          ROLE: "REQ-PARTICIPANT",
          PARTSTAT: "NEEDS-ACTION",
          RSVP: "TRUE",
          CN: email,
        })
      )
    }
  }
  if (input.description) lines.push(formatProperty("DESCRIPTION", input.description))
  if (input.location) lines.push(formatProperty("LOCATION", input.location))
  if (input.reminderMinutes !== null) {
    lines.push("BEGIN:VALARM")
    lines.push(formatProperty("ACTION", "DISPLAY"))
    lines.push(formatProperty("TRIGGER", `-PT${input.reminderMinutes}M`))
    lines.push(formatProperty("DESCRIPTION", input.title))
    lines.push("END:VALARM")
  }
  lines.push("END:VEVENT")
  lines.push("END:VCALENDAR")
  return lines.join(CRLF)
}
