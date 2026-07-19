import { test } from "node:test"
import assert from "node:assert/strict"
import { FromToRangeInput } from "./calendar-schemas.ts"
import { parseEventTime } from "./google-calendar-client.ts"

test("FromToRangeInput accepts Moscow naive pair", () => {
  const p = FromToRangeInput.parse({
    from: "2026-08-04T10:00:00",
    to: "2026-08-04T18:00:00",
    timezone: "Europe/Moscow",
  })
  assert.equal(p.timezone, "Europe/Moscow")
})

test("parseEventTime zoned", () => {
  const d = parseEventTime("2026-08-04T10:00:00+03:00")
  assert.ok(!Number.isNaN(d.getTime()))
})
