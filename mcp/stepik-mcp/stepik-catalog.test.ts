import { test } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  buildOnboardingSuggestion,
  listRoles,
  loadCatalog,
  matchRole,
  resetCatalogCache,
} from "./stepik-catalog.ts"
import { buildServer } from "./server.ts"

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))
const CATALOG_PATH = path.resolve(PACKAGE_DIR, "..", "stepik_courses_by_role.xlsx")

test("matchRole: aliases and exact match", () => {
  const roles = ["HR", "IT / Разработка", "QA / Тестирование", "Soft Skills (все роли)"]
  assert.equal(matchRole("IT", roles), "IT / Разработка")
  assert.equal(matchRole("qa", roles), "QA / Тестирование")
  assert.equal(matchRole("HR", roles), "HR")
  assert.equal(matchRole("unknown role xyz", roles), null)
})

test("loadCatalog: reads workspace Excel", async () => {
  resetCatalogCache()
  const courses = await loadCatalog(CATALOG_PATH)
  assert.ok(courses.length >= 30)
  assert.ok(courses.every((c) => c.courseId > 0))
  assert.ok(courses.every((c) => c.url.includes("stepik.org/course/")))
})

test("buildOnboardingSuggestion: IT role includes soft skills and dedup", async () => {
  resetCatalogCache()
  const courses = await loadCatalog(CATALOG_PATH)
  const plan = buildOnboardingSuggestion(courses, "IT", true)
  assert.equal(plan.matchedRole, "IT / Разработка")
  assert.ok(plan.courseCount >= 8)
  assert.ok(plan.markdown.includes("stepik.org/course/"))
  const ids = plan.courses.map((c) => c.courseId)
  assert.equal(ids.length, new Set(ids).size)
})

test("listRoles: includes HR", async () => {
  resetCatalogCache()
  const courses = await loadCatalog(CATALOG_PATH)
  const roles = listRoles(courses)
  assert.ok(roles.some((r) => r.role === "HR" && r.courseCount === 4))
})
