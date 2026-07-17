// server.ts — MCP server: онбординг — подбор бадди + прогресс/ворнинги новичка.
// Launch: `npm run server` (stdio) or `npm run server:http` (HTTP :3005).

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { z } from "zod"

import { runServer } from "./http-transport.ts"
import {
  loadDirectory,
  resolveDataPath,
  summarizeDepartments,
  type Directory,
  type Seniority,
} from "./directory.ts"
import { isObfuscationEnabled, maskEmployee, maskNewbie } from "./obfuscation.ts"
import { matchBuddies, type BuddyQuery } from "./buddy-matching.ts"
import { computeProgress, resolveToday } from "./progress.ts"
import { loadProbationTemplate, buildProbationPlan, buildProbationMeetings } from "./probation.ts"
import { loadJiraBacklog, selectBacklogForNewbie } from "./jira-backlog.ts"
import { loadAccessCatalog, buildAccessRequest } from "./access.ts"
import { buildWelcomeLetter } from "./welcome.ts"

function asText(text: string) {
  return { content: [{ type: "text" as const, text }] }
}
function asJson(value: unknown) {
  return asText(JSON.stringify(value, null, 2))
}

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_DIR = path.basename(HERE) === "dist" ? path.dirname(HERE) : HERE
const isMain = Boolean(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))

async function loadPackageEnv(packageDir: string): Promise<void> {
  try {
    const raw = await readFile(path.join(packageDir, ".env"), "utf8")
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const sep = t.indexOf("=")
      if (sep === -1) continue
      const k = t.slice(0, sep).trim()
      let v = t.slice(sep + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!(k in process.env)) process.env[k] = v
    }
  } catch {
    // .env optional
  }
}

async function getDirectory(): Promise<Directory> {
  const employeesPath = resolveDataPath(PACKAGE_DIR, process.env.ONBOARDING_EMPLOYEES_PATH, "data/employees.json")
  const newbiesPath = resolveDataPath(PACKAGE_DIR, process.env.ONBOARDING_NEWBIES_PATH, "data/newbies.json")
  return loadDirectory(employeesPath, newbiesPath)
}

/** Buddy card (non-PII) for the assigned buddy of a newbie, or null. */
function buddyCard(dir: Directory, buddyId: string | null, enabled: boolean) {
  if (!buddyId) return null
  const emp = dir.employeeById.get(buddyId)
  if (!emp) return { buddy_id: buddyId, unknown: true }
  const p = maskEmployee(emp, enabled)
  return {
    buddy_id: p.id,
    department: p.department,
    team: p.team,
    position: p.position,
    seniority: p.seniority,
    experience_years: p.experience_years,
    skills: p.skills,
    ...(p.name ? { name: p.name, email: p.email } : {}),
  }
}

export function buildServer(): McpServer {
  const server = new McpServer({ name: "onboarding-mcp", version: "0.1.0" })
  const piiNote = isObfuscationEnabled()
    ? " PRIVACY: сотрудники/новички обезличены — вы видите только id (usr_…), без имён и почт."
    : ""

  server.tool(
    "onboarding_list_departments",
    "Org overview: departments -> teams -> headcount and how many can be buddies. READ-ONLY." + piiNote,
    {},
    async () => {
      try {
        const dir = await getDirectory()
        return asJson(summarizeDepartments(dir.employees))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "onboarding_list_newbies",
    "Lists newbies with progress % and warning count. READ-ONLY. Use newbie id with onboarding_progress." +
      piiNote,
    {},
    async () => {
      try {
        const dir = await getDirectory()
        const today = resolveToday()
        const rows = dir.newbies.map((n) => {
          const p = computeProgress(n, today)
          return {
            newbie_id: n.id,
            role: n.role,
            day: p.day,
            percent: p.percent,
            status: p.status,
            warnings: p.warnings.length,
            buddy_assigned: n.assigned_buddy_id != null,
          }
        })
        return asJson(rows)
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "buddy_match",
    "Suggests a top-N of buddy candidates (default 3) for a newbie. READ-ONLY. " +
      "Pass newbie_id to match a known newbie, or role (+ optional department/team/seniority/skills) directly. " +
      "Returns opaque buddy IDs with match scores and reasons (no names)." +
      piiNote,
    {
      newbie_id: z.string().min(1).max(64).optional(),
      role: z.string().min(1).max(200).optional(),
      department: z.string().min(1).max(200).optional(),
      team: z.string().min(1).max(200).optional(),
      seniority: z.enum(["junior", "middle", "senior", "lead"]).optional(),
      skills: z.array(z.string().min(1).max(80)).max(50).optional(),
      limit: z.number().int().min(1).max(10).optional(),
    },
    async (args) => {
      try {
        const dir = await getDirectory()
        let query: BuddyQuery
        if (args.newbie_id) {
          const nb = dir.newbieById.get(args.newbie_id)
          if (!nb) return asText(`UnknownNewbie: ${args.newbie_id}`)
          query = {
            role: nb.role,
            department: nb.department,
            team: nb.team,
            seniority: nb.seniority,
            skills: nb.skills,
            excludeId: nb.id,
          }
        } else if (args.role) {
          query = {
            role: args.role,
            department: args.department,
            team: args.team,
            seniority: args.seniority as Seniority | undefined,
            skills: args.skills,
          }
        } else {
          return asText("Invalid input: pass newbie_id or role.")
        }
        const candidates = matchBuddies(dir.employees, query, args.limit ?? 3)
        return asJson({ query: { ...query }, count: candidates.length, candidates })
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "buddy_get_profile",
    "Returns the non-PII profile of a buddy/employee by id (department, team, position, seniority, skills, responsibilities). READ-ONLY." +
      piiNote,
    { buddy_id: z.string().min(1).max(64) },
    async (args) => {
      try {
        const dir = await getDirectory()
        const emp = dir.employeeById.get(args.buddy_id)
        if (!emp) return asText(`UnknownEmployee: ${args.buddy_id}`)
        return asJson(maskEmployee(emp, isObfuscationEnabled()))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "onboarding_progress",
    "Computes a newbie's onboarding progress % (weighted milestones: checklist + Jira) and warnings " +
      "(buddy not assigned, courses not started, no task in progress, task stalled). READ-ONLY. " +
      "Returns JSON incl. a markdown summary." +
      piiNote,
    { newbie_id: z.string().min(1).max(64) },
    async (args) => {
      try {
        const dir = await getDirectory()
        const nb = dir.newbieById.get(args.newbie_id)
        if (!nb) return asText(`UnknownNewbie: ${args.newbie_id}`)
        return asJson(computeProgress(nb, resolveToday()))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "onboarding_access_request",
    "Step 1: builds a draft access request (заявка на доступ) for a newbie — common + role-specific " +
      "rights from the mock catalog, addressed to the manager for approval. Fills the form " +
      "data/access_request_form.html. Applicant/manager are opaque ids. READ-ONLY (does not send)." +
      piiNote,
    {
      newbie_id: z.string().min(1).max(64).optional(),
      role: z.string().min(1).max(200).optional(),
      organization: z.string().min(1).max(80).optional(),
    },
    async (args) => {
      try {
        const catalog = await loadAccessCatalog(
          resolveDataPath(PACKAGE_DIR, process.env.ONBOARDING_ACCESS_PATH, "data/access_catalog.json"),
        )
        let role = args.role
        let newbie_id = args.newbie_id ?? null
        let manager_id: string | null = null
        if (args.newbie_id) {
          const dir = await getDirectory()
          const nb = dir.newbieById.get(args.newbie_id)
          if (!nb) return asText(`UnknownNewbie: ${args.newbie_id}`)
          role = role ?? nb.role
          manager_id = nb.manager_id
          newbie_id = nb.id
        }
        if (!role) return asText("Invalid input: pass newbie_id or role.")
        return asJson(buildAccessRequest(catalog, { newbie_id, role, organization: args.organization, manager_id }))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "onboarding_welcome_letter",
    "First stage: drafts the welcome letter with a resource map (где что находится — вики/Confluence, " +
      "Jira, курсы, дашборд) and the newbie's contacts (buddy/manager/HR by id). Returns to/cc/subject/body. " +
      "READ-ONLY (does not send — needs approval, then send via mail-MCP by id)." +
      piiNote,
    {
      newbie_id: z.string().min(1).max(64).optional(),
      role: z.string().min(1).max(200).optional(),
    },
    async (args) => {
      try {
        let role = args.role
        let newbie_id = args.newbie_id ?? null
        let buddy_id: string | null = null
        let hr_id: string | null = null
        let manager_id: string | null = null
        if (args.newbie_id) {
          const dir = await getDirectory()
          const nb = dir.newbieById.get(args.newbie_id)
          if (!nb) return asText(`UnknownNewbie: ${args.newbie_id}`)
          role = role ?? nb.role
          buddy_id = nb.assigned_buddy_id
          hr_id = nb.hr_id
          manager_id = nb.manager_id
          newbie_id = nb.id
        }
        if (!role) return asText("Invalid input: pass newbie_id or role.")
        return asJson(buildWelcomeLetter({ newbie_id, role, buddy_id, hr_id, manager_id }))
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "onboarding_probation_plan",
    "Builds the probation-period plan (план на ИС): fixed adaptation milestones (m1/m2/m3) " +
      "PLUS a proposal of real Jira tasks PICKED FROM THE BACKLOG by the newbie's level/role " +
      "(needs approval — user answers да / нет / «все кроме SCRUM-256» → re-call with exclude), " +
      "plus onboarding meetings for the calendar. Jira issues MUST come from this plan, not invented. READ-ONLY." +
      piiNote,
    {
      newbie_id: z.string().min(1).max(64).optional(),
      role: z.string().min(1).max(200).optional(),
      start_date: z.string().min(1).max(20).optional(),
      seniority: z.enum(["junior", "middle", "senior", "lead"]).optional(),
      exclude: z.array(z.string().min(1).max(32)).max(50).optional(),
      limit: z.number().int().min(1).max(10).optional(),
    },
    async (args) => {
      try {
        const template = await loadProbationTemplate(
          resolveDataPath(PACKAGE_DIR, process.env.ONBOARDING_PROBATION_PATH, "data/probation_plan.json"),
        )
        const backlog = await loadJiraBacklog(
          resolveDataPath(PACKAGE_DIR, process.env.ONBOARDING_BACKLOG_PATH, "data/jira_backlog.json"),
        )
        let role = args.role
        let newbie_id = args.newbie_id ?? null
        let start_date = args.start_date ?? null
        let seniority = args.seniority ?? "junior"
        let buddy_id: string | null = null
        let hr_id: string | null = null
        let manager_id: string | null = null
        if (args.newbie_id) {
          const dir = await getDirectory()
          const nb = dir.newbieById.get(args.newbie_id)
          if (!nb) return asText(`UnknownNewbie: ${args.newbie_id}`)
          role = role ?? nb.role
          start_date = start_date ?? nb.start_date
          seniority = args.seniority ?? nb.seniority
          buddy_id = nb.assigned_buddy_id
          hr_id = nb.hr_id
          manager_id = nb.manager_id
          newbie_id = nb.id
        }
        if (!role) return asText("Invalid input: pass newbie_id or role.")

        const plan = buildProbationPlan(template, { newbie_id, role, start_date })
        const picked = selectBacklogForNewbie(backlog, { role, seniority, exclude: args.exclude, limit: args.limit })
        const meetings = buildProbationMeetings({
          newbie_id,
          start_date,
          buddy_id,
          hr_id,
          manager_id,
          months: plan.duration_months,
        })
        return asJson({
          ...plan,
          backlog_proposal: {
            source: `Jira ${backlog.project} — бэклог, под уровень ${seniority}`,
            needs_approval: true,
            count: picked.length,
            tasks: picked,
            hint: 'Берём эти задачи в план на ИС? Ответь «да» / «нет» / «все кроме SCRUM-256» (тогда вызвать снова с exclude).',
          },
          meetings,
        })
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  server.tool(
    "onboarding_dashboard_data",
    "Trigger for «status <id>» / «статус <id>»: full JSON to render the onboarding infographic " +
      "(newbie non-PII, progress %, milestones, warnings, Jira summary, buddy card or top-3 suggestions). " +
      "Includes send_targets (HR + manager ids) — after showing the dashboard, offer to send it to HR, " +
      "the manager, or both (via mail-MCP by id). READ-ONLY." +
      piiNote,
    { newbie_id: z.string().min(1).max(64) },
    async (args) => {
      try {
        const dir = await getDirectory()
        const nb = dir.newbieById.get(args.newbie_id)
        if (!nb) return asText(`UnknownNewbie: ${args.newbie_id}`)
        const enabled = isObfuscationEnabled()
        const progress = computeProgress(nb, resolveToday())
        const assigned = buddyCard(dir, nb.assigned_buddy_id, enabled)
        const suggestions = nb.assigned_buddy_id
          ? []
          : matchBuddies(
              dir.employees,
              { role: nb.role, department: nb.department, team: nb.team, seniority: nb.seniority, skills: nb.skills, excludeId: nb.id },
              3,
            )
        return asJson({
          generated_at: resolveToday(),
          newbie: maskNewbie(nb, enabled),
          progress,
          buddy: { assigned, suggestions },
          send_targets: {
            hr: nb.hr_id,
            manager: nb.manager_id,
            options: ["hr", "manager", "both"],
            hint: "Отправить дашборд: HR, руководителю или обоим? Отправка — через mail-MCP по id.",
          },
        })
      } catch (e) {
        return asText(e instanceof Error ? e.message : String(e))
      }
    },
  )

  return server
}

if (isMain) {
  await loadPackageEnv(PACKAGE_DIR)
  if (process.argv.includes("--http")) process.env.MCP_TRANSPORT = "http"
  await runServer(buildServer, {
    name: "onboarding-mcp",
    createHttpTransport: () => new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }),
    createStdioTransport: () => new StdioServerTransport(),
  })
}
