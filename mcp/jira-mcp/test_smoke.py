"""Offline smoke test: plan builder + excel goals + mock client + MCP tools."""
import os
import pathlib
import tempfile
import base64

os.environ["JIRA_MODE"] = "mock"

import plan
import excel_plan
import jira_client

# 1) plan builder (SMART goals → Jira tasks)
p = plan.build_plan(role="backend", project_key="PAY", hire_id="anon-7f3a",
                    start_date="2026-07-20", team="Платёжные сервисы")
assert p["epic"]["summary"] == "Онбординг: backend — Платёжные сервисы", p["epic"]["summary"]
assert 5 <= len(p["tasks"]) <= 10, len(p["tasks"])
assert all("onboarding:anon-7f3a" in t["labels"] for t in p["tasks"])
assert p["tasks"][0]["duedate"] == "2026-07-27"  # start_date + 7
print(f"[plan] epic='{p['epic']['summary']}' tasks={len(p['tasks'])} first_due={p['tasks'][0]['duedate']}")

# 1b) Excel goals workbook
xl = excel_plan.build_goals_workbook_payload(
    role="backend", hire_id="anon-7f3a", start_date="2026-07-20",
    team="Платёжные сервисы", manager_id="usr_manager", include_base64=True,
)
assert xl["ok"] and xl["preview"]["weight_ok"], xl
assert xl["filename"].endswith(".xlsx")
raw = base64.b64decode(xl["content_base64"])
assert raw[:2] == b"PK"
assert len(xl["preview"]["goals"]) == 10
print(f"[excel] {xl['filename']} bytes={xl['size_bytes']} goals={len(xl['preview']['goals'])} weight_sum={xl['preview']['weight_sum']}")

# 2) mock client full flow
state = pathlib.Path(tempfile.mkdtemp()) / "state.json"
c = jira_client.MockJiraClient(state)
epic = c.create_issue(p["epic"])
created = c.bulk_create(p["tasks"])
found = c.search('project = PAY AND labels = "onboarding:anon-7f3a"')
assert len(found) == len(created) + 1, (len(found), len(created))
print(f"[mock] created epic={epic['key']} tasks={len(created)} searchable={len(found)}")

# 3) rollback
for it in found:
    c.delete_issue(it["key"])
assert c.search('labels = "onboarding:anon-7f3a"') == []
print("[mock] rollback OK -> 0 issues remain")

# 4) registered MCP tools (dry-run + real create + idempotency + rollback)
import server
dry = server.jira_create_onboarding_plan(
    "PAY", "usr_employee", "backend", "2026-07-20", "Платёжные сервисы", dry_run=True,
)
assert dry["dry_run"] and dry["preview"]["task_count"] >= 5
print(f"[tool] dry_run preview tasks={dry['preview']['task_count']} (nothing written)")

xlsx = server.jira_build_probation_goals_xlsx(
    "usr_employee", "backend", "2026-07-20", "Платёжные сервисы", "usr_manager", True,
)
assert xlsx["ok"] and "content_base64" in xlsx
print(f"[tool] goals xlsx filename={xlsx['filename']}")

real = server.jira_create_onboarding_plan(
    "PAY", "usr_employee", "backend", "2026-07-20", "Платёжные сервисы", dry_run=False,
)
assert real.get("created") and real["epic"]["key"] and len(real["issues"]) >= 5
print(f"[tool] created epic={real['epic']['key']} tasks={len(real['issues'])} outcome_card_written")

again = server.jira_create_onboarding_plan(
    "PAY", "usr_employee", "backend", "2026-07-20", "Платёжные сервисы", dry_run=False,
)
assert again["created"] is False and again["reason"] == "already_exists"
print("[tool] idempotency OK -> already_exists, no duplicate")

rb = server.jira_rollback_plan("PAY", "usr_employee")
assert rb["ok"] and len(rb["deleted"]) >= 6
print(f"[tool] rollback deleted={len(rb['deleted'])}")

print("\nSMOKE OK")
