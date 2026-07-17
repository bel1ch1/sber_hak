// buddy-matching.ts — ranks buddy candidates for a newbie. Pure + testable.
//
// A buddy should be a more experienced colleague, ideally from the same team /
// department / domain, with overlapping skills, and not overloaded with mentees.
// The neural net asks for a top-N (default 3) and gets opaque buddy IDs + the
// reasons behind each match (no PII).

import { SENIORITY_RANK, type Employee, type Seniority } from "./directory.ts"

export interface BuddyQuery {
  role: string
  department?: string
  team?: string
  seniority?: Seniority
  skills?: string[]
  excludeId?: string
}

export interface BuddyReason {
  code: "same_team" | "same_department" | "same_role" | "shared_skills" | "seniority" | "availability"
  detail: string
  points: number
}

export interface BuddyCandidate {
  buddy_id: string
  department: string
  team: string
  position: string
  role: string
  seniority: string
  experience_years: number
  shared_skills: string[]
  current_mentees: number
  score: number
  reasons: BuddyReason[]
}

const WEIGHTS = {
  sameTeam: 40,
  sameDepartment: 25,
  sameRole: 15,
  perSharedSkill: 6,
  sharedSkillCap: 24,
  seniorityIdeal: 15, // buddy 1–2 levels above newbie
  seniorityFar: 5, // buddy senior but gap large (e.g. lead over junior)
  perMenteePenalty: 5,
  languageOverlap: 5,
}

function normSkill(s: string): string {
  return s.trim().toLowerCase()
}

function sharedSkills(a: string[], b: string[]): string[] {
  const setB = new Set(b.map(normSkill))
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of a) {
    const n = normSkill(s)
    if (setB.has(n) && !seen.has(n)) {
      seen.add(n)
      out.push(s)
    }
  }
  return out
}

function scoreCandidate(emp: Employee, q: BuddyQuery): BuddyCandidate | null {
  const newbieRank = q.seniority ? SENIORITY_RANK[q.seniority] : SENIORITY_RANK.junior
  const buddyRank = SENIORITY_RANK[emp.seniority]
  // A buddy must be at least as senior as the newbie (strictly above for juniors).
  if (buddyRank < newbieRank) return null
  if (newbieRank === SENIORITY_RANK.junior && buddyRank === SENIORITY_RANK.junior) return null

  const reasons: BuddyReason[] = []
  let score = 0

  if (q.team && emp.team === q.team) {
    score += WEIGHTS.sameTeam
    reasons.push({ code: "same_team", detail: `та же команда: ${emp.team}`, points: WEIGHTS.sameTeam })
  } else if (q.department && emp.department === q.department) {
    score += WEIGHTS.sameDepartment
    reasons.push({ code: "same_department", detail: `то же подразделение: ${emp.department}`, points: WEIGHTS.sameDepartment })
  }

  if (emp.role === q.role) {
    score += WEIGHTS.sameRole
    reasons.push({ code: "same_role", detail: `та же роль: ${emp.role}`, points: WEIGHTS.sameRole })
  }

  const shared = q.skills?.length ? sharedSkills(emp.skills, q.skills) : []
  if (shared.length) {
    const pts = Math.min(shared.length * WEIGHTS.perSharedSkill, WEIGHTS.sharedSkillCap)
    score += pts
    reasons.push({ code: "shared_skills", detail: `общие навыки: ${shared.join(", ")}`, points: pts })
  }

  const gap = buddyRank - newbieRank
  const seniorityPts = gap >= 1 && gap <= 2 ? WEIGHTS.seniorityIdeal : WEIGHTS.seniorityFar
  score += seniorityPts
  reasons.push({
    code: "seniority",
    detail: `${emp.seniority} (опыт ${emp.experience_years} лет)`,
    points: seniorityPts,
  })

  const penalty = emp.current_mentees * WEIGHTS.perMenteePenalty
  if (penalty) {
    score -= penalty
    reasons.push({
      code: "availability",
      detail: `уже ${emp.current_mentees} подопечн.`,
      points: -penalty,
    })
  }

  return {
    buddy_id: emp.id,
    department: emp.department,
    team: emp.team,
    position: emp.position,
    role: emp.role,
    seniority: emp.seniority,
    experience_years: emp.experience_years,
    shared_skills: shared,
    current_mentees: emp.current_mentees,
    score,
    reasons,
  }
}

export function matchBuddies(employees: Employee[], q: BuddyQuery, limit = 3): BuddyCandidate[] {
  const candidates: BuddyCandidate[] = []
  for (const emp of employees) {
    if (!emp.can_be_buddy) continue
    if (q.excludeId && emp.id === q.excludeId) continue
    const scored = scoreCandidate(emp, q)
    if (scored) candidates.push(scored)
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.current_mentees - b.current_mentees ||
      b.experience_years - a.experience_years ||
      a.buddy_id.localeCompare(b.buddy_id),
  )
  return candidates.slice(0, Math.max(1, limit))
}
