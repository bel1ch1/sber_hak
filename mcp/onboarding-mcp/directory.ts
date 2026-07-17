// directory.ts — loads the mock staff + newbie datasets that live inside the MCP.
//
// These hold confidential personal data (names, emails). The agent only ever
// works with the opaque `id`; PII is stripped at the boundary (see obfuscation.ts).

import { readFile } from "node:fs/promises"
import path from "node:path"

export type Seniority = "junior" | "middle" | "senior" | "lead"

export const SENIORITY_RANK: Record<Seniority, number> = {
  junior: 1,
  middle: 2,
  senior: 3,
  lead: 4,
}

export interface Employee {
  id: string
  name: string
  email: string
  department: string
  team: string
  position: string
  role: string
  seniority: Seniority
  skills: string[]
  responsibilities: string[]
  experience_years: number
  languages: string[]
  location: string
  can_be_buddy: boolean
  current_mentees: number
}

export type JiraStatus = "To Do" | "In Progress" | "Done"

export interface JiraTask {
  key: string
  summary: string
  status: JiraStatus
  updated: string
  in_progress_since: string | null
}

export interface NewbieChecklist {
  access_granted: boolean
  docs_read: boolean
  intro_meeting_done: boolean
  courses_assigned: boolean
  courses_started: boolean
}

export interface Newbie {
  id: string
  name: string
  email: string
  role: string
  position: string
  seniority: Seniority
  department: string
  team: string
  skills: string[]
  start_date: string
  assigned_buddy_id: string | null
  manager_id: string | null
  hr_id: string | null
  assigned_course_roles: string[]
  checklist: NewbieChecklist
  jira: { assignee: string; tasks: JiraTask[] }
}

export interface Directory {
  employees: Employee[]
  newbies: Newbie[]
  employeeById: Map<string, Employee>
  newbieById: Map<string, Newbie>
}

export function resolveDataPath(packageDir: string, envVar: string | undefined, fallback: string): string {
  const raw = envVar?.trim()
  if (raw) return path.isAbsolute(raw) ? raw : path.resolve(packageDir, raw)
  return path.resolve(packageDir, fallback)
}

async function readJson<T>(p: string): Promise<T> {
  const raw = await readFile(p, "utf8")
  return JSON.parse(raw) as T
}

let cached: { key: string; dir: Directory } | null = null

export async function loadDirectory(employeesPath: string, newbiesPath: string): Promise<Directory> {
  const key = `${employeesPath}::${newbiesPath}`
  if (cached && cached.key === key) return cached.dir

  const [employees, newbies] = await Promise.all([
    readJson<Employee[]>(employeesPath),
    readJson<Newbie[]>(newbiesPath),
  ])

  const dir: Directory = {
    employees,
    newbies,
    employeeById: new Map(employees.map((e) => [e.id, e])),
    newbieById: new Map(newbies.map((n) => [n.id, n])),
  }
  cached = { key, dir }
  return dir
}

export function resetDirectoryCache(): void {
  cached = null
}

export interface DepartmentSummary {
  department: string
  teams: { team: string; headcount: number }[]
  headcount: number
  buddyCount: number
}

/** Non-PII org overview: departments -> teams -> headcount + how many can mentor. */
export function summarizeDepartments(employees: Employee[]): DepartmentSummary[] {
  const byDept = new Map<string, Employee[]>()
  for (const e of employees) {
    const arr = byDept.get(e.department) ?? []
    arr.push(e)
    byDept.set(e.department, arr)
  }
  return [...byDept.entries()]
    .map(([department, emps]) => {
      const teamCounts = new Map<string, number>()
      for (const e of emps) teamCounts.set(e.team, (teamCounts.get(e.team) ?? 0) + 1)
      return {
        department,
        headcount: emps.length,
        buddyCount: emps.filter((e) => e.can_be_buddy).length,
        teams: [...teamCounts.entries()]
          .map(([team, headcount]) => ({ team, headcount }))
          .sort((a, b) => a.team.localeCompare(b.team, "ru")),
      }
    })
    .sort((a, b) => a.department.localeCompare(b.department, "ru"))
}
