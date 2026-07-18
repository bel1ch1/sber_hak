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


def goals_from_template(tpl: dict, start_date: str) -> list[dict]:
    """Normalize SMART goals for the HR Excel form (max 10).

    Prefer ``goals``; fall back to ``tasks`` mapped with empty expected_result
    and equal weights.
    """
    raw = tpl.get("goals") or tpl.get("tasks") or []
    if not raw:
        return []

    if tpl.get("goals"):
        goals = []
        for g in raw:
            goals.append({
                "summary": g["summary"],
                "expected_result": g.get("expected_result") or g.get("description") or "",
                "due_offset_days": int(g.get("due_offset_days", 0)),
                "due": _due(start_date, int(g.get("due_offset_days", 0))),
                "weight": float(g.get("weight", 0)),
            })
        return goals

    # Legacy tasks-only templates: equal weights, summary as result stub.
    n = len(raw)
    # Cap at 10 for Excel form; keep full list elsewhere via build_plan.
    capped = raw[:10]
    n = len(capped)
    w = round(1.0 / n, 4) if n else 0
    goals = []
    for i, t in enumerate(capped):
        weight = w if i < n - 1 else round(1.0 - w * (n - 1), 4)
        goals.append({
            "summary": t["summary"],
            "expected_result": t.get("description") or t["summary"],
            "due_offset_days": int(t.get("due_offset_days", 0)),
            "due": _due(start_date, int(t.get("due_offset_days", 0))),
            "weight": weight,
        })
    return goals


def build_plan(*, role: str, project_key: str, hire_id: str, start_date: str,
               team: str = "", assignee: dict | None = None) -> dict:
    """Return ``{"epic": <fields>, "tasks": [<fields>, ...]}`` ready for Jira.

    Every issue carries the labels ``onboarding:<hire_id>`` and
    ``ouroboros-generated`` so a plan can be de-duplicated or rolled back.
    Due dates are ``start_date + due_offset_days`` from the template.

    Prefer ``goals`` (SMART HR form) for issue summaries; else ``tasks``.
    """
    tpl = load_template(role)
    labels = [f"onboarding:{hire_id}", "ouroboros-generated"]

    epic_fields = {
        "project": {"key": project_key},
        "summary": tpl["epic"].format(role=role, team=team),
        "issuetype": {"name": "Epic"},
        "labels": labels,
    }

    source = tpl.get("goals") or tpl.get("tasks") or []
    tasks = []
    for t in source:
        f = {
            "project": {"key": project_key},
            "summary": t["summary"],
            "issuetype": {"name": t.get("issue_type", "Task")},
            "labels": labels,
            "duedate": _due(start_date, int(t.get("due_offset_days", 0))),
        }
        desc_parts = []
        if t.get("expected_result"):
            desc_parts.append(f"Ожидаемый результат: {t['expected_result']}")
        if t.get("description"):
            desc_parts.append(t["description"])
        if t.get("weight") is not None:
            desc_parts.append(f"Вес цели: {t['weight']}")
        if desc_parts:
            f["description"] = "\n".join(desc_parts)
        if assignee:
            f["assignee"] = assignee
        tasks.append(f)

    return {"epic": epic_fields, "tasks": tasks}
