import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parseAccountsCsv,
  resolveAttendeeIds,
  expandIdsInText,
  maskText,
  maskEventFields,
  maskEmail,
} from "./accounts.ts"

const CSV = `id,email,label,login
usr_manager,mgr@example.com,Manager,Andrey Manager
usr_employee,hire@example.com,Hire,New Hire
usr_buddy,buddy@example.com,Buddy,Buddy Lead
`

test("resolveAttendeeIds returns email + displayName login", () => {
  const dir = parseAccountsCsv(CSV)
  const r = resolveAttendeeIds(dir, ["usr_employee", "usr_buddy"])
  assert.equal(r.unknown.length, 0)
  assert.deepEqual(r.attendees, [
    { email: "hire@example.com", displayName: "New Hire", id: "usr_employee" },
    { email: "buddy@example.com", displayName: "Buddy Lead", id: "usr_buddy" },
  ])
})

test("expandIdsInText replaces ids with login", () => {
  const dir = parseAccountsCsv(CSV)
  const out = expandIdsInText(dir, "Welcome usr_employee with usr_buddy")
  assert.equal(out, "Welcome New Hire with Buddy Lead")
})

test("maskText reverses login and email to ids", () => {
  const dir = parseAccountsCsv(CSV)
  const expanded = "Meet New Hire and hire@example.com"
  const masked = maskText(dir, expanded)
  assert.equal(masked, "Meet usr_employee and usr_employee")
})

test("maskEventFields masks attendees and text fields", () => {
  const dir = parseAccountsCsv(CSV)
  const events = maskEventFields(dir, [
    {
      attendees: ["hire@example.com", "buddy@example.com"],
      title: "Kickoff New Hire",
      description: "onboarding:usr_employee already id; also Buddy Lead",
      location: "Room with mgr@example.com",
    },
  ])
  assert.deepEqual(events[0].attendees, ["usr_employee", "usr_buddy"])
  assert.equal(events[0].title, "Kickoff usr_employee")
  assert.match(events[0].description!, /usr_buddy/)
  assert.equal(events[0].location, "Room with usr_manager")
})

test("maskEventFields prefers stored attendee_ids", () => {
  const dir = parseAccountsCsv(CSV)
  const events = maskEventFields(dir, [
    {
      attendees: ["hire@example.com"],
      attendee_ids: ["usr_employee", "usr_buddy"],
      title: "Kickoff New Hire",
    },
  ])
  assert.deepEqual(events[0].attendees, ["usr_employee", "usr_buddy"])
  assert.equal((events[0] as { attendee_ids?: string[] }).attendee_ids, undefined)
})
