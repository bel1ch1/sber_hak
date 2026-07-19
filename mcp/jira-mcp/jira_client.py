"""Jira backends for the Ouroboros onboarding MCP connector.

Two interchangeable implementations behind one interface:

- ``RealJiraClient`` — Jira Cloud via REST API v2 (Basic auth: email + API
  token). The same v2 path also works against Jira Data Center.
- ``MockJiraClient`` — persists issues to a local JSON file so the whole
  connector can be developed and demoed without a live Jira.

Only the surface the onboarding step needs is implemented: project lookup,
JQL search, single/bulk issue creation, and delete (rollback).
"""
from __future__ import annotations

import json
import pathlib
import re
import threading
from typing import Optional

import httpx


class JiraError(RuntimeError):
    """Any Jira backend failure, surfaced to the agent as a clean message."""


class JiraClient:
    """Interface shared by the real and mock backends."""

    def get_project(self, project_key: str) -> dict: ...
    def search(self, jql: str, fields: Optional[list] = None, max_results: int = 100) -> list: ...
    def create_issue(self, fields: dict) -> dict: ...
    def bulk_create(self, issues: list) -> list: ...
    def delete_issue(self, key: str) -> None: ...
    def assign_issue(self, key: str, account_id: str | None) -> None: ...
    def browse_url(self, key: str) -> str: ...
    def find_account_id(self, email: str) -> str: ...


class RealJiraClient(JiraClient):
    """Jira Cloud / Data Center over REST API v2."""

    def __init__(self, base_url: str, email: str, api_token: str, timeout: float = 30.0):
        if not base_url:
            raise JiraError("JIRA_BASE_URL is required for real mode")
        if not (email and api_token):
            raise JiraError("JIRA_EMAIL and JIRA_API_TOKEN are required for real mode")
        self.base_url = base_url.rstrip("/")
        self._api = f"{self.base_url}/rest/api/2"
        self._client = httpx.Client(
            auth=httpx.BasicAuth(email, api_token),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=timeout,
        )

    def _req(self, method: str, path: str, **kw) -> httpx.Response:
        r = self._client.request(method, f"{self._api}{path}", **kw)
        if r.status_code >= 400:
            raise JiraError(f"{method} {path} -> {r.status_code}: {r.text[:500]}")
        return r

    def get_project(self, project_key):
        d = self._req("GET", f"/project/{project_key}").json()
        return {
            "key": d.get("key"),
            "name": d.get("name"),
            "id": d.get("id"),
            "issue_types": [t.get("name") for t in d.get("issueTypes", [])],
        }

    def search(self, jql, fields=None, max_results=100):
        # Jira Cloud removed the classic /search (HTTP 410) in favour of the
        # enhanced /search/jql endpoint; the same path also works on DC.
        body = {"jql": jql, "maxResults": max_results,
                "fields": fields or ["summary", "labels", "status", "duedate", "assignee"]}
        r = self._req("POST", "/search/jql", json=body)
        out = []
        for it in r.json().get("issues", []):
            f = it.get("fields", {})
            out.append({
                "key": it.get("key"),
                "summary": f.get("summary"),
                "labels": f.get("labels", []),
                "duedate": f.get("duedate"),
                "assignee": f.get("assignee"),  # masked to opaque id in server layer
                "url": self.browse_url(it.get("key")),
            })
        return out

    def create_issue(self, fields):
        key = self._req("POST", "/issue", json={"fields": fields}).json().get("key")
        return {"key": key, "url": self.browse_url(key)}

    def bulk_create(self, issues):
        body = {"issueUpdates": [{"fields": f} for f in issues]}
        r = self._req("POST", "/issue/bulk", json=body)
        return [{"key": it.get("key"), "url": self.browse_url(it.get("key"))}
                for it in r.json().get("issues", [])]

    def delete_issue(self, key):
        self._req("DELETE", f"/issue/{key}", params={"deleteSubtasks": "true"})

    def assign_issue(self, key: str, account_id: str | None) -> None:
        """Assign via dedicated endpoint (better board/notification sync than fields.assignee)."""
        # Jira Cloud: omit or null accountId → Unassigned
        self._req("PUT", f"/issue/{key}/assignee", json={"accountId": account_id})

    def browse_url(self, key):
        return f"{self.base_url}/browse/{key}"

    def find_account_id(self, email: str) -> str:
        """Resolve email → Jira Cloud accountId (user search).

        Exact emailAddress match only. Jira Cloud often hides emails in search
        results; do NOT fall back to the first fuzzy hit (assigns the wrong user).
        Prefer pinning ``jira_account_id`` in accounts.csv when email is private.
        """
        q = (email or "").strip()
        if not q:
            raise JiraError("email is required to resolve assignee")
        r = self._req("GET", "/user/search", params={"query": q, "maxResults": 10})
        users = r.json() if isinstance(r.json(), list) else []
        q_low = q.lower()
        for u in users:
            if (u.get("emailAddress") or "").lower() == q_low and u.get("accountId"):
                return u["accountId"]
        raise JiraError(
            f"No Jira user with exact emailAddress={q!r}. "
            "Pin jira_account_id in accounts.csv (Jira Cloud often hides emails)."
        )


class MockJiraClient(JiraClient):
    """File-backed fake Jira for offline development and demo fallback."""

    def __init__(self, state_path, project_key: str = "PAY", start_number: int = 100):
        self.state_path = pathlib.Path(state_path)
        self._lock = threading.Lock()
        self._default_project = project_key
        self._start = start_number
        self._state = self._load()

    def _load(self):
        if self.state_path.exists():
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        return {"counters": {}, "issues": {}}

    def _save(self):
        self.state_path.write_text(json.dumps(self._state, ensure_ascii=False, indent=2), encoding="utf-8")

    def _next_key(self, project_key):
        c = self._state["counters"].get(project_key, self._start - 1) + 1
        self._state["counters"][project_key] = c
        return f"{project_key}-{c}"

    def get_project(self, project_key):
        return {"key": project_key, "name": f"Mock {project_key}", "id": "10000",
                "issue_types": ["Epic", "Task", "Sub-task"]}

    def search(self, jql, fields=None, max_results=100):
        m = re.search(r'labels\s*=\s*"([^"]+)"', jql)
        label = m.group(1) if m else None
        m = re.search(r'project\s*=\s*"?(\w+)"?', jql)
        project = m.group(1) if m else None
        out = []
        with self._lock:
            for key, it in self._state["issues"].items():
                if label and label not in it.get("labels", []):
                    continue
                if project and it.get("project") != project:
                    continue
                out.append({"key": key, "url": self.browse_url(key), **it})
        return out[:max_results]

    def create_issue(self, fields):
        with self._lock:
            pk = fields.get("project", {}).get("key", self._default_project)
            key = self._next_key(pk)
            parent = fields.get("parent") or {}
            assignee = fields.get("assignee") or {}
            self._state["issues"][key] = {
                "project": pk,
                "summary": fields.get("summary"),
                "issue_type": fields.get("issuetype", {}).get("name"),
                "labels": fields.get("labels", []),
                "duedate": fields.get("duedate"),
                "parent": parent.get("key"),
                "assignee": {
                    "accountId": assignee.get("accountId"),
                    "displayName": assignee.get("displayName") or "",
                    "emailAddress": "",
                } if assignee.get("accountId") else None,
            }
            self._save()
            return {"key": key, "url": self.browse_url(key)}

    def bulk_create(self, issues):
        return [self.create_issue(f) for f in issues]

    def delete_issue(self, key):
        with self._lock:
            self._state["issues"].pop(key, None)
            self._save()

    def assign_issue(self, key: str, account_id: str | None) -> None:
        with self._lock:
            it = self._state["issues"].get(key)
            if not it:
                raise JiraError(f"Unknown issue {key}")
            if account_id:
                it["assignee"] = {
                    "accountId": account_id,
                    "displayName": "",
                    "emailAddress": "",
                }
            else:
                it["assignee"] = None
            self._save()

    def browse_url(self, key):
        return f"mock://jira/browse/{key}"

    def find_account_id(self, email: str) -> str:
        return f"mock-account:{email.strip().lower()}"
