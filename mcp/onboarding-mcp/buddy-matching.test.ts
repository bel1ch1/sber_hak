import { describe, it } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { matchBuddies, type BuddyQuery } from "./buddy-matching.ts"
import { loadDirectory, resetDirectoryCache, type Employee } from "./directory.ts"

const PKG = path.dirname(fileURLToPath(import.meta.url))

function emp(over: Partial<Employee> & Pick<Employee, "id">): Employee {
  return {
    name: "n",
    email: "e@x.ru",
    department: "IT / Разработка",
    team: "Platform",
    position: "Engineer",
    role: "IT / Разработка",
    seniority: "senior",
    skills: [],
    responsibilities: [],
    experience_years: 5,
    languages: ["ru"],
    location: "Москва",
    can_be_buddy: true,
    current_mentees: 0,
    ...over,
  }
}

const junior: BuddyQuery = {
  role: "IT / Разработка",
  department: "IT / Разработка",
  team: "Platform",
  seniority: "junior",
  skills: ["Python", "SQL"],
}

describe("matchBuddies (synthetic)", () => {
  it("ranks same-team above same-department above other", () => {
    const pool = [
      emp({ id: "same_team", team: "Platform" }),
      emp({ id: "same_dept", team: "Mobile" }),
      emp({ id: "other", department: "HR", role: "HR", team: "People" }),
    ]
    const r = matchBuddies(pool, junior, 3)
    assert.equal(r[0].buddy_id, "same_team")
    assert.equal(r[1].buddy_id, "same_dept")
  })

  it("excludes non-buddies and the newbie itself", () => {
    const pool = [
      emp({ id: "self" }),
      emp({ id: "not_buddy", can_be_buddy: false }),
      emp({ id: "ok" }),
    ]
    const r = matchBuddies(pool, { ...junior, excludeId: "self" }, 5)
    const ids = r.map((c) => c.buddy_id)
    assert.ok(!ids.includes("self"))
    assert.ok(!ids.includes("not_buddy"))
    assert.ok(ids.includes("ok"))
  })

  it("filters out buddies not senior enough for a junior", () => {
    const pool = [emp({ id: "jun", seniority: "junior" }), emp({ id: "mid", seniority: "middle" })]
    const r = matchBuddies(pool, junior, 5)
    assert.deepEqual(r.map((c) => c.buddy_id), ["mid"])
  })

  it("rewards shared skills and reports them", () => {
    const pool = [
      emp({ id: "skilled", skills: ["Python", "SQL", "Go"] }),
      emp({ id: "noskill", skills: ["Kotlin"] }),
    ]
    const r = matchBuddies(pool, junior, 5)
    assert.equal(r[0].buddy_id, "skilled")
    assert.deepEqual(r[0].shared_skills.sort(), ["Python", "SQL"])
  })

  it("penalizes overloaded mentors as a tie-breaker", () => {
    const pool = [emp({ id: "busy", current_mentees: 3 }), emp({ id: "free", current_mentees: 0 })]
    const r = matchBuddies(pool, junior, 5)
    assert.equal(r[0].buddy_id, "free")
  })

  it("respects the limit (top-3 default)", async () => {
    resetDirectoryCache()
    const dir = await loadDirectory(path.resolve(PKG, "data/employees.json"), path.resolve(PKG, "data/newbies.json"))
    const r = matchBuddies(dir.employees, junior)
    assert.equal(r.length, 3)
    // Platform teammates should top the list for a Platform newbie.
    assert.ok(["usr_a1b2c3", "usr_7g8h9j"].includes(r[0].buddy_id))
    for (const c of r) assert.equal((c as Record<string, unknown>).name, undefined)
  })
})
