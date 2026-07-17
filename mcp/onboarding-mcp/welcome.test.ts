import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildWelcomeLetter, RESOURCE_MAP } from "./welcome.ts"

describe("buildWelcomeLetter", () => {
  it("addresses the newbie by id and cc's buddy/manager", () => {
    const l = buildWelcomeLetter({ newbie_id: "usr_k1m2n3", role: "IT / Разработка", buddy_id: "usr_a1b2c3", manager_id: "usr_7g8h9j", hr_id: "usr_d4e5f6" })
    assert.deepEqual(l.to, ["usr_k1m2n3"])
    assert.ok(l.cc.includes("usr_a1b2c3"))
    assert.ok(l.cc.includes("usr_7g8h9j"))
    assert.equal(l.needs_approval, true)
  })

  it("includes the resource map (где что находится)", () => {
    const l = buildWelcomeLetter({ newbie_id: "usr_k1m2n3", role: "IT / Разработка" })
    assert.equal(l.resources.length, RESOURCE_MAP.length)
    assert.match(l.body_markdown, /О компании/)
    assert.match(l.body_markdown, /Jira/)
    assert.match(l.body_markdown, /status/)
  })

  it("leaks no PII (only ids, no emails/names)", () => {
    const l = buildWelcomeLetter({ newbie_id: "usr_k1m2n3", role: "IT / Разработка", buddy_id: "usr_a1b2c3", hr_id: "usr_d4e5f6" })
    assert.equal(JSON.stringify(l).includes("@"), false)
  })
})
