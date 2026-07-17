// welcome.ts — приветственное письмо со сводкой «где что находится» (первый этап).
// Все адресаты/участники — обезличенные id; реальные адреса подставит mail-MCP.

export interface WelcomeResource {
  title: string
  where: string
  what: string
}

// Карта ресурсов = вики/Confluence-страницы (те же, что в wiki_mock_mcp/pages) + системы.
export const RESOURCE_MAP: WelcomeResource[] = [
  { title: "О компании", where: "Confluence / wiki", what: "миссия, продукты, структура" },
  { title: "Команда «Платёжные сервисы»", where: "Confluence / wiki", what: "кто есть кто, зоны ответственности" },
  { title: "Политика доступов", where: "Confluence / wiki", what: "какие доступы и как запросить" },
  { title: "Программа бадди", where: "Confluence / wiki", what: "как работает наставничество" },
  { title: "Чек-лист онбординга новичка", where: "Confluence / wiki", what: "шаги адаптации по неделям" },
  { title: "Стандарты разработки", where: "Confluence / wiki", what: "код-стайл, ревью, гит-флоу" },
  { title: "Каталог обучающих курсов", where: "Confluence / wiki + Stepik", what: "курсы под роль" },
  { title: "Задачи (Jira, проект SCRUM)", where: "Jira", what: "спринт, бэклог, твои задачи на ИС" },
  { title: "Дашборд адаптации", where: "onboarding-mcp", what: "прогресс, вехи, ворнинги — «status <твой id>»" },
]

export interface WelcomeLetter {
  to: string[]
  cc: string[]
  subject: string
  body_markdown: string
  resources: WelcomeResource[]
  needs_approval: true
}

export function buildWelcomeLetter(opts: {
  newbie_id: string | null
  role: string
  buddy_id?: string | null
  hr_id?: string | null
  manager_id?: string | null
}): WelcomeLetter {
  const me = opts.newbie_id ?? "новичок"
  const lines: string[] = [
    `Привет, ${me}! Добро пожаловать в команду 🎉`,
    "",
    `Твоя роль — **${opts.role}**. Собрали короткую карту, где что находится, чтобы не искать:`,
    "",
  ]
  for (const r of RESOURCE_MAP) lines.push(`- **${r.title}** (${r.where}) — ${r.what}`)
  lines.push("")
  const people: string[] = []
  if (opts.buddy_id) people.push(`бадди — ${opts.buddy_id}`)
  if (opts.manager_id) people.push(`руководитель — ${opts.manager_id}`)
  if (opts.hr_id) people.push(`HR — ${opts.hr_id}`)
  if (people.length) lines.push(`Твои контакты: ${people.join(", ")} (пиши через корпоративную почту).`, "")
  lines.push(
    "Первые шаги: получи доступы, загляни в чек-лист онбординга и созвонись с бадди.",
    "Прогресс адаптации в любой момент — команда «status <твой id>».",
    "",
    "Хорошего старта!",
  )

  return {
    to: opts.newbie_id ? [opts.newbie_id] : [],
    cc: [opts.buddy_id, opts.manager_id].filter(Boolean) as string[],
    subject: "Добро пожаловать! С чего начать и где что найти",
    body_markdown: lines.join("\n"),
    resources: RESOURCE_MAP,
    needs_approval: true,
  }
}
