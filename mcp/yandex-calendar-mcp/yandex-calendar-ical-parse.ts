// yandex-calendar-ical-parse.ts

// ical.js v2 ships its own types; the wildcard import keeps us isolated from API churn.
import ICAL from "ical.js"

export interface ParsedVEvent {
  uid: string
  sequence: number
  status: "CONFIRMED" | "CANCELLED" | "TENTATIVE"
  summary: string
  start: string                   // ISO 8601 zoned (Z if originally UTC; +HH:MM otherwise)
  end: string
  attendees: string[]             // emails (mailto: stripped)
  organizer?: string              // email (mailto: stripped)
  description?: string
  location?: string
  transp: "OPAQUE" | "TRANSPARENT"
  // TZID parsed from DTSTART (e.g. "Europe/Moscow"). Undefined when DTSTART is UTC ("Z")
  // or floating. Used by updateEvent/cancelEvent to re-emit DTSTART in the same form.
  timezone?: string
  // Minutes-before-start for the first negative VALARM TRIGGER (e.g. TRIGGER:-PT10M → 10).
  // null when no VALARM is present or no negative trigger is found.
  reminderMinutes: number | null
  rrule?: string                  // raw RRULE value
  hasRecurrenceId: boolean
  hasExdate: boolean
  hasRdate: boolean
  hasRrule: boolean
  raw: string                     // original .ics text (for re-serialize-on-update flows)
}

function stripMailto(value: string): string {
  return value.replace(/^mailto:/i, "")
}

export function parseVEvent(icsText: string): ParsedVEvent {
  const jcal = ICAL.parse(icsText)
  const vcal = new ICAL.Component(jcal)
  const vevent = vcal.getFirstSubcomponent("vevent")
  if (!vevent) throw new Error("No VEVENT found in iCalendar input")
  const event = new ICAL.Event(vevent)

  const attendees: string[] = []
  for (const a of vevent.getAllProperties("attendee")) {
    attendees.push(stripMailto(a.getFirstValue() as string))
  }
  const organizerProp = vevent.getFirstProperty("organizer")
  const organizer = organizerProp ? stripMailto(organizerProp.getFirstValue() as string) : undefined

  const transpProp = vevent.getFirstProperty("transp")
  const transp = (transpProp?.getFirstValue() as string | undefined) === "TRANSPARENT"
    ? "TRANSPARENT"
    : "OPAQUE"

  const rruleProp = vevent.getFirstProperty("rrule")
  const rrule = rruleProp ? rruleProp.getFirstValue().toString() : undefined

  // Extract TZID from the DTSTART property parameters. ical.js exposes Time.zone.tzid
  // or .timezone; we read whichever ical.js v2 makes available, then filter out UTC/floating.
  const dtstartProp = vevent.getFirstProperty("dtstart")
  let timezone: string | undefined
  if (dtstartProp) {
    const tzidParam = dtstartProp.getParameter("tzid")
    if (typeof tzidParam === "string" && tzidParam.length > 0) {
      timezone = tzidParam
    }
  }

  // Parse the first VALARM's negative TRIGGER as minutes-before.
  // Positive triggers (after-start alarms) are not preserved — they're outside v1's reminder semantics.
  let reminderMinutes: number | null = null
  const valarm = vevent.getFirstSubcomponent("valarm")
  if (valarm) {
    const trigger = valarm.getFirstProperty("trigger")
    if (trigger) {
      const triggerValue = trigger.getFirstValue() as any
      if (triggerValue && typeof triggerValue.toSeconds === "function") {
        const seconds = triggerValue.toSeconds()
        if (seconds < 0) {
          reminderMinutes = Math.round(-seconds / 60)
        }
      }
    }
  }

  return {
    uid: event.uid,
    sequence: (vevent.getFirstPropertyValue("sequence") as number | null) ?? 0,
    status: (vevent.getFirstPropertyValue("status") as ParsedVEvent["status"]) ?? "CONFIRMED",
    summary: event.summary ?? "",
    start: event.startDate.toString(),
    end: event.endDate.toString(),
    attendees,
    organizer,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    transp,
    timezone,
    reminderMinutes,
    rrule,
    hasRecurrenceId: vevent.getFirstProperty("recurrence-id") !== null,
    hasExdate: vevent.getAllProperties("exdate").length > 0,
    hasRdate: vevent.getAllProperties("rdate").length > 0,
    hasRrule: rrule !== undefined,
    raw: icsText,
  }
}

export function detectRecurring(parsed: ParsedVEvent): boolean {
  return parsed.hasRrule || parsed.hasRecurrenceId || parsed.hasExdate || parsed.hasRdate
}

export function detectUnexpandedMaster(parsed: ParsedVEvent): boolean {
  return parsed.hasRrule || parsed.hasExdate || parsed.hasRdate
}
