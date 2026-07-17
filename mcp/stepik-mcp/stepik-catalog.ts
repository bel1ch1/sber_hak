// stepik-catalog.ts — загрузка каталога курсов из Excel для онбординга.

import { readFile } from "node:fs/promises"
import path from "node:path"
import * as XLSX from "xlsx"

const SOFT_SKILLS_ROLE = "Soft Skills (все роли)"
const COURSE_URL_RE = /stepik\.org\/course\/(\d+)/i

export type StepikCourse = {
  role: string
  title: string
  description: string
  url: string
  courseId: number
  duration: string
  level: string
}

export type RoleSummary = {
  role: string
  courseCount: number
}

export type OnboardingSuggestion = {
  role: string
  matchedRole: string
  includeSoftSkills: boolean
  courses: StepikCourse[]
  courseCount: number
  markdown: string
}

let cachedCatalog: StepikCourse[] | null = null
let cachedCatalogPath: string | null = null

export function resolveCatalogPath(packageDir: string): string {
  const raw = process.env.STEPIK_CATALOG_PATH?.trim()
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(packageDir, raw)
  }
  return path.resolve(packageDir, "..", "stepik_courses_by_role.xlsx")
}

function cell(value: unknown): string {
  if (value == null) return ""
  return String(value).trim()
}

function parseCourseId(url: string): number {
  const m = COURSE_URL_RE.exec(url)
  if (!m) throw new Error(`Не удалось извлечь ID курса из ссылки: ${url}`)
  return Number(m[1])
}

function normalizeRole(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

const ROLE_ALIASES: Record<string, string> = {
  hr: "HR",
  it: "IT / Разработка",
  "it / разработка": "IT / Разработка",
  разработка: "IT / Разработка",
  dev: "IT / Разработка",
  qa: "QA / Тестирование",
  "qa / тестирование": "QA / Тестирование",
  тестирование: "QA / Тестирование",
  pm: "Менеджмент / PM",
  "менеджмент / pm": "Менеджмент / PM",
  менеджмент: "Менеджмент / PM",
  "продажи и маркетинг": "Продажи и маркетинг",
  маркетинг: "Продажи и маркетинг",
  продажи: "Продажи и маркетинг",
  "финансы и бухгалтерия": "Финансы и бухгалтерия",
  финансы: "Финансы и бухгалтерия",
  бухгалтерия: "Финансы и бухгалтерия",
  "аналитика данных": "Аналитика данных",
  аналитика: "Аналитика данных",
  "дизайн и ux": "Дизайн и UX",
  дизайн: "Дизайн и UX",
  ux: "Дизайн и UX",
  юристы: "Юристы",
  юрист: "Юристы",
  "soft skills": SOFT_SKILLS_ROLE,
  "soft skills (все роли)": SOFT_SKILLS_ROLE,
}

export function matchRole(input: string, availableRoles: string[]): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const alias = ROLE_ALIASES[normalizeRole(trimmed)]
  if (alias && availableRoles.includes(alias)) return alias

  const exact = availableRoles.find((r) => normalizeRole(r) === normalizeRole(trimmed))
  if (exact) return exact

  const contains = availableRoles.filter((r) => {
    const n = normalizeRole(r)
    const q = normalizeRole(trimmed)
    return n.includes(q) || q.includes(n)
  })
  if (contains.length === 1) return contains[0]
  if (contains.length > 1) {
    const best = contains.find((r) => normalizeRole(r).startsWith(normalizeRole(trimmed)))
    return best ?? contains[0]
  }

  return null
}

export async function loadCatalog(catalogPath: string): Promise<StepikCourse[]> {
  if (cachedCatalog && cachedCatalogPath === catalogPath) return cachedCatalog

  const buf = await readFile(catalogPath)
  const wb = XLSX.read(buf, { type: "buffer" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error("Excel-файл не содержит листов")

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
  })

  const courses: StepikCourse[] = []
  for (const row of rows) {
    const role = cell(row["Роль"])
    const title = cell(row["Название курса"])
    const url = cell(row["Ссылка"])
    if (!role || !title || !url) continue

    courses.push({
      role,
      title,
      description: cell(row["Описание"]),
      url,
      courseId: parseCourseId(url),
      duration: cell(row["Длительность"]),
      level: cell(row["Уровень"]),
    })
  }

  if (courses.length === 0) {
    throw new Error(`Каталог пуст или имеет неожиданный формат: ${catalogPath}`)
  }

  cachedCatalog = courses
  cachedCatalogPath = catalogPath
  return courses
}

export function listRoles(courses: StepikCourse[]): RoleSummary[] {
  const counts = new Map<string, number>()
  for (const c of courses) {
    counts.set(c.role, (counts.get(c.role) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([role, courseCount]) => ({ role, courseCount }))
    .sort((a, b) => a.role.localeCompare(b.role, "ru"))
}

export function getCoursesByRole(courses: StepikCourse[], role: string): StepikCourse[] {
  return courses.filter((c) => c.role === role)
}

export function buildOnboardingSuggestion(
  courses: StepikCourse[],
  roleInput: string,
  includeSoftSkills: boolean,
): OnboardingSuggestion {
  const availableRoles = [...new Set(courses.map((c) => c.role))]
  const matchedRole = matchRole(roleInput, availableRoles)
  if (!matchedRole) {
    throw new Error(
      `Роль не найдена: "${roleInput}". Доступные роли: ${availableRoles.join(", ")}`,
    )
  }

  const roleCourses = getCoursesByRole(courses, matchedRole)
  const softCourses =
    includeSoftSkills && matchedRole !== SOFT_SKILLS_ROLE
      ? getCoursesByRole(courses, SOFT_SKILLS_ROLE)
      : []

  const seen = new Set<number>()
  const combined: StepikCourse[] = []
  for (const c of [...roleCourses, ...softCourses]) {
    if (seen.has(c.courseId)) continue
    seen.add(c.courseId)
    combined.push(c)
  }

  const markdown = formatSuggestionMarkdown(matchedRole, combined, includeSoftSkills)

  return {
    role: roleInput,
    matchedRole,
    includeSoftSkills,
    courses: combined,
    courseCount: combined.length,
    markdown,
  }
}

export function formatSuggestionMarkdown(role: string, courses: StepikCourse[], includeSoftSkills: boolean): string {
  const lines = [
    `# Рекомендованные курсы Stepik — ${role}`,
    "",
    `Курсов: ${courses.length}${includeSoftSkills ? " (включая Soft Skills)" : ""}`,
    "",
  ]

  for (const [i, c] of courses.entries()) {
    lines.push(`${i + 1}. **${c.title}**`)
    lines.push(`   - Роль: ${c.role}`)
    lines.push(`   - Ссылка: ${c.url}`)
    if (c.duration) lines.push(`   - Длительность: ${c.duration}`)
    if (c.level) lines.push(`   - Уровень: ${c.level}`)
    if (c.description) lines.push(`   - ${c.description}`)
    lines.push("")
  }

  lines.push("Запишитесь на каждый курс по ссылке (кнопка «Записаться на курс» на Stepik).")
  return lines.join("\n")
}

export function resetCatalogCache(): void {
  cachedCatalog = null
  cachedCatalogPath = null
}
