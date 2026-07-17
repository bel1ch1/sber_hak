// progress.ts — onboarding progress scale + warnings for a newbie. Pure + testable.
//
// Progress = weighted milestones, combining the manual checklist with live Jira
// signal (first task taken / done are derived from task statuses). Warnings flag
// the risks HR/the buddy should act on. Both feed the MCP tool output AND the
// Artifact dashboard infographic.

import type { JiraTask, Newbie } from "./directory.ts"

export interface Milestone {
  key: string
  label: string
  done: boolean
  weight: number
  source: "checklist" | "jira" | "assignment"
}

export type WarningCode =
  | "BUDDY_NOT_ASSIGNED"
  | "COURSES_NOT_STARTED"
  | "NO_TASK_IN_PROGRESS"
  | "TASK_STALLED"

export type Severity = "info" | "warning" | "critical"

export interface Warning {
  code: WarningCode
  severity: Severity
  title: string
  detail: string
  action: string
}

export interface JiraSummary {
  total: number
  todo: number
  in_progress: number
  done: number
  has_active_task: boolean
  stalled: { key: string; summary: string; days: number }[]
}

export interface ProgressReport {
  newbie_id: string
  day: number
  start_date: string
  percent: number
  milestones: Milestone[]
  jira: JiraSummary
  warnings: Warning[]
  status: "on_track" | "attention" | "at_risk"
  markdown: string
}

// Thresholds (days).
const GRACE_NO_TASK = 3 // don't nag before day 3
const GRACE_COURSES = 3
const STALLED_DAYS = 5

function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(fromISO + "T00:00:00Z")
  const to = Date.parse(toISO + "T00:00:00Z")
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.floor((to - from) / 86_400_000)
}

export function resolveToday(env: Record<string, string | undefined> = process.env): string {
  const raw = env.ONBOARDING_TODAY?.trim()
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return new Date().toISOString().slice(0, 10)
}

function summarizeJira(tasks: JiraTask[], today: string): JiraSummary {
  const todo = tasks.filter((t) => t.status === "To Do").length
  const in_progress = tasks.filter((t) => t.status === "In Progress").length
  const done = tasks.filter((t) => t.status === "Done").length
  const stalled = tasks
    .filter((t) => t.status === "In Progress")
    .map((t) => ({
      key: t.key,
      summary: t.summary,
      days: daysBetween(t.in_progress_since ?? t.updated, today),
    }))
    .filter((t) => t.days >= STALLED_DAYS)
  return {
    total: tasks.length,
    todo,
    in_progress,
    done,
    has_active_task: in_progress > 0 || done > 0,
    stalled,
  }
}

function buildMilestones(nb: Newbie, jira: JiraSummary): Milestone[] {
  const c = nb.checklist
  const buddyAssigned = nb.assigned_buddy_id != null
  return [
    { key: "buddy_assigned", label: "Бадди назначен", done: buddyAssigned, weight: 15, source: "assignment" },
    { key: "access_granted", label: "Доступы выданы", done: c.access_granted, weight: 10, source: "checklist" },
    { key: "docs_read", label: "Документация прочитана", done: c.docs_read, weight: 10, source: "checklist" },
    { key: "intro_meeting_done", label: "Вводная встреча проведена", done: c.intro_meeting_done, weight: 10, source: "checklist" },
    { key: "courses_assigned", label: "Курсы назначены", done: c.courses_assigned, weight: 10, source: "checklist" },
    { key: "courses_started", label: "Курсы начаты", done: c.courses_started, weight: 15, source: "checklist" },
    { key: "first_task_taken", label: "Первая задача взята в работу", done: jira.has_active_task, weight: 15, source: "jira" },
    { key: "first_task_done", label: "Первая задача завершена", done: jira.done > 0, weight: 15, source: "jira" },
  ]
}

function buildWarnings(nb: Newbie, jira: JiraSummary, day: number): Warning[] {
  const warnings: Warning[] = []

  if (nb.assigned_buddy_id == null) {
    warnings.push({
      code: "BUDDY_NOT_ASSIGNED",
      severity: "critical",
      title: "Бадди не назначен",
      detail: "Новичку не подобран бадди — некому сопровождать адаптацию.",
      action: "Запустить подбор бадди (buddy_match) и назначить.",
    })
  }

  if (nb.checklist.courses_assigned && !nb.checklist.courses_started && day >= GRACE_COURSES) {
    warnings.push({
      code: "COURSES_NOT_STARTED",
      severity: "warning",
      title: "Курсы не начаты",
      detail: `Назначенные курсы не начаты к дню ${day}.`,
      action: "Напомнить о курсах Stepik; проверить доступ.",
    })
  }

  if (!jira.has_active_task && day >= GRACE_NO_TASK) {
    warnings.push({
      code: "NO_TASK_IN_PROGRESS",
      severity: "warning",
      title: "Не взял ни одной задачи в работу",
      detail: `К дню ${day} нет задач в статусе «В работе» и нет завершённых (${jira.todo} в бэклоге).`,
      action: "Бадди/лиду — помочь взять первую задачу в работу.",
    })
  }

  for (const s of jira.stalled) {
    warnings.push({
      code: "TASK_STALLED",
      severity: "warning",
      title: "Задача зависла",
      detail: `${s.key} «${s.summary}» в работе уже ${s.days} дн. без движения.`,
      action: "Синк с бадди: разблокировать задачу.",
    })
  }

  return warnings
}

function severityRank(s: Severity): number {
  return s === "critical" ? 2 : s === "warning" ? 1 : 0
}

function overallStatus(percent: number, warnings: Warning[]): ProgressReport["status"] {
  if (warnings.some((w) => w.severity === "critical")) return "at_risk"
  if (warnings.length > 0 || percent < 40) return "attention"
  return "on_track"
}

function progressBar(percent: number, width = 12): string {
  const filled = Math.round((percent / 100) * width)
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled))
}

function buildMarkdown(nb: Newbie, day: number, percent: number, milestones: Milestone[], warnings: Warning[]): string {
  const lines = [
    `# Онбординг · ${nb.id} · день ${day}`,
    "",
    `**Роль:** ${nb.role} · ${nb.position}`,
    `**Прогресс:** \`${progressBar(percent)}\` ${percent}%`,
    "",
    "## Чек-лист",
  ]
  for (const m of milestones) lines.push(`- ${m.done ? "✅" : "⬜️"} ${m.label} (${m.weight}%)`)
  lines.push("", "## Ворнинги")
  if (warnings.length === 0) {
    lines.push("- ✅ нет — новичок идёт по плану")
  } else {
    for (const w of warnings) {
      const icon = w.severity === "critical" ? "🔴" : w.severity === "warning" ? "🟠" : "🔵"
      lines.push(`- ${icon} **${w.title}** — ${w.detail} _→ ${w.action}_`)
    }
  }
  return lines.join("\n")
}

export function computeProgress(nb: Newbie, today: string): ProgressReport {
  const day = Math.max(0, daysBetween(nb.start_date, today))
  const jira = summarizeJira(nb.jira.tasks, today)
  const milestones = buildMilestones(nb, jira)

  const totalWeight = milestones.reduce((s, m) => s + m.weight, 0)
  const doneWeight = milestones.filter((m) => m.done).reduce((s, m) => s + m.weight, 0)
  const percent = totalWeight ? Math.round((doneWeight / totalWeight) * 100) : 0

  const warnings = buildWarnings(nb, jira, day).sort((a, b) => severityRank(b.severity) - severityRank(a.severity))

  return {
    newbie_id: nb.id,
    day,
    start_date: nb.start_date,
    percent,
    milestones,
    jira,
    warnings,
    status: overallStatus(percent, warnings),
    markdown: buildMarkdown(nb, day, percent, milestones, warnings),
  }
}
