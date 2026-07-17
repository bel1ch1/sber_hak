// probation.ts — «План на испытательный срок (ИС)»: мок-шаблон -> готовые задачи
// для Jira. Задачи в Jira должны формироваться ИЗ этого плана, а не выдумываться.
//
// Агент вызывает onboarding_probation_plan(newbie_id), получает epic + список
// задач по месяцам ИС (с assignee = обезличенный id новичка) и создаёт их через
// MCP Jira. Пункт 7 классического процесса («Формирование плана на ИС»).

import { readFile } from "node:fs/promises"

export interface PlanPeriod {
  id: string
  label: string
  weeks: string
}

export interface PlanTaskTemplate {
  period: string
  week: number
  type: string
  summary: string
  description: string
  acceptance: string
}

export interface ProbationTemplate {
  meta: { title: string; duration_months: number; periods: PlanPeriod[] }
  common: PlanTaskTemplate[]
  by_role: Record<string, PlanTaskTemplate[]>
}

export interface ProbationTask extends PlanTaskTemplate {
  ref: string
  period_label: string
  scope: "common" | "role"
  assignee: string | null
}

export interface ProbationPlan {
  newbie_id: string | null
  role: string
  matched_role: string | null
  start_date: string | null
  probation_end: string | null
  duration_months: number
  epic: { summary: string; description: string }
  periods: { id: string; label: string; weeks: string; task_count: number }[]
  tasks: ProbationTask[]
  jira_hint: string
  available_roles: string[]
}

let cache: { path: string; tpl: ProbationTemplate } | null = null

export async function loadProbationTemplate(templatePath: string): Promise<ProbationTemplate> {
  if (cache && cache.path === templatePath) return cache.tpl
  const tpl = JSON.parse(await readFile(templatePath, "utf8")) as ProbationTemplate
  cache = { path: templatePath, tpl }
  return tpl
}

export function resetProbationCache(): void {
  cache = null
}

function matchRole(role: string, template: ProbationTemplate): string | null {
  const keys = Object.keys(template.by_role)
  const exact = keys.find((k) => k === role)
  if (exact) return exact
  const norm = (s: string) => s.trim().toLowerCase()
  return keys.find((k) => norm(k) === norm(role)) ?? null
}

/** start_date + n месяцев (по календарю), ISO YYYY-MM-DD. */
function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z")
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getUTCDate()
  d.setUTCMonth(d.getUTCMonth() + months)
  // защита от «перелистывания» (31 марта + 1 мес): откат на конец месяца
  if (d.getUTCDate() < day) d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z")
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export interface Meeting {
  title: string
  cadence: string
  dates: string[]
  attendees: string[]
  duration_min: number
}

/** Встречи онбординга для календаря (все участники — обезличенные id). */
export function buildProbationMeetings(opts: {
  newbie_id: string | null
  start_date: string | null
  buddy_id?: string | null
  hr_id?: string | null
  manager_id?: string | null
  months?: number
}): Meeting[] {
  const start = opts.start_date
  if (!start) return []
  const me = opts.newbie_id ?? "newbie"
  const months = opts.months ?? 3
  const meetings: Meeting[] = []

  // 1:1 с HR — раз в месяц на протяжении ИС
  if (opts.hr_id) {
    meetings.push({
      title: "1:1 с HR",
      cadence: "раз в месяц",
      dates: Array.from({ length: months }, (_, i) => addMonths(start, i + 1)),
      attendees: [me, opts.hr_id],
      duration_min: 30,
    })
  }
  // Еженедельный синк с бадди в первый месяц
  if (opts.buddy_id) {
    meetings.push({
      title: "Синк с бадди",
      cadence: "еженедельно (месяц 1)",
      dates: [7, 14, 21, 28].map((d) => addDays(start, d)),
      attendees: [me, opts.buddy_id],
      duration_min: 30,
    })
  }
  // Промежуточное и финальное ревью ИС
  const reviewers = [me, opts.manager_id, opts.hr_id].filter(Boolean) as string[]
  meetings.push({ title: "Промежуточное ревью ИС", cadence: "разово", dates: [addDays(start, 45)], attendees: reviewers, duration_min: 45 })
  meetings.push({ title: "Ревью по итогам ИС", cadence: "разово", dates: [addMonths(start, months)], attendees: [...reviewers, opts.buddy_id].filter(Boolean) as string[], duration_min: 60 })
  return meetings
}

export interface BuildOpts {
  newbie_id?: string | null
  role: string
  start_date?: string | null
}

const PERIOD_ORDER = ["m1", "m2", "m3"]

export function buildProbationPlan(template: ProbationTemplate, opts: BuildOpts): ProbationPlan {
  const matched = matchRole(opts.role, template)
  const roleTasks = matched ? template.by_role[matched] : []

  const combined: { t: PlanTaskTemplate; scope: "common" | "role" }[] = [
    ...template.common.map((t) => ({ t, scope: "common" as const })),
    ...roleTasks.map((t) => ({ t, scope: "role" as const })),
  ]

  const periodLabel = new Map(template.meta.periods.map((p) => [p.id, p.label]))
  const periodRank = (id: string) => {
    const i = PERIOD_ORDER.indexOf(id)
    return i === -1 ? PERIOD_ORDER.length : i
  }

  combined.sort((a, b) => periodRank(a.t.period) - periodRank(b.t.period) || a.t.week - b.t.week)

  const assignee = opts.newbie_id ?? null
  const tasks: ProbationTask[] = combined.map((c, i) => ({
    ...c.t,
    ref: `ИС-${String(i + 1).padStart(2, "0")}`,
    period_label: periodLabel.get(c.t.period) ?? c.t.period,
    scope: c.scope,
    assignee,
  }))

  const periods = template.meta.periods.map((p) => ({
    id: p.id,
    label: p.label,
    weeks: p.weeks,
    task_count: tasks.filter((t) => t.period === p.id).length,
  }))

  const start = opts.start_date ?? null
  const probationEnd = start ? addMonths(start, template.meta.duration_months) : null
  const who = assignee ?? opts.role

  return {
    newbie_id: assignee,
    role: opts.role,
    matched_role: matched,
    start_date: start,
    probation_end: probationEnd,
    duration_months: template.meta.duration_months,
    epic: {
      summary: `Онбординг · План на ИС · ${who}`,
      description:
        `Испытательный срок ${template.meta.duration_months} мес.` +
        (start ? ` (${start} — ${probationEnd}).` : ".") +
        ` Роль: ${opts.role}${matched ? "" : " (роль не найдена в шаблоне — только общие задачи)"}. ` +
        `Задачи сформированы из шаблона «${template.meta.title}».`,
    },
    periods,
    tasks,
    jira_hint:
      "Создай в Jira epic по epic.summary и по одной задаче на каждый пункт tasks[] " +
      "(summary/description/acceptance), проставь assignee и раскидай по месяцам ИС (m1/m2/m3).",
    available_roles: Object.keys(template.by_role),
  }
}
