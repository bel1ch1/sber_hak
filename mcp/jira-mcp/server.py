"""Ouroboros onboarding MCP connector — Jira.

Exposes the Jira operations the onboarding agent needs to build a new hire's
probation plan. Runs as a streamable-HTTP MCP server. Register it in Ouroboros
Settings -> Advanced -> MCP as:

    {"name": "jira", "url": "http://localhost:9101/mcp", "transport": "streamable_http"}

Config via environment (see config.example.env):
    JIRA_MODE=real|mock         default: mock
    JIRA_BASE_URL=https://<site>.atlassian.net
    JIRA_EMAIL=you@example.com
    JIRA_API_TOKEN=...
    MCP_PORT=9101
"""
from __future__ import annotations

import datetime as _dt
import json
import os
import pathlib
from typing import Optional

from mcp.server.fastmcp import FastMCP

import plan as planlib
import excel_plan as excelplan
from accounts import accounts_path, load_accounts
from jira_client import JiraError, MockJiraClient, RealJiraClient
from privacy import JiraPrivacy

HERE = pathlib.Path(__file__).parent
HOST = os.environ.get("MCP_HOST", "127.0.0.1")
PORT = int(os.environ.get("MCP_PORT", "9101"))
MODE = os.environ.get("JIRA_MODE", "mock").lower()
OUTCOME_LOG = HERE / "outcome_cards.jsonl"
ACCOUNTS = load_accounts(accounts_path(HERE))
PRIVACY = JiraPrivacy(ACCOUNTS)


def _make_client():
    if MODE == "real":
        return RealJiraClient(
            os.environ.get("JIRA_BASE_URL", ""),
            os.environ.get("JIRA_EMAIL", ""),
            os.environ.get("JIRA_API_TOKEN", ""),
        )
    return MockJiraClient(HERE / ".mock_state.json")


client = _make_client()
mcp = FastMCP("jira", host=HOST, port=PORT)


def _out(payload: dict) -> dict:
    """Every tool response is privacy-scrubbed before the agent sees it."""
    return PRIVACY.mask_payload(payload)


def _assignee_fields(assignee_id: str) -> dict | None:
    """Resolve opaque assignee_id → Jira assignee field (accountId). Never returns email to caller."""
    aid = (assignee_id or "").strip()
    if not aid:
        return None
    if "@" in aid:
        raise JiraError("Pass opaque assignee_id from accounts.csv (e.g. usr_employee), not an email")
    acc = ACCOUNTS.get(aid)
    if not acc:
        raise JiraError(f"UnknownAssigneeId: {aid!r} not in accounts.csv")
    # Prefer pinned Jira accountId — Cloud search often hides emails and fuzzy-matches wrong users.
    if acc.jira_account_id:
        return {"accountId": acc.jira_account_id}
    if not acc.email or "@" not in acc.email:
        raise JiraError(
            f"Assignee {aid!r} has no jira_account_id and no email in accounts.csv"
        )
    account_id = client.find_account_id(acc.email)
    return {"accountId": account_id}


def _write_outcome(card: dict) -> None:
    """Append an outcome card (maps to Ouroboros outcomes.py semantics)."""
    card["ts"] = _dt.datetime.now(_dt.timezone.utc).isoformat()
    with OUTCOME_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(card, ensure_ascii=False) + "\n")


@mcp.tool()
def jira_verify(project_key: str = "") -> dict:
    """Проверка доступа к Jira: читает метаданные проекта (REST get project).

    Read-only. Если project_key пуст — берётся JIRA_PROJECT_KEY из окружения.
    В mock-режиме ходит в локальный MockJiraClient; в real — в Jira Cloud/DC."""
    key = (project_key or os.environ.get("JIRA_PROJECT_KEY", "")).strip()
    if not key:
        return _out({"ok": False, "error": "project_key or env JIRA_PROJECT_KEY is required"})
    try:
        return _out({"ok": True, "mode": MODE, "project": client.get_project(key)})
    except JiraError as e:
        return _out({"ok": False, "error": str(e)})


@mcp.tool()
def jira_get_project(project_key: str) -> dict:
    """Return Jira project metadata (name, id, available issue types).

    Use this to validate a project key before creating issues. Read-only."""
    try:
        return _out({"ok": True, "mode": MODE, "project": client.get_project(project_key)})
    except JiraError as e:
        return _out({"ok": False, "error": str(e)})


@mcp.tool()
def jira_search(jql: str) -> dict:
    """Run a JQL query; return matching issues (key, summary, labels, due, assignee_id).

    PRIVACY: assignee is an opaque id from accounts.csv (e.g. usr_employee), never
    email/displayName/accountId. Read-only.
    Example jql: project = PAY AND labels = \"onboarding:anon-7f3a\"."""
    try:
        return _out({"ok": True, "mode": MODE, "issues": client.search(jql)})
    except JiraError as e:
        return _out({"ok": False, "error": str(e)})


@mcp.tool()
def jira_create_issue(project_key: str, summary: str, description: str = "",
                      issue_type: str = "Task", due_date: str = "",
                      labels: Optional[list] = None,
                      assignee_id: str = "") -> dict:
    """Create a single Jira issue. Write operation.

    due_date is YYYY-MM-DD. Optional assignee_id is an opaque id from accounts.csv.
    For onboarding probation plans prefer jira_create_onboarding_plan (not this tool).
    Returns the created key and browse URL."""
    fields = {"project": {"key": project_key}, "summary": summary,
              "issuetype": {"name": issue_type}, "labels": labels or []}
    if description:
        fields["description"] = description
    if due_date:
        fields["duedate"] = due_date
    try:
        if (assignee_id or "").strip():
            fields["assignee"] = _assignee_fields(assignee_id)
        return _out({"ok": True, "mode": MODE, "created": client.create_issue(fields),
                     "assignee": {"assignee_id": (assignee_id or "").strip() or None}})
    except JiraError as e:
        return _out({"ok": False, "error": str(e)})


@mcp.tool()
def jira_build_probation_goals_xlsx(
    hire_id: str,
    role: str = "backend",
    start_date: str = "",
    team: str = "",
    manager_id: str = "",
    include_base64: bool = True,
) -> dict:
    """Fill the corporate HR form «Цели на испытательный срок» (Excel) from the
    role goals template (based on «Задачи на ИС (обновление).xlsx»).

    Returns structured ``preview`` (goals, weights, due dates, checkpoints) for
    showing a table/text draft in chat, plus ``filename`` / ``content_base64``
    for saving the workbook and attaching it to mail via yandex_mail_send.

    PRIVACY: hire_id and manager_id are opaque ids written into the sheet —
    never put real FIO/email. Max 10 SMART goals; weights should sum to ~1.0.
    start_date is YYYY-MM-DD (defaults to today)."""
    start_date = start_date or _dt.date.today().isoformat()
    try:
        return _out(excelplan.build_goals_workbook_payload(
            role=role,
            hire_id=hire_id,
            start_date=start_date,
            team=team,
            manager_id=manager_id,
            include_base64=include_base64,
        ))
    except Exception as e:
        return _out({"ok": False, "error": str(e)})


@mcp.tool()
def jira_create_onboarding_plan(project_key: str, hire_id: str, role: str = "backend",
                                start_date: str = "", team: str = "",
                                assignee_id: str = "",
                                dry_run: bool = True) -> dict:
    """Build a new hire's probation plan in Jira: one Epic + SMART goals as
    tasks with due dates from the role template (same goals as the Excel form).

    Human-in-the-loop: with dry_run=True (default) it returns a PREVIEW and
    writes nothing; call again with dry_run=False to actually create the issues.
    Idempotent: tasks are labelled onboarding:<hire_id>; if a plan already
    exists it is returned instead of duplicated. start_date is YYYY-MM-DD
    (defaults to today).

    For the HR Excel workbook use jira_build_probation_goals_xlsx separately.

    PRIVACY: assignee_id is an opaque id from accounts.csv (e.g. usr_employee /
    usr_jira_assignee). MCP resolves it to a Jira accountId server-side; never
    pass an email. If empty, defaults to hire_id when present in accounts.csv."""
    start_date = start_date or _dt.date.today().isoformat()
    resolve_id = (assignee_id or hire_id or "").strip()
    assignee = None
    assignee_note = None
    if resolve_id:
        try:
            assignee = _assignee_fields(resolve_id)
            assignee_note = {"assignee_id": resolve_id}
        except JiraError as e:
            if not dry_run:
                return _out({"ok": False, "error": str(e)})
            assignee_note = {"assignee_id": resolve_id, "warning": str(e)}

    built = planlib.build_plan(role=role, project_key=project_key, hire_id=hire_id,
                               start_date=start_date, team=team, assignee=assignee)
    preview = {
        "epic": built["epic"]["summary"],
        "task_count": len(built["tasks"]),
        "tasks": [{"summary": t["summary"], "due": t.get("duedate")} for t in built["tasks"]],
        "assignee": assignee_note,
    }
    if dry_run:
        return _out({
            "ok": True, "mode": MODE, "dry_run": True, "preview": preview,
            "note": "Ничего не создано. Вызови повторно с dry_run=false для записи. "
                    "Excel-форму целей собери через jira_build_probation_goals_xlsx.",
        })

    # Idempotency: never duplicate an existing plan.
    try:
        existing = client.search(f'project = {project_key} AND labels = "onboarding:{hire_id}"')
    except JiraError:
        existing = []
    if existing:
        return _out({
            "ok": True, "mode": MODE, "created": False, "reason": "already_exists",
            "existing": existing,
            "assignee": assignee_note,
            "hire_id": hire_id,
            "note": "Plan already exists for this hire_id. Do not re-create. "
                    "Search assignee_id may be any alias of the same Jira user "
                    "(demo shared assignee); verify by label onboarding:<hire_id>.",
        })

    try:
        epic = client.create_issue(built["epic"])
    except JiraError as e:
        return _out({"ok": False, "error": f"epic create failed: {e}"})

    tasks = built["tasks"]
    for t in tasks:
        t["parent"] = {"key": epic["key"]}  # next-gen / team-managed Epic parent
    parent_linked = True
    try:
        created = client.bulk_create(tasks)
    except JiraError:
        # Bulk+parent can fail on some sites — create one-by-one, then unlinked fallback.
        created = []
        try:
            for t in tasks:
                created.append(client.create_issue(t))
        except JiraError:
            parent_linked = False
            created = []
            for t in tasks:
                t.pop("parent", None)
            try:
                created = client.bulk_create(tasks)
            except JiraError as e2:
                return _out({"ok": False, "error": f"tasks create failed: {e2}", "epic": epic})

    # Dedicated assignee endpoint — next-gen boards sometimes lag after fields.assignee
    # in create payload; this also fires assign notifications reliably.
    account_id = (assignee or {}).get("accountId") if assignee else None
    if account_id:
        assign_errors = []
        for it in [epic, *created]:
            key = it.get("key")
            if not key:
                continue
            try:
                client.assign_issue(key, account_id)
            except JiraError as e:
                assign_errors.append({"key": key, "error": str(e)})
        if assign_errors and len(assign_errors) == (1 + len(created)):
            return _out({
                "ok": False, "error": "issues created but assign failed",
                "epic": epic, "issues": created, "assign_errors": assign_errors,
            })
    else:
        assign_errors = []

    card = {"step": "jira_plan", "hire_id": hire_id, "role": role, "project": project_key,
            "epic": epic["key"], "tasks": len(created), "assignee_id": resolve_id or None,
            "parent_linked": parent_linked, "objective_eval": "pass"}
    _write_outcome(card)
    return _out({"ok": True, "mode": MODE, "created": True, "epic": epic,
                 "issues": created, "assignee": assignee_note,
                 "parent_linked": parent_linked,
                 "assign_errors": assign_errors or None,
                 "outcome_card": card})


@mcp.tool()
def jira_rollback_plan(project_key: str, hire_id: str) -> dict:
    """Delete every issue created for an onboarding (label onboarding:<hire_id>).

    Use to clean up after a demo run. Write operation."""
    try:
        issues = client.search(f'project = {project_key} AND labels = "onboarding:{hire_id}"')
        for it in issues:
            client.delete_issue(it["key"])
        return _out({"ok": True, "mode": MODE, "deleted": [it["key"] for it in issues]})
    except JiraError as e:
        return _out({"ok": False, "error": str(e)})


if __name__ == "__main__":
    print(f"[jira-mcp] mode={MODE} host={HOST} port={PORT} -> http://{HOST}:{PORT}/mcp")
    mcp.run(transport="streamable-http")
