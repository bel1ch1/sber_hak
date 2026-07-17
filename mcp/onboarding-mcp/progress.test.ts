import { describe, it } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { computeProgress } from "./progress.ts"
import { loadDirectory, resetDirectoryCache, type Directory } from "./directory.ts"

const PKG = path.dirname(fileURLToPath(import.meta.url))
const TODAY = "2026-07-17"

async function dir(): Promise<Directory> {
  resetDirectoryCache()
  return loadDirectory(path.resolve(PKG, "data/employees.json"), path.resolve(PKG, "data/newbies.json"))
}

function warnCodes(codes: { code: string }[]): string[] {
  return codes.map((w) => w.code).sort()
}

describe("computeProgress — alpha (usr_k1m2n3), day 4, stuck", () => {
  it("30% with buddy/courses/no-task warnings and at_risk status", async () => {
    const d = await dir()
    const p = computeProgress(d.newbieById.get("usr_k1m2n3")!, TODAY)
    assert.equal(p.day, 4)
    assert.equal(p.percent, 30)
    assert.equal(p.status, "at_risk")
    assert.deepEqual(warnCodes(p.warnings), ["BUDDY_NOT_ASSIGNED", "COURSES_NOT_STARTED", "NO_TASK_IN_PROGRESS"])
    assert.equal(p.jira.has_active_task, false)
    // critical sorts first
    assert.equal(p.warnings[0].code, "BUDDY_NOT_ASSIGNED")
  })
})

describe("computeProgress — bravo (usr_p4q5r6), day 11, mostly done", () => {
  it("100% with only a stalled-task warning", async () => {
    const d = await dir()
    const p = computeProgress(d.newbieById.get("usr_p4q5r6")!, TODAY)
    assert.equal(p.day, 11)
    assert.equal(p.percent, 100)
    assert.deepEqual(warnCodes(p.warnings), ["TASK_STALLED"])
    assert.equal(p.jira.done, 1)
    assert.equal(p.jira.has_active_task, true)
    assert.equal(p.jira.stalled[0].key, "SCRUM-21")
    assert.equal(p.status, "attention")
  })
})

describe("computeProgress — charlie (usr_nb_003), day 1, grace period", () => {
  it("suppresses course/no-task warnings before grace but still flags missing buddy", async () => {
    const d = await dir()
    const p = computeProgress(d.newbieById.get("usr_nb_003")!, TODAY)
    assert.equal(p.day, 1)
    assert.deepEqual(warnCodes(p.warnings), ["BUDDY_NOT_ASSIGNED"])
    assert.equal(p.status, "at_risk")
  })
})

describe("markdown", () => {
  it("includes a progress bar and warnings section", async () => {
    const d = await dir()
    const p = computeProgress(d.newbieById.get("usr_k1m2n3")!, TODAY)
    assert.match(p.markdown, /Прогресс/)
    assert.match(p.markdown, /Ворнинги/)
    assert.match(p.markdown, /Бадди не назначен/)
  })
})
