// smoke.ts — быстрый прогон: загрузка датасетов, подбор бадди, прогресс/ворнинги.
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadDirectory, resolveDataPath, summarizeDepartments } from "./directory.ts"
import { matchBuddies } from "./buddy-matching.ts"
import { computeProgress, resolveToday } from "./progress.ts"

const PKG = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const dir = await loadDirectory(
    resolveDataPath(PKG, process.env.ONBOARDING_EMPLOYEES_PATH, "data/employees.json"),
    resolveDataPath(PKG, process.env.ONBOARDING_NEWBIES_PATH, "data/newbies.json"),
  )
  const today = resolveToday()

  console.log("SMOKE OK")
  console.log("  employees:  ", dir.employees.length)
  console.log("  newbies:    ", dir.newbies.length)
  console.log("  departments:", summarizeDepartments(dir.employees).length)
  console.log("  today:      ", today)

  for (const nb of dir.newbies) {
    const p = computeProgress(nb, today)
    console.log(`\n  ${nb.id} · ${nb.role} · день ${p.day}`)
    console.log(`    прогресс: ${p.percent}% [${p.status}]  ворнинги: ${p.warnings.map((w) => w.code).join(", ") || "—"}`)
    if (!nb.assigned_buddy_id) {
      const top = matchBuddies(dir.employees, {
        role: nb.role,
        department: nb.department,
        team: nb.team,
        seniority: nb.seniority,
        skills: nb.skills,
        excludeId: nb.id,
      })
      console.log(`    топ-бадди: ${top.map((c) => `${c.buddy_id}(${c.score})`).join(", ")}`)
    } else {
      console.log(`    бадди:    ${nb.assigned_buddy_id} (назначен)`)
    }
  }
}

main().catch((e) => {
  console.error("SMOKE ERROR:", e instanceof Error ? e.stack ?? e.message : e)
  process.exit(1)
})
