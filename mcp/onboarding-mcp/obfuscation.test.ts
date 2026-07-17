import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { isObfuscationEnabled, maskEmployee, maskNewbie, hasPii } from "./obfuscation.ts"
import type { Employee, Newbie } from "./directory.ts"

const emp: Employee = {
  id: "usr_a1b2c3",
  name: "Иван Петров",
  email: "ivan.petrov@yandex.ru",
  department: "IT / Разработка",
  team: "Platform",
  position: "Senior Backend Engineer",
  role: "IT / Разработка",
  seniority: "senior",
  skills: ["Python", "Go"],
  responsibilities: ["Менторинг"],
  experience_years: 8,
  languages: ["ru"],
  location: "Москва",
  can_be_buddy: true,
  current_mentees: 1,
}

const nb: Newbie = {
  id: "usr_k1m2n3",
  name: "Алексей Новиков",
  email: "newbie.alpha@yandex.ru",
  role: "IT / Разработка",
  position: "Junior Backend Engineer",
  seniority: "junior",
  department: "IT / Разработка",
  team: "Platform",
  skills: ["Python"],
  start_date: "2026-07-13",
  assigned_buddy_id: null,
  assigned_course_roles: ["IT / Разработка"],
  checklist: { access_granted: true, docs_read: true, intro_meeting_done: false, courses_assigned: true, courses_started: false },
  jira: { assignee: "usr_k1m2n3", tasks: [] },
}

describe("isObfuscationEnabled", () => {
  it("defaults on", () => assert.equal(isObfuscationEnabled({}), true))
  it("honors falsey", () => {
    for (const v of ["false", "0", "no", "off"]) assert.equal(isObfuscationEnabled({ ONBOARDING_OBFUSCATION: v }), false)
  })
})

describe("maskEmployee", () => {
  it("strips name/email when enabled and keeps match attributes", () => {
    const p = maskEmployee(emp, true)
    assert.equal(p.id, "usr_a1b2c3")
    assert.equal(p.department, "IT / Разработка")
    assert.deepEqual(p.skills, ["Python", "Go"])
    assert.equal(p.name, undefined)
    assert.equal(p.email, undefined)
    assert.equal(hasPii(p), false)
  })
  it("includes name/email when disabled (admin mode)", () => {
    const p = maskEmployee(emp, false)
    assert.equal(p.name, "Иван Петров")
    assert.equal(hasPii(p), true)
  })
})

describe("maskNewbie", () => {
  it("strips PII when enabled", () => {
    const p = maskNewbie(nb, true)
    assert.equal(p.id, "usr_k1m2n3")
    assert.equal(p.name, undefined)
    assert.equal(p.email, undefined)
    assert.equal(p.assigned_buddy_id, null)
    assert.equal(hasPii(p), false)
  })
})
