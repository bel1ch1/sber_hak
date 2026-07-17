import { describe, it } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadProbationTemplate, buildProbationPlan, buildProbationMeetings, resetProbationCache } from "./probation.ts"

const PKG = path.dirname(fileURLToPath(import.meta.url))
const TPL = path.resolve(PKG, "data/probation_plan.json")

async function tpl() {
  resetProbationCache()
  return loadProbationTemplate(TPL)
}

describe("buildProbationPlan", () => {
  it("expands common + role tasks with sequential ИС refs", async () => {
    const t = await tpl()
    const plan = buildProbationPlan(t, { newbie_id: "usr_k1m2n3", role: "IT / Разработка", start_date: "2026-07-13" })
    assert.equal(plan.matched_role, "IT / Разработка")
    assert.equal(plan.tasks.length, t.common.length + t.by_role["IT / Разработка"].length)
    assert.equal(plan.tasks[0].ref, "ИС-01")
    assert.equal(plan.tasks.at(-1)!.ref, `ИС-${String(plan.tasks.length).padStart(2, "0")}`)
    assert.ok(plan.tasks.some((x) => x.summary.includes("окружение разработки")))
  })

  it("assigns every task to the opaque newbie id (no PII)", async () => {
    const t = await tpl()
    const plan = buildProbationPlan(t, { newbie_id: "usr_k1m2n3", role: "IT / Разработка", start_date: "2026-07-13" })
    assert.ok(plan.tasks.every((x) => x.assignee === "usr_k1m2n3"))
    assert.equal(JSON.stringify(plan).includes("@"), false)
  })

  it("orders tasks by month m1 -> m2 -> m3", async () => {
    const t = await tpl()
    const plan = buildProbationPlan(t, { newbie_id: "usr_k1m2n3", role: "IT / Разработка", start_date: "2026-07-13" })
    const rank = { m1: 0, m2: 1, m3: 2 } as Record<string, number>
    for (let i = 1; i < plan.tasks.length; i++) {
      assert.ok(rank[plan.tasks[i].period] >= rank[plan.tasks[i - 1].period])
    }
  })

  it("computes probation_end = start + 3 months", async () => {
    const t = await tpl()
    const plan = buildProbationPlan(t, { newbie_id: "x", role: "QA / Тестирование", start_date: "2026-07-13" })
    assert.equal(plan.probation_end, "2026-10-13")
    assert.equal(plan.duration_months, 3)
  })

  it("builds an epic and per-month counts", async () => {
    const t = await tpl()
    const plan = buildProbationPlan(t, { newbie_id: "usr_k1m2n3", role: "IT / Разработка", start_date: "2026-07-13" })
    assert.match(plan.epic.summary, /План на ИС/)
    const total = plan.periods.reduce((s, p) => s + p.task_count, 0)
    assert.equal(total, plan.tasks.length)
    assert.equal(plan.periods.length, 3)
  })

  it("falls back to common-only for an unknown role", async () => {
    const t = await tpl()
    const plan = buildProbationPlan(t, { newbie_id: null, role: "Космонавт", start_date: null })
    assert.equal(plan.matched_role, null)
    assert.equal(plan.tasks.length, t.common.length)
    assert.equal(plan.probation_end, null)
    assert.ok(plan.available_roles.includes("IT / Разработка"))
  })
})

describe("buildProbationMeetings", () => {
  it("schedules a monthly HR 1:1 across the probation (3 dates)", () => {
    const m = buildProbationMeetings({ newbie_id: "usr_k1m2n3", start_date: "2026-07-13", hr_id: "usr_d4e5f6", months: 3 })
    const hr = m.find((x) => x.title === "1:1 с HR")
    assert.ok(hr)
    assert.deepEqual(hr!.dates, ["2026-08-13", "2026-09-13", "2026-10-13"])
    assert.deepEqual(hr!.attendees, ["usr_k1m2n3", "usr_d4e5f6"])
  })

  it("adds weekly buddy sync when a buddy is set", () => {
    const m = buildProbationMeetings({ newbie_id: "x", start_date: "2026-07-13", buddy_id: "usr_a1b2c3", hr_id: "usr_d4e5f6" })
    const b = m.find((x) => x.title === "Синк с бадди")
    assert.ok(b)
    assert.equal(b!.dates.length, 4)
  })

  it("returns nothing without a start_date", () => {
    assert.deepEqual(buildProbationMeetings({ newbie_id: "x", start_date: null, hr_id: "y" }), [])
  })
})
