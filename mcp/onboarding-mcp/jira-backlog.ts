// jira-backlog.ts — мок Jira: заранее заполненные спринты (задачи команды по
// колонкам Бэклог/В работе/В тестировании/Сделано) + бэклог задач, размеченных
// по уровню. План на ИС берёт задачи ИЗ бэклога под уровень новичка, а не
// выдумывает их. Пользователь подтверждает выбор (да / нет / все кроме SCRUM-256).

import { readFile } from "node:fs/promises"
import { SENIORITY_RANK, type Seniority } from "./directory.ts"

export interface BacklogItem {
  key: string
  summary: string
  status: string
  level: Seniority
  area: string
  estimate: number
  skills?: string[]
  good_first_issue?: boolean
}

export interface SprintTask {
  key: string
  summary: string
  assignee: string
  status: string
  level: Seniority
  area: string
  estimate: number
}

export interface JiraBacklog {
  project: string
  board: { columns: string[] }
  sprints: { id: string; state: string; tasks: SprintTask[] }[]
  backlog: BacklogItem[]
}

let cache: { path: string; data: JiraBacklog } | null = null

export async function loadJiraBacklog(p: string): Promise<JiraBacklog> {
  if (cache && cache.path === p) return cache.data
  const data = JSON.parse(await readFile(p, "utf8")) as JiraBacklog
  cache = { path: p, data }
  return data
}

export function resetBacklogCache(): void {
  cache = null
}

/** Роль новичка -> области задач в бэклоге. */
export function roleAreas(role: string): string[] {
  switch (role) {
    case "IT / Разработка":
      return ["backend", "frontend", "mobile"]
    case "QA / Тестирование":
      return ["qa"]
    case "Аналитика данных":
      return ["analytics"]
    default:
      return []
  }
}

export interface SelectedTask extends BacklogItem {
  month: "m1" | "m2" | "m3"
}

export interface SelectOpts {
  role: string
  seniority: Seniority
  exclude?: string[]
  limit?: number
}

/**
 * Кандидаты в план на ИС: задачи из бэклога, посильные для уровня новичка
 * (не сложнее его грейда), из областей его роли. Проще — раньше (m1).
 */
export function selectBacklogForNewbie(backlog: JiraBacklog, opts: SelectOpts): SelectedTask[] {
  const areas = new Set(roleAreas(opts.role))
  const maxRank = SENIORITY_RANK[opts.seniority]
  const exclude = new Set((opts.exclude ?? []).map((k) => k.trim().toUpperCase()))
  const limit = opts.limit ?? 5

  const eligible = backlog.backlog
    .filter((t) => t.status === "Бэклог")
    .filter((t) => areas.has(t.area))
    .filter((t) => SENIORITY_RANK[t.level] <= maxRank)
    .filter((t) => !exclude.has(t.key.toUpperCase()))
    .sort(
      (a, b) =>
        Number(Boolean(b.good_first_issue)) - Number(Boolean(a.good_first_issue)) ||
        a.estimate - b.estimate ||
        a.key.localeCompare(b.key),
    )
    .slice(0, limit)

  // Раскидываем по месяцам ИС: самые лёгкие раньше.
  return eligible.map((t, i) => {
    const third = Math.ceil(eligible.length / 3) || 1
    const month = i < third ? "m1" : i < third * 2 ? "m2" : "m3"
    return { ...t, month: month as "m1" | "m2" | "m3" }
  })
}
