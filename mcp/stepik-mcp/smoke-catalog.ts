// smoke-catalog.ts — проверка загрузки каталога курсов.
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  buildOnboardingSuggestion,
  listRoles,
  loadCatalog,
  resolveCatalogPath,
} from "./stepik-catalog.ts"

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const catalogPath = resolveCatalogPath(PACKAGE_DIR)
  const courses = await loadCatalog(catalogPath)
  const roles = listRoles(courses)
  const sample = buildOnboardingSuggestion(courses, "IT", true)

  console.log("CATALOG OK")
  console.log("  path:         ", catalogPath)
  console.log("  course_count: ", courses.length)
  console.log("  role_count:   ", roles.length)
  console.log("  sample_role:  ", sample.matchedRole)
  console.log("  sample_plan:  ", sample.courseCount, "courses")
}

main().catch((e) => {
  console.error("\nCATALOG ERROR:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
