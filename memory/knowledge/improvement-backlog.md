# Improvement Backlog

This topic stores concrete, evidence-backed improvement items discovered during task execution.
Items here are advisory backlog nominations, not auto-started work.
Before implementation, run plan_task for non-trivial backlog items.

### ibl-60b229903855
- status: open
- priority: high
- kind: capability_idea
- created_at: 2026-07-19T14:43:30.452584+00:00
- last_seen: 2026-07-19T14:43:30.452584+00:00
- count: 3
- source: task_26f818e1
- category: process_efficiency
- task_id: 26f818e1
- requires_plan_review: yes
- fingerprint: 60b229903855
- summary: Implement unified onboarding context resolver to eliminate multi-drive file-path search tax
- evidence: Calls 1–6 executed 5 redundant file reads across 3 task_drive UUIDs to locate canonical state. Cost: ~0.5 USD and 6 round-trips. Every onboarding task will repeat this pattern.
- proposed_next_step: Design 'resolve_onboarding_context(user_id, date, root)' function that caches task_drive UUID and all artifact paths. Call once per task session.

### ibl-99ed8cc98c55
- status: open
- priority: high
- kind: improvement
- created_at: 2026-07-19T13:05:48.460422+00:00
- last_seen: 2026-07-19T13:05:48.460422+00:00
- count: 2
- source: run_script policy-denied + edit_text_blocked recovery at lin ⚠️ OMISSION NOTE: +36 chars omitted
- category: tool_friction
- task_id: edba3faa
- requires_plan_review: yes
- fingerprint: 99ed8cc98c55
- summary: edit_text ambiguity with repeated JSON keys in state.json
- evidence: Two edit_text operations failed on runtime_data:task_drives/ae958b3b/onboarding/onb_usr_k1m2n3_20260804/state.json because old_str search matched multiple occurrences. Recovered by including larger context, but indicates brittle pattern for structured files.
- context: edit_text string-matching is not suitable for JSON/YAML where object-level keys repeat across stage sections. Each stage has 'status', 'draft_path', etc.
- proposed_next_step: Implement json_edit tool or extend edit_text to support line ranges and JSON path selectors. Alternatively, document safe pattern: read → parse → mutate → write for all structured multi-section config.

### ibl-e971cb1434ad
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-19T15:23:36.789520+00:00
- last_seen: 2026-07-19T15:23:36.789520+00:00
- count: 2
- source: this task (e1e9428a)
- category: infrastructure
- task_id: e1e9428a
- requires_plan_review: yes
- fingerprint: e971cb1434ad
- summary: MCP tools (gmail, buddy, verify_and_record) reject requests without mandatory reasoning parameter, blocking core tool usage
- evidence: Three sequential safety_violation errors: BadRequestError 400 'Reasoning is mandatory for this endpoint and cannot be disabled' on mcp_gmail__gmail_get_message, mcp_buddy__buddy_get_profile, verify_and_record

### ibl-b0296dd6e7b0
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-19T14:43:30.452584+00:00
- last_seen: 2026-07-19T14:43:30.452584+00:00
- count: 1
- source: task_26f818e1 acceptance review
- category: reliability
- task_id: 26f818e1
- requires_plan_review: yes
- fingerprint: b0296dd6e7b0
- summary: Investigate retained state evidence from prior failed email send; clarify idempotency/retry semantics
- evidence: Acceptance reviewer caveat: 'known prior failed send from an earlier run, preserved in state history.' Current run succeeded with fresh confirmation, but no retry logic or idempotency wrapper noted.
- context: Suggests onboarding send may not be reliably idempotent; if user re-triggers task, risk of duplicate emails.

### ibl-29b29cd55687
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-19T14:19:38.276851+00:00
- last_seen: 2026-07-19T14:19:38.276851+00:00
- count: 1
- source: onboarding task b924295a
- category: tool_behavior
- task_id: b924295a
- requires_plan_review: yes
- fingerprint: 29b29cd55687
- summary: Gmail MCP recipient acceptance mismatch: mcp_gmail__gmail_send(to=['usr_hr']) returns accepted=['self']
- evidence: Call 10 and read-back call 12 both show accepted=['self'] despite to=['usr_hr']. Stage 1 blocked as result.
- proposed_next_step: Investigate whether Gmail MCP recipient field validates IDs server-side, maps local aliases, or enforces scope boundaries. Add recipient echo/validation gate before send to fail fast.

### ibl-8466f4a2696b
- status: open
- priority: high
- kind: capability_idea
- created_at: 2026-07-19T10:43:22.691309+00:00
- last_seen: 2026-07-19T10:43:22.691309+00:00
- count: 2
- source: onb_usr_k1m2n3_20260804 task result
- category: capability_idea
- task_id: 80304db0
- requires_plan_review: yes
- fingerprint: 8466f4a2696b
- summary: Implement preflight rendered-message validation before external send in onboarding pipeline
- evidence: Gmail MCP expanded opaque user IDs after send; privacy caveat could not be undone. Task outcome marked degraded due to this.
- context: Affects all onboarding stages that send external messages with user ID references.
- proposed_next_step: Design a preflight_render tool or template validator that dry-runs a message and flags opaque ID expansion before committing send.

### ibl-de27ef956db3
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-19T12:25:27.054006+00:00
- last_seen: 2026-07-19T12:25:27.054006+00:00
- count: 1
- source: task_03d95d09
- category: integration_bug
- task_id: 03d95d09
- requires_plan_review: yes
- fingerprint: de27ef956db3
- summary: Google Calendar MCP attendee read/write opacity
- evidence: Attendee parameters passed to mcp_google_calendar__google_calendar_create_event and update_event are accepted without error, but list_events returns only event.organizer in attendees field. Affects onboarding stage 4 verifiability.
- proposed_next_step: Audit Google Calendar MCP backend: verify attendee mutation is persisted and accessible, or document asymmetric API contract and provide alternative attendee audit mechanism.

### ibl-e0593ab10618
- status: open
- priority: high
- kind: bug
- created_at: 2026-07-19T08:17:12.437098+00:00
- last_seen: 2026-07-19T08:17:12.437098+00:00
- count: 1
- source: task_a20338b0 (onboarding stage 1)
- category: external_mcp_reliability
- task_id: a20338b0
- requires_plan_review: yes
- fingerprint: e0593ab10618
- summary: mcp_yandex_mail__yandex_mail_send times out (60s) without delivery confirmation
- evidence: Two consecutive send calls (#4, #8) to yandex_mail MCP timed out; list_messages verification found no Sent/Outbox evidence; mail never reached recipients.
- context: Blocks MVP onboarding advancement. Risk: if mail MCP is under load, all stage-1 dependent tasks queue up and fail silently.
- proposed_next_step: Query yandex_mail infrastructure for service status/load. Consider SLA or timeout tuning. If chronic, add health-check capability and retry logic as pre-requisite for onboarding tasks.

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

### ibl-cbce07503f27
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T16:27:17.827251+00:00
- last_seen: 2026-07-19T16:27:17.827251+00:00
- count: 4
- source: post_task_review
- category: tooling
- task_id: 85ee39bb
- requires_plan_review: yes
- fingerprint: cbce07503f27
- summary: Add structured JSON patch/update helper for onboarding state files
- evidence: Stage 5 required 6 exact-snippet edit_text calls on state.json to update statuses, audit, and metadata; this is brittle and costly compared with one schema-aware JSON update.
- proposed_next_step: Create or expose a JSON patch tool supporting path-based set/append operations with validation.

### ibl-df33a8da1523
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T07:17:25.055911+00:00
- last_seen: 2026-07-19T07:17:25.055911+00:00
- count: 2
- source: list_files call #9 'Directory not found' error
- category: workflow_robustness
- task_id: ae958b3b
- requires_plan_review: yes
- fingerprint: df33a8da1523
- summary: Standard onboarding directories (task_drive:onboarding/) may not exist; list_files fails silently without fallback initialization
- evidence: Agent assumes directory exists but it may be created on-demand or require explicit setup in onboarding workflows
- proposed_next_step: Add directory creation guard in onboarding initialization or provide fallback mkdir semantics in list_files

### ibl-c23808521fa8
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T13:05:48.460422+00:00
- last_seen: 2026-07-19T13:05:48.460422+00:00
- count: 2
- source: run_script call #7 hit SKILL_STATE_WRITE_BLOCKED policy deni ⚠️ OMISSION NOTE: +36 chars omitted
- category: safety_pattern
- task_id: edba3faa
- requires_plan_review: yes
- fingerprint: c23808521fa8
- summary: Early detection and guard for skill state write attempts
- evidence: Agent invoked run_script with payload attempting skill/enablement state mutation. Policy correctly rejected. No prior validation logic to catch and redirect to skill_review/UI flow before tool call.
- context: Skill enablement is review-gated by design. Agent should recognize this constraint and redirect early rather than attempt bypass and incur policy denial.
- proposed_next_step: Add pre-tool validation in onboarding/MVP pipeline step logic: if detecting skill mutation intent, route to skill_review tool or guidance doc instead of run_script.

### ibl-0f70261d0eff
- status: open
- priority: med
- kind: bug
- created_at: 2026-07-19T16:22:41.345229+00:00
- last_seen: 2026-07-19T16:22:41.345229+00:00
- count: 2
- source: post_task_review
- category: tooling
- task_id: ca236a67
- requires_plan_review: yes
- fingerprint: 0f70261d0eff
- summary: Make verify_and_record robust when cwd resolution fails
- evidence: verify_and_record failed with PYTHON_INTERPRETER_UNAVAILABLE: cwd_resolution_failed; acceptance review became degraded despite recovered deliverables.
- proposed_next_step: Add explicit cwd/interpreter selection or fallback host-attested verification path.

### ibl-d468b797fb03
- status: open
- priority: med
- kind: capability_idea
- created_at: 2026-07-19T15:53:21.368523+00:00
- last_seen: 2026-07-19T15:53:21.368523+00:00
- count: 1
- source: post_task_review
- category: tooling
- task_id: df96ebd7
- requires_plan_review: yes
- fingerprint: d468b797fb03
- summary: Add or expose a buddy assignment write MCP for onboarding stage 2
- evidence: Stage 2 required buddy assignment, but available surface only had mcp_buddy__buddy_get_profile and Gmail; final state recorded that no buddy assignment write-tool existed.
- proposed_next_step: Create an explicit MCP operation such as buddy_assign(employee_id,buddy_id,onboarding_id,idempotency_key) or document the authoritative substitute.

### ibl-cd0ae3f90ea9
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T14:50:06.624934+00:00
- last_seen: 2026-07-19T14:50:06.624934+00:00
- count: 1
- source: tool_trace_analysis
- category: performance
- task_id: 01266a8c
- requires_plan_review: yes
- fingerprint: cd0ae3f90ea9
- summary: Implement batch fetch for buddy profiles or pre-filter by role/team before sequential get_profile calls
- evidence: 3 sequential mcp_buddy__buddy_get_profile calls; candidate list was static, suggesting batch operation or pre-filtering would halve MCP cost.

### ibl-922d2614a2cc
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T14:43:30.452584+00:00
- last_seen: 2026-07-19T14:43:30.452584+00:00
- count: 1
- source: task_26f818e1
- category: tool_efficiency
- task_id: 26f818e1
- requires_plan_review: yes
- fingerprint: 922d2614a2cc
- summary: Simplify email verification in onboarding send flow; remove unnecessary base64 encoding step
- evidence: Calls 9–12 show overcomplicated verification: send() → run_script(base64 encode) → list_messages → get_message. Base64 output not used in final result. Single SENT folder check sufficient.
- context: run_script with base64 encoding (call 9) appears exploratory; did not feed into downstream logic.

### ibl-2917435be3a7
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T14:10:21.687776+00:00
- last_seen: 2026-07-19T14:10:21.687776+00:00
- count: 1
- source: search_code policy_denial on task_drive root
- category: tool_usage
- task_id: d1c7883a
- requires_plan_review: yes
- fingerprint: 2917435be3a7
- summary: Pre-flight permission check for search_code before execution
- evidence: search_code blocked with TOOL_ACCESS_BLOCKED; self_modification profile lacks task_drive search permission. Must check profile capability before invoking search_code.
- context: Prevents redundant blocked calls and allows tool substitution (read_file/edit_text) upfront.
- proposed_next_step: Add profile_check() before search_code calls; log permitted roots and skip or downgrade operation if target root forbidden.

### ibl-1f57e91137d9
- status: open
- priority: med
- kind: capability_idea
- created_at: 2026-07-19T08:17:12.437098+00:00
- last_seen: 2026-07-19T08:17:12.437098+00:00
- count: 1
- source: task_a20338b0 (onboarding stage 1)
- category: onboarding_robustness
- task_id: a20338b0
- requires_plan_review: yes
- fingerprint: 1f57e91137d9
- summary: Add MCP pre-flight health check before stage-1 external writes
- evidence: No health check occurred before mail sends. Timeouts were detected only post-failure via state inspection and folder verification. Early detection would have failed fast.
- proposed_next_step: Implement optional capability: test_mcp_liveness(mcp_name, timeout_sec). Call before any stage-1 mutation. If fails, defer task with clear escalation (not silent hang).

### ibl-ac86b22998f7
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T08:17:12.437098+00:00
- last_seen: 2026-07-19T08:17:12.437098+00:00
- count: 1
- source: task_a20338b0 (onboarding stage 1)
- category: tool_resilience
- task_id: a20338b0
- requires_plan_review: yes
- fingerprint: ac86b22998f7
- summary: Implement retry+backoff for MCP tool timeouts
- evidence: Single timeout on send led to task failure. No retry attempted; two sequential calls both timed out, suggesting systematic issue, not transient.
- context: Retry logic should be adaptive: first retry at +5s, second at +10s, then fail-fast with logged evidence.

### ibl-4907ab88d7ec
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T07:17:25.055911+00:00
- last_seen: 2026-07-19T07:17:25.055911+00:00
- count: 1
- source: ensure_project_scope call #2 rejection
- category: tool_design
- task_id: ae958b3b
- requires_plan_review: yes
- fingerprint: 4907ab88d7ec
- summary: ensure_project_scope behaves destructively when task already has a project scope; requires pre-flight context check or idempotent design
- evidence: Tool error: re-scoping rejected on already-scoped task; agent must read scope before invoking

### ibl-61ee8bbff890
- status: open
- priority: low
- kind: improvement
- created_at: 2026-07-19T11:23:57.594889+00:00
- last_seen: 2026-07-19T11:23:57.594889+00:00
- count: 1
- source: Task intake; OMISSION NOTE in task_goal field
- category: improvement
- task_id: effe47f5
- requires_plan_review: yes
- fingerprint: 61ee8bbff890
- summary: Task goal truncation (200 chars) masked 'find actual localization' requirement; unclear if scope was incomplete or intentionally deferred
- evidence: Goal text ended with ellipsis after 'find actual localization' — no clarity on what localization assets, repos, or steps were in scope. Agent proceeded without re-asking, which succeeded but risked silent scope gap.
- context: Process-level: truncation handling needs earlier clarification gate.
- proposed_next_step: If task goal >150 chars and ends with truncation marker, prompt for full scope before proceeding.

### ibl-4a636ad9cb0e
- status: open
- priority: low
- kind: improvement
- created_at: 2026-07-19T11:13:40.242041+00:00
- last_seen: 2026-07-19T11:13:40.242041+00:00
- count: 1
- source: task 5590edba: knowledge_read(mail_mcp_reliability) and know ⚠️ OMISSION NOTE: +36 chars omitted
- category: cost_efficiency
- task_id: 5590edba
- requires_plan_review: yes
- fingerprint: 4a636ad9cb0e
- summary: Remove defensive knowledge reads that are not acted upon in onboarding tasks
- evidence: Result explicitly states 'я не выполнял отдельную Sent/privacy-проверку'; knowledge was pulled but decision path did not consume it

### ibl-d9085e99551f
- status: open
- priority: low
- kind: improvement
- created_at: 2026-07-19T07:17:25.055911+00:00
- last_seen: 2026-07-19T07:17:25.055911+00:00
- count: 1
- source: task_acceptance_review: 'Acceptance reviewers did not reach  ⚠️ OMISSION NOTE: +35 chars omitted
- category: review_process
- task_id: ae958b3b
- requires_plan_review: yes
- fingerprint: d9085e99551f
- summary: Review quorum logic may be overly strict for single-agent task completion; degraded review despite complete draft artifact
- evidence: outcome_axes.review.acceptance_decision: review_degraded despite agent_disposition accepted and artifacts ready
- context: Agent locally verified all artifacts; no external mutations. Quorum failure may not reflect task quality.

### ibl-fd7f4ec28920
- status: open
- priority: med
- kind: improvement
- created_at: 2026-07-19T16:42:55.866197+00:00
- last_seen: 2026-07-19T16:42:55.866197+00:00
- count: 1
- source: post-task reflection
- category: tooling
- task_id: fd4f0f25
- requires_plan_review: yes
- fingerprint: fd7f4ec28920
- summary: Improve run_script artifact registration diagnostics and recovery guidance
- evidence: run_script returned artifact_output_error despite exit_code=0 after printing FILENAME/SIZE/BASE64 for Цели_ИС_usr_p8q2w4_2026-08-11.xlsx; execution degraded with reason_code=tool_failure.
- proposed_next_step: Add clearer validation/error messages for declared artifact outputs and a recommended recovery path that preserves generated files.
