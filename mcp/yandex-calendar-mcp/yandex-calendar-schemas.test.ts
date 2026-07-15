import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { TimeRangeInput, FromToRangeInput } from "./yandex-calendar-schemas.ts"

describe("TimeRangeInput", () => {
  it("accepts zoned ISO for both start and end", () => {
    const r = TimeRangeInput.safeParse({
      start: "2026-05-15T12:00:00+03:00",
      end: "2026-05-15T13:00:00+03:00",
    })
    assert.equal(r.success, true)
  })

  it("accepts naive ISO + timezone=Europe/Moscow for both", () => {
    const r = TimeRangeInput.safeParse({
      start: "2026-05-15T12:00:00",
      end: "2026-05-15T13:00:00",
      timezone: "Europe/Moscow",
    })
    assert.equal(r.success, true)
  })

  it("rejects naive ISO without timezone", () => {
    const r = TimeRangeInput.safeParse({
      start: "2026-05-15T12:00:00",
      end: "2026-05-15T13:00:00",
    })
    assert.equal(r.success, false)
  })

  it("rejects naive ISO with unsupported timezone", () => {
    const r = TimeRangeInput.safeParse({
      start: "2026-05-15T12:00:00",
      end: "2026-05-15T13:00:00",
      timezone: "Europe/Paris",
    })
    assert.equal(r.success, false)
  })

  it("rejects mixed forms (zoned start, naive end)", () => {
    const r = TimeRangeInput.safeParse({
      start: "2026-05-15T12:00:00+03:00",
      end: "2026-05-15T13:00:00",
      timezone: "Europe/Moscow",
    })
    assert.equal(r.success, false)
  })

  it("rejects end ≤ start", () => {
    const r = TimeRangeInput.safeParse({
      start: "2026-05-15T13:00:00+03:00",
      end: "2026-05-15T12:00:00+03:00",
    })
    assert.equal(r.success, false)
  })
})

describe("FromToRangeInput (same rules but from/to naming)", () => {
  it("accepts zoned ISO", () => {
    const r = FromToRangeInput.safeParse({
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00+03:00",
    })
    assert.equal(r.success, true)
  })
  it("rejects to ≤ from", () => {
    const r = FromToRangeInput.safeParse({
      from: "2026-05-16T00:00:00+03:00",
      to: "2026-05-15T00:00:00+03:00",
    })
    assert.equal(r.success, false)
  })
  it("rejects mixed forms", () => {
    const r = FromToRangeInput.safeParse({
      from: "2026-05-15T00:00:00+03:00",
      to: "2026-05-16T00:00:00",
      timezone: "Europe/Moscow",
    })
    assert.equal(r.success, false)
  })
})
