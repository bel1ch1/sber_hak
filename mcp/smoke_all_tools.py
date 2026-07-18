#!/usr/bin/env python3
"""End-to-end tool smoke for all MCP servers (demo IDs).

Run: cd mcp/jira-mcp && uv run --with mcp python ..\\smoke_all_tools.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any

try:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
except ImportError:
    print("need mcp package", file=sys.stderr)
    sys.exit(2)


@dataclass
class Case:
    server: str
    url: str
    tool: str
    args: dict[str, Any]
    note: str = ""


@dataclass
class Row:
    server: str
    tool: str
    status: str
    detail: str = ""
    note: str = ""


def _text(result: Any) -> str:
    parts = []
    for b in getattr(result, "content", []) or []:
        t = getattr(b, "text", None)
        if t:
            parts.append(t)
    if parts:
        return "\n".join(parts)
    sc = getattr(result, "structuredContent", None)
    if sc is not None:
        return json.dumps(sc, ensure_ascii=False)
    return repr(result)


def _ok_payload(text: str, is_error: bool) -> bool:
    if is_error:
        return False
    s = text.strip()
    try:
        data = json.loads(s)
        if isinstance(data, dict):
            if data.get("ok") is False:
                return False
            if data.get("ok") is True:
                return True
            if "error" in data and len(data) <= 3:
                return False
        if isinstance(data, list):
            return True
    except json.JSONDecodeError:
        pass
    low = s.lower()
    if any(x in low for x in ("error", "failed", "unknown", "unauthorized", "invalid")):
        # allow soft warnings in otherwise ok JSON already handled
        if '"ok": true' in low or '"ok":true' in low:
            return True
        return False
    return bool(s)


async def call(url: str, tool: str, args: dict[str, Any], timeout: float = 60.0) -> tuple[str, str]:
    try:
        async with asyncio.timeout(timeout):
            async with streamablehttp_client(url) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    tools = await session.list_tools()
                    names = {t.name for t in tools.tools}
                    if tool not in names:
                        return "MISSING", f"no tool; have={sorted(names)[:12]}"
                    result = await session.call_tool(tool, args)
                    text = _text(result)
                    is_error = bool(getattr(result, "isError", False))
                    if _ok_payload(text, is_error):
                        return "OK", text[:400]
                    return "FAIL", text[:500]
    except TimeoutError:
        return "NO_RESPONSE", f"timeout {timeout}s"
    except Exception as e:
        return "NO_RESPONSE", f"{type(e).__name__}: {e}"


def build_cases() -> list[Case]:
    today = date.today()
    start = datetime.now(timezone(timedelta(hours=3))).replace(microsecond=0) + timedelta(days=1, hours=2)
    end = start + timedelta(hours=1)
    start_iso = start.isoformat()
    end_iso = end.isoformat()
    range_start = (today - timedelta(days=1)).isoformat() + "T00:00:00+03:00"
    range_end = (today + timedelta(days=14)).isoformat() + "T23:59:59+03:00"
    hire = f"smoke-{today.isoformat()}"

    cases: list[Case] = []

    # --- buddy ---
    cases += [
        Case("buddy-mcp", "http://127.0.0.1:3008/mcp", "buddy_verify", {}),
        Case("buddy-mcp", "http://127.0.0.1:3008/mcp", "buddy_match",
             {"role": "backend", "team": "Платежи", "employee_id": "usr_k1m2n3", "limit": 3}),
        Case("buddy-mcp", "http://127.0.0.1:3008/mcp", "buddy_get_profile", {"buddy_id": "usr_buddy"}),
    ]

    # --- mail ---
    cases += [
        Case("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_verify", {}),
        Case("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_list_folders", {}),
        Case("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_list_messages",
             {"folder": "INBOX", "limit": 3}),
        Case("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_send",
             {"to": ["usr_manager"], "subject": f"[smoke] access request {hire}",
              "text": "Demo: заявка на доступы (manager=usr_manager)."},
             "access → usr_manager"),
        Case("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_send",
             {"to": ["usr_buddy"], "subject": f"[smoke] buddy notify {hire}",
              "text": "Demo: оповещение бадди usr_buddy."},
             "buddy notify"),
        Case("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_send",
             {"to": ["usr_employee"], "subject": f"[smoke] welcome {hire}",
              "text": "Demo: приветственное письмо usr_employee."},
             "welcome"),
        Case("yandex-mail-mcp", "http://127.0.0.1:3006/mcp", "yandex_mail_send",
             {"to": ["usr_employee"], "subject": f"[smoke] courses {hire}",
              "text": "Demo: курсы Stepik для usr_employee."},
             "courses mail"),
    ]

    # --- calendar ---
    cases += [
        Case("yandex-calendar-mcp", "http://127.0.0.1:3004/mcp", "yandex_calendar_verify", {}),
        Case("yandex-calendar-mcp", "http://127.0.0.1:3004/mcp", "yandex_calendar_list_events",
             {"range_start": range_start, "range_end": range_end}),
        Case("yandex-calendar-mcp", "http://127.0.0.1:3004/mcp", "yandex_calendar_check_availability",
             {"range_start": range_start, "range_end": range_end}),
        Case("yandex-calendar-mcp", "http://127.0.0.1:3004/mcp", "yandex_calendar_create_event",
             {"title": f"[smoke] team sync {hire}", "start": start_iso, "end": end_iso,
              "attendees": ["usr_employee", "usr_buddy"],
              "description": "Demo meeting with id attendees",
              "client_token": f"smoke-cal-{hire}"},
             "attendees ids"),
    ]

    # --- jira ---
    cases += [
        Case("jira-mcp", "http://127.0.0.1:9101/mcp", "jira_verify", {}),
        Case("jira-mcp", "http://127.0.0.1:9101/mcp", "jira_get_project", {"project_key": "SCRUM"}),
        Case("jira-mcp", "http://127.0.0.1:9101/mcp", "jira_search",
             {"jql": "project = SCRUM ORDER BY created DESC"}),
        Case("jira-mcp", "http://127.0.0.1:9101/mcp", "jira_create_onboarding_plan",
             {"project_key": "SCRUM", "hire_id": hire, "role": "backend",
              "start_date": today.isoformat(), "team": "Платежи",
              "assignee_id": "usr_employee", "dry_run": True},
             "dry_run + assignee_id"),
        Case("jira-mcp", "http://127.0.0.1:9101/mcp", "jira_create_issue",
             {"project_key": "SCRUM", "summary": f"[smoke] single task {hire}",
              "description": "smoke create_issue", "issue_type": "Task",
              "labels": ["ouroboros-smoke", f"onboarding:{hire}"]},
             "single issue"),
    ]

    # --- confluence ---
    cases += [
        Case("confluence-mcp", "http://127.0.0.1:9103/mcp", "confluence_verify", {}),
        Case("confluence-mcp", "http://127.0.0.1:9103/mcp", "confluence_list_spaces", {}),
        Case("confluence-mcp", "http://127.0.0.1:9103/mcp", "confluence_list_pages",
             {"space_key": "SCRUM"}),
        Case("confluence-mcp", "http://127.0.0.1:9103/mcp", "confluence_search",
             {"query": "onboarding", "space_key": "SCRUM"}),
    ]

    # --- wiki-mock ---
    cases += [
        Case("wiki-mock-mcp", "http://127.0.0.1:9102/mcp", "wiki_list_pages", {}),
        Case("wiki-mock-mcp", "http://127.0.0.1:9102/mcp", "wiki_search",
             {"query": "доступы", "limit": 3}),
        Case("wiki-mock-mcp", "http://127.0.0.1:9102/mcp", "wiki_get_page",
             {"slug": "company-overview"}),
    ]

    # --- stepik ---
    cases += [
        Case("stepik-mcp", "http://127.0.0.1:3007/mcp", "stepik_list_roles", {}),
        Case("stepik-mcp", "http://127.0.0.1:3007/mcp", "stepik_match_role",
             {"role": "backend"}),
        Case("stepik-mcp", "http://127.0.0.1:3007/mcp", "stepik_get_courses_by_role",
             {"role": "backend"}),
        Case("stepik-mcp", "http://127.0.0.1:3007/mcp", "stepik_suggest_onboarding",
             {"role": "backend"}),
    ]

    return cases


async def main() -> int:
    cases = build_cases()
    rows: list[Row] = []
    created_cal_uid = None
    inbox_uid = None

    print(f"Running {len(cases)} tool calls...\n")
    for c in cases:
        status, detail = await call(c.url, c.tool, c.args)
        rows.append(Row(c.server, c.tool, status, detail, c.note))
        mark = {"OK": "OK", "FAIL": "!!", "MISSING": "--", "NO_RESPONSE": "??"}.get(status, status)
        print(f"[{mark}] {c.server} :: {c.tool} {c.note}")
        if status != "OK":
            print(f"      {detail[:200]}")

        # chain: get_message if list returned uid
        if c.tool == "yandex_mail_list_messages" and status == "OK":
            try:
                data = json.loads(detail) if detail.strip().startswith("[") or detail.strip().startswith("{") else None
                items = data if isinstance(data, list) else (data.get("items") if isinstance(data, dict) else None)
                # mail returns array of messages directly as JSON text
                if isinstance(data, list) and data:
                    uid = data[0].get("uid")
                    if uid:
                        inbox_uid = uid
            except Exception:
                pass

        if c.tool == "yandex_calendar_create_event" and status == "OK":
            try:
                data = json.loads(detail)
                created_cal_uid = data.get("uid") or data.get("href")
            except Exception:
                pass

    # follow-ups
    if inbox_uid is not None:
        st, det = await call(
            "http://127.0.0.1:3006/mcp",
            "yandex_mail_get_message",
            {"folder": "INBOX", "uid": int(inbox_uid)},
        )
        rows.append(Row("yandex-mail-mcp", "yandex_mail_get_message", st, det, f"uid={inbox_uid}"))
        print(f"[{'OK' if st=='OK' else st}] yandex-mail-mcp :: yandex_mail_get_message")

    # confluence get_page if list_pages returned id
    for r in rows:
        if r.tool == "confluence_list_pages" and r.status == "OK":
            try:
                data = json.loads(r.detail)
                pages = data.get("pages") or []
                if pages:
                    pid = str(pages[0].get("id"))
                    st, det = await call(
                        "http://127.0.0.1:9103/mcp",
                        "confluence_get_page",
                        {"page_id": pid},
                    )
                    rows.append(Row("confluence-mcp", "confluence_get_page", st, det, f"id={pid}"))
                    print(f"[{'OK' if st=='OK' else st}] confluence-mcp :: confluence_get_page")
            except Exception as e:
                rows.append(Row("confluence-mcp", "confluence_get_page", "FAIL", str(e), "parse list"))
            break

    # optional calendar cancel if we have uid/href/etag from create
    for r in rows:
        if r.tool == "yandex_calendar_create_event" and r.status == "OK":
            try:
                data = json.loads(r.detail)
                uid, href, etag = data.get("uid"), data.get("href"), data.get("etag")
                if uid and href and etag:
                    st, det = await call(
                        "http://127.0.0.1:3004/mcp",
                        "yandex_calendar_cancel_event",
                        {"uid": uid, "href": href, "etag": etag},
                    )
                    rows.append(Row("yandex-calendar-mcp", "yandex_calendar_cancel_event", st, det, "cleanup"))
                    print(f"[{'OK' if st=='OK' else st}] yandex-calendar-mcp :: yandex_calendar_cancel_event")
            except Exception as e:
                rows.append(Row("yandex-calendar-mcp", "yandex_calendar_cancel_event", "FAIL", str(e), "parse create"))
            break

    # jira rollback smoke labels (only the single issue labels; full plan was dry_run)
    st, det = await call(
        "http://127.0.0.1:9101/mcp",
        "jira_rollback_plan",
        {"project_key": "SCRUM", "hire_id": f"smoke-{date.today().isoformat()}"},
    )
    rows.append(Row("jira-mcp", "jira_rollback_plan", st, det, "cleanup smoke labels"))
    print(f"[{'OK' if st=='OK' else st}] jira-mcp :: jira_rollback_plan")

    # summary table
    print("\n\n## RESULTS TABLE\n")
    print("| MCP | Tool | Status | Note |")
    print("|-----|------|--------|------|")
    ok = fail = other = 0
    for r in rows:
        note = (r.note or "").replace("|", "/")
        short = (r.detail.replace("\n", " ")[:80] + "…") if r.status != "OK" and r.detail else ""
        extra = f" {short}" if short else ""
        print(f"| {r.server} | `{r.tool}` | **{r.status}** | {note}{extra} |")
        if r.status == "OK":
            ok += 1
        elif r.status == "FAIL":
            fail += 1
        else:
            other += 1

    print(f"\nTotals: OK={ok} FAIL={fail} OTHER={other} / {len(rows)}")
    return 0 if fail == 0 and other == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
