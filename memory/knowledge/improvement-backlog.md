# Improvement Backlog

This topic stores concrete, evidence-backed improvement items discovered during task execution.
Items here are advisory backlog nominations, not auto-started work.
Before implementation, run plan_task for non-trivial backlog items.

### ibl-1e0c93d0c0e9
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-15T08:22:35.172397+00:00
- last_seen: 2026-07-15T08:22:35.172397+00:00
- count: 1
- source: commit_reviewed repeated failures
- category: infra
- task_id: 1a76b8d3
- requires_plan_review: yes
- fingerprint: 1e0c93d0c0e9
- summary: git checkout ambiguity: 'ouroboros' matches both local directory and tracking branch, causing all commit_reviewed calls to fail at infra phase
- evidence: fatal: 'ouroboros' could be both a local file and a tracking branch — appeared in 4 consecutive commit_reviewed attempts
- proposed_next_step: Fix git_ops.py to use 'git checkout -- ouroboros' or rename the tracking branch; requires runtime_mode=pro to edit supervisor/git_ops.py

### ibl-1b6b3cf3e614
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-15T08:22:35.172397+00:00
- last_seen: 2026-07-15T08:22:35.172397+00:00
- count: 1
- source: run_script/run_command safety_violation errors
- category: infra
- task_id: 1a76b8d3
- requires_plan_review: yes
- fingerprint: 1b6b3cf3e614
- summary: Safety-check model endpoint incompatibility causes run_script/run_command to always safety_violation with 'Reasoning is mandatory'
- evidence: BadRequestError 400 on 3+ calls; blocks all script execution in tasks where this model is active
- proposed_next_step: Identify which model is configured for safety checks and ensure it supports non-reasoning calls, or update safety check to use a compatible model

### ibl-43b62badbbce
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-15T12:15:57.716349+00:00
- last_seen: 2026-07-15T12:15:57.716349+00:00
- count: 1
- source: post_task_review:f6106239
- category: mcp_integration
- task_id: f6106239
- requires_plan_review: yes
- fingerprint: 43b62badbbce
- summary: Fix or wrap Yandex Calendar create_event end/duration contract mismatch
- evidence: 19 create_event calls failed/looped around server error BothEndAndDurationGiven: specify exactly one of (end, duration_minutes), not both, while list_events worked.
- proposed_next_step: Inspect the Yandex Calendar MCP tool schema and server adapter so clients can pass exactly one of end or duration_minutes without local schema rejection.
