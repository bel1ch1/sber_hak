import { describe, it } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadDirectory, resetDirectoryCache, summarizeDepartments } from "./directory.ts"

const PKG = path.dirname(fileURLToPath(import.meta.url))
const EMP = path.resolve(PKG, "data/employees.json")
const NB = path.resolve(PKG, "data/newbies.json")

describe("loadDirectory", () => {
  it("loads employees + newbies and indexes by id", async () => {
    resetDirectoryCache()
    const dir = await loadDirectory(EMP, NB)
    assert.ok(dir.employees.length >= 10)
    assert.ok(dir.newbies.length >= 2)
    assert.equal(dir.employeeById.get("usr_a1b2c3")?.department, "IT / Разработка")
    assert.ok(dir.newbieById.has("usr_k1m2n3"))
  })

  it("every employee has required fields", async () => {
    resetDirectoryCache()
    const dir = await loadDirectory(EMP, NB)
    for (const e of dir.employees) {
      assert.ok(e.id && e.department && e.team && e.position && e.role, `bad employee ${e.id}`)
      assert.ok(["junior", "middle", "senior", "lead"].includes(e.seniority))
      assert.ok(Array.isArray(e.skills))
    }
  })
})

describe("summarizeDepartments", () => {
  it("groups teams and counts headcount + buddies", async () => {
    resetDirectoryCache()
    const dir = await loadDirectory(EMP, NB)
    const summary = summarizeDepartments(dir.employees)
    const it = summary.find((s) => s.department === "IT / Разработка")
    assert.ok(it)
    assert.ok(it!.headcount >= 3)
    assert.ok(it!.teams.some((t) => t.team === "Platform"))
    assert.ok(it!.buddyCount >= 1)
  })
})
