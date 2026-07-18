"""Offline smoke test: plan builder + mock client + registered MCP tools."""
import os
import pathlib
import tempfile

os.environ["JIRA_MODE"] = "mock"

import plan
import jira_client

# 1) plan builder
p = plan.build_plan(role="backend", project_key="PAY", hire_id="anon-7f3a",
                    start_date="2026-07-20", team="Платёжные сервисы")
assert p["epic"]["summary"] == "Онбординг: backend — Платёжные сервисы", p["epic"]["summary"]
assert len(p["tasks"]) >= 15, len(p["tasks"])
assert all("onboarding:anon-7f3a" in t["labels"] for t in p["tasks"])
assert p["tasks"][0]["duedate"] == "2026-07-21"  # start_date + 1
print(f"[plan] epic='{p['epic']['summary']}' tasks={len(p['tasks'])} first_due={p['tasks'][0]['duedate']}")

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
dry = server.jira_create_onboarding_plan("PAY", "anon-demo", "backend", "2026-07-20", "Платёжные сервисы", True)
assert dry["dry_run"] and dry["preview"]["task_count"] >= 15
print(f"[tool] dry_run preview tasks={dry['preview']['task_count']} (nothing written)")

real = server.jira_create_onboarding_plan("PAY", "anon-demo", "backend", "2026-07-20", "Платёжные сервисы", False)
assert real["created"] and real["epic"]["key"] and len(real["issues"]) >= 15
print(f"[tool] created epic={real['epic']['key']} tasks={len(real['issues'])} outcome_card_written")

again = server.jira_create_onboarding_plan("PAY", "anon-demo", "backend", "2026-07-20", "Платёжные сервисы", False)
assert again["created"] is False and again["reason"] == "already_exists"
print("[tool] idempotency OK -> already_exists, no duplicate")

rb = server.jira_rollback_plan("PAY", "anon-demo")
assert rb["ok"] and len(rb["deleted"]) >= 16
print(f"[tool] rollback deleted={len(rb['deleted'])}")

print("\nSMOKE OK")
