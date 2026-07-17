// obfuscation.ts — PII boundary for the onboarding domain.
//
// Employees and newbies carry confidential personal data (name, email). Per the
// requirement "у Бадди тоже должен быть айдишник", the agent only ever sees the
// opaque `id` plus non-identifying attributes it needs to reason (department,
// team, position, seniority, skills). Names/emails never cross to the LLM.
//
// Toggle: ONBOARDING_OBFUSCATION (default on — fail-closed toward privacy).

import type { Employee, Newbie } from "./directory.ts"

const PII_FIELDS = ["name", "email"] as const

export function isObfuscationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.ONBOARDING_OBFUSCATION ?? "true").trim().toLowerCase()
  return !(v === "0" || v === "false" || v === "no" || v === "off")
}

export interface PublicEmployee {
  id: string
  department: string
  team: string
  position: string
  role: string
  seniority: string
  skills: string[]
  responsibilities: string[]
  experience_years: number
  languages: string[]
  location: string
  can_be_buddy: boolean
  current_mentees: number
  name?: string
  email?: string
}

export interface PublicNewbie {
  id: string
  role: string
  position: string
  seniority: string
  department: string
  team: string
  skills: string[]
  start_date: string
  assigned_buddy_id: string | null
  assigned_course_roles: string[]
  name?: string
  email?: string
}

export function maskEmployee(e: Employee, enabled: boolean): PublicEmployee {
  const pub: PublicEmployee = {
    id: e.id,
    department: e.department,
    team: e.team,
    position: e.position,
    role: e.role,
    seniority: e.seniority,
    skills: e.skills,
    responsibilities: e.responsibilities,
    experience_years: e.experience_years,
    languages: e.languages,
    location: e.location,
    can_be_buddy: e.can_be_buddy,
    current_mentees: e.current_mentees,
  }
  if (!enabled) {
    pub.name = e.name
    pub.email = e.email
  }
  return pub
}

export function maskNewbie(n: Newbie, enabled: boolean): PublicNewbie {
  const pub: PublicNewbie = {
    id: n.id,
    role: n.role,
    position: n.position,
    seniority: n.seniority,
    department: n.department,
    team: n.team,
    skills: n.skills,
    start_date: n.start_date,
    assigned_buddy_id: n.assigned_buddy_id,
    assigned_course_roles: n.assigned_course_roles,
  }
  if (!enabled) {
    pub.name = n.name
    pub.email = n.email
  }
  return pub
}

/** Guard: true if a plain object still carries any PII field with a value. */
export function hasPii(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false
  const rec = obj as Record<string, unknown>
  return PII_FIELDS.some((f) => typeof rec[f] === "string" && (rec[f] as string).length > 0)
}
