// access.ts — шаг 1: подбор доступов и черновик «Заявки на доступ».
// Форма: data/access_request_form.html. Заявитель/руководитель — обезличенные id.

import { readFile } from "node:fs/promises"

export interface AccessRight {
  code: string
  name: string
  rule: string
}

export interface AccessCatalog {
  form: string
  organizations: string[]
  default_organization: string
  common: AccessRight[]
  by_role: Record<string, AccessRight[]>
}

let cache: { path: string; data: AccessCatalog } | null = null

export async function loadAccessCatalog(p: string): Promise<AccessCatalog> {
  if (cache && cache.path === p) return cache.data
  const data = JSON.parse(await readFile(p, "utf8")) as AccessCatalog
  cache = { path: p, data }
  return data
}

export function resetAccessCache(): void {
  cache = null
}

export interface AccessRequestDraft {
  form: string
  applicant_id: string | null
  organization: string
  manager_id: string | null
  role: string
  rights: AccessRight[]
  comment: string
  needs_approval: true
  note: string
}

/** Черновик заявки: общие права + права под роль, на согласование руководителю. */
export function buildAccessRequest(
  catalog: AccessCatalog,
  opts: { newbie_id: string | null; role: string; organization?: string; manager_id?: string | null },
): AccessRequestDraft {
  const roleRights = catalog.by_role[opts.role] ?? []
  const seen = new Set<string>()
  const rights: AccessRight[] = []
  for (const r of [...catalog.common, ...roleRights]) {
    if (seen.has(r.code)) continue
    seen.add(r.code)
    rights.push(r)
  }
  return {
    form: catalog.form,
    applicant_id: opts.newbie_id,
    organization: opts.organization ?? catalog.default_organization,
    manager_id: opts.manager_id ?? null,
    role: opts.role,
    rights,
    comment: `Онбординг нового сотрудника ${opts.newbie_id ?? ""} (${opts.role}). Прошу согласовать доступы.`,
    needs_approval: true,
    note: "Отправить руководителю на согласование (шаг 2 формы), затем — в техподдержку (шаг 3).",
  }
}
