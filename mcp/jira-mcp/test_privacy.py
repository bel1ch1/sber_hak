"""Unit tests for Jira PII masking (no live Jira)."""
from accounts import load_accounts
from privacy import JiraPrivacy
import pathlib
import tempfile


CSV = """id,email,label,jira_account_id,display_name
usr_employee,andreyzv5555@gmail.com,demo,712020:506ee904-6d92-41c0-9232-a3e14f055bd8,Bell
usr_k1m2n3,andreyzv5555@gmail.com,hire,712020:506ee904-6d92-41c0-9232-a3e14f055bd8,Bell
"""


def _priv() -> JiraPrivacy:
    with tempfile.TemporaryDirectory() as td:
        p = pathlib.Path(td) / "accounts.csv"
        p.write_text(CSV, encoding="utf-8")
        return JiraPrivacy(load_accounts(p))


def test_mask_assignee_object():
    priv = _priv()
    oid = priv.mask_assignee({
        "accountId": "712020:506ee904-6d92-41c0-9232-a3e14f055bd8",
        "displayName": "Bell",
        "emailAddress": "andreyzv5555@gmail.com",
    })
    assert oid == "usr_employee"


def test_mask_issue_and_text():
    priv = _priv()
    issue = priv.mask_issue({
        "key": "SCRUM-1",
        "summary": "Task for Bell and andreyzv5555@gmail.com",
        "assignee": {
            "accountId": "712020:506ee904-6d92-41c0-9232-a3e14f055bd8",
            "displayName": "Bell",
        },
    })
    assert issue["assignee_id"] == "usr_employee"
    assert "assignee" not in issue
    assert "Bell" not in issue["summary"]
    assert "andreyzv5555@gmail.com" not in issue["summary"]
    assert "usr_employee" in issue["summary"]


def test_mask_payload_drops_raw_fields():
    priv = _priv()
    out = priv.mask_payload({
        "ok": True,
        "issues": [{
            "key": "SCRUM-1",
            "assignee": {"accountId": "712020:506ee904-6d92-41c0-9232-a3e14f055bd8", "displayName": "Bell"},
            "summary": "ok",
        }],
        "assignee": {"assignee_id": "usr_k1m2n3"},
    })
    assert out["issues"][0]["assignee_id"] == "usr_employee"
    assert out["assignee"] == {"assignee_id": "usr_k1m2n3"}


def test_mask_issue_prefers_onboarding_hire_id():
    priv = _priv()
    issue = priv.mask_issue({
        "key": "SCRUM-2",
        "summary": "goal",
        "labels": ["onboarding:usr_k1m2n3", "ouroboros-generated"],
        "assignee": {
            "accountId": "712020:506ee904-6d92-41c0-9232-a3e14f055bd8",
            "displayName": "Bell",
        },
    })
    assert issue["assignee_id"] == "usr_k1m2n3"


if __name__ == "__main__":
    test_mask_assignee_object()
    test_mask_issue_and_text()
    test_mask_payload_drops_raw_fields()
    test_mask_issue_prefers_onboarding_hire_id()
    print("privacy ok")
