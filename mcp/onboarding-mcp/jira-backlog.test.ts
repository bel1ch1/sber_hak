import { describe, it } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadJiraBacklog, selectBacklogForNewbie, roleAreas, resetBacklogCache } from "./jira-backlog.ts"

const PKG = path.dirname(fileURLToPath(import.meta.url))
const BL = path.resolve(PKG, "data/jira_backlog.json")

async function backlog() {
  resetBacklogCache()
  return loadJiraBacklog(BL)
}

describe("roleAreas", () => {
  it("maps roles to task areas", () => {
    assert.deepEqual(roleAreas("IT / Разработка"), ["backend", "frontend", "mobile"])
    assert.deepEqual(roleAreas("QA / Тестирование"), ["qa"])
    assert.deepEqual(roleAreas("Юристы"), [])
  })
})

describe("selectBacklogForNewbie", () => {
  it("picks junior backend tasks for a junior IT newbie, not harder ones", async () => {
    const b = await backlog()
    const sel = selectBacklogForNewbie(b, { role: "IT / Разработка", seniority: "junior" })
    assert.ok(sel.length > 0)
    assert.ok(sel.every((t) => t.area === "backend"))
    assert.ok(sel.every((t) => t.level === "junior")) // junior newbie => no middle+ tasks
    assert.ok(!sel.some((t) => t.key === "SCRUM-270")) // middle task excluded
  })

  it("respects exclude (все кроме SCRUM-256)", async () => {
    const b = await backlog()
    const sel = selectBacklogForNewbie(b, { role: "IT / Разработка", seniority: "junior", exclude: ["SCRUM-256"] })
    assert.ok(!sel.some((t) => t.key === "SCRUM-256"))
  })

  it("only takes items from the backlog column, not sprint work", async () => {
    const b = await backlog()
    const sel = selectBacklogForNewbie(b, { role: "IT / Разработка", seniority: "junior", limit: 10 })
    assert.ok(sel.every((t) => t.status === "Бэклог"))
  })

  it("assigns a month bucket and honors limit", async () => {
    const b = await backlog()
    const sel = selectBacklogForNewbie(b, { role: "IT / Разработка", seniority: "junior", limit: 3 })
    assert.ok(sel.length <= 3)
    assert.ok(sel.every((t) => ["m1", "m2", "m3"].includes(t.month)))
  })

  it("middle newbie also gets middle tasks", async () => {
    const b = await backlog()
    const sel = selectBacklogForNewbie(b, { role: "IT / Разработка", seniority: "middle", limit: 10 })
    assert.ok(sel.some((t) => t.level === "middle"))
  })
})
