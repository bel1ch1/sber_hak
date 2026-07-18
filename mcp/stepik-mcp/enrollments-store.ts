// enrollments-store.ts — локальный mock-store фактов зачисления (без Stepik API).

import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type EnrollmentCourse = {
  title: string
  description: string
  url?: string
}

export type EnrollmentRecord = {
  enrollment_id: string
  employee_id: string
  courses: EnrollmentCourse[]
  role?: string
  note?: string
  enrolled_at: string
}

export function resolveEnrollmentsPath(packageDir: string): string {
  const raw = process.env.STEPIK_ENROLLMENTS_PATH?.trim()
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(packageDir, raw)
  }
  return path.resolve(packageDir, "enrollments.json")
}

async function readAll(filePath: string): Promise<EnrollmentRecord[]> {
  try {
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as EnrollmentRecord[]
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "ENOENT") {
      return []
    }
    throw e
  }
}

export async function appendEnrollment(
  filePath: string,
  input: {
    employee_id: string
    courses: EnrollmentCourse[]
    role?: string
    note?: string
  },
): Promise<EnrollmentRecord> {
  const record: EnrollmentRecord = {
    enrollment_id: randomUUID(),
    employee_id: input.employee_id,
    courses: input.courses,
    role: input.role,
    note: input.note,
    enrolled_at: new Date().toISOString(),
  }
  const existing = await readAll(filePath)
  existing.push(record)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(existing, null, 2) + "\n", "utf8")
  return record
}
