import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"

import { appendEnrollment, resolveEnrollmentsPath } from "./enrollments-store.ts"

test("resolveEnrollmentsPath: default under package dir", () => {
  const p = resolveEnrollmentsPath("/app/stepik-mcp")
  assert.equal(p, path.resolve("/app/stepik-mcp", "enrollments.json"))
})

test("appendEnrollment: writes record with id and timestamp", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "stepik-enroll-"))
  const filePath = path.join(dir, "enrollments.json")
  try {
    const rec = await appendEnrollment(filePath, {
      employee_id: "usr_employee",
      role: "backend",
      courses: [
        {
          title: "Python: основы",
          description: "Вводный курс",
          url: "https://stepik.org/course/93704",
        },
      ],
    })
    assert.ok(rec.enrollment_id)
    assert.equal(rec.employee_id, "usr_employee")
    assert.equal(rec.courses.length, 1)
    assert.ok(rec.enrolled_at)

    const raw = JSON.parse(await readFile(filePath, "utf8")) as unknown[]
    assert.equal(raw.length, 1)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
