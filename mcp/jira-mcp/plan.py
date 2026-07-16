"""Build an onboarding probation plan (Epic + tasks) from a role template."""
from __future__ import annotations

import datetime as _dt
import pathlib

import yaml

TEMPLATES_DIR = pathlib.Path(__file__).parent / "templates"


def load_template(role: str) -> dict:
    """Load the task template for a role, falling back to ``backend``."""
    path = TEMPLATES_DIR / f"{role}.yaml"
    if not path.exists():
        path = TEMPLATES_DIR / "backend.yaml"
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _due(start_date: str, offset_days: int) -> str:
    return (_dt.date.fromisoformat(start_date) + _dt.timedelta(days=offset_days)).isoformat()


def build_plan(*, role: str, project_key: str, hire_id: str, start_date: str,
               team: str = "", assignee: dict | None = None) -> dict:
    """Return ``{"epic": <fields>, "tasks": [<fields>, ...]}`` ready for Jira.

    Every issue carries the labels ``onboarding:<hire_id>`` and
    ``ouroboros-generated`` so a plan can be de-duplicated or rolled back.
    Due dates are ``start_date + due_offset_days`` from the template.
    """
    tpl = load_template(role)
    labels = [f"onboarding:{hire_id}", "ouroboros-generated"]

    epic_fields = {
        "project": {"key": project_key},
        "summary": tpl["epic"].format(role=role, team=team),
        "issuetype": {"name": "Epic"},
        "labels": labels,
    }

    tasks = []
    for t in tpl["tasks"]:
        f = {
            "project": {"key": project_key},
            "summary": t["summary"],
            "issuetype": {"name": t.get("issue_type", "Task")},
            "labels": labels,
            "duedate": _due(start_date, int(t.get("due_offset_days", 0))),
        }
        if t.get("description"):
            f["description"] = t["description"]
        if assignee:
            f["assignee"] = assignee
        tasks.append(f)

    return {"epic": epic_fields, "tasks": tasks}
