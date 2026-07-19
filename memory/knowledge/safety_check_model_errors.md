Safety supervisor (`ouroboros/safety.py`) always calls **LIGHT** model with `reasoning_effort="none"`.

If `OUROBOROS_MODEL_LIGHT` is a reasoning-only endpoint (e.g. former `aion-labs/aion-3.0-mini`), **every** LLM-gated tool fails with:

`BadRequestError 400: Reasoning is mandatory for this endpoint and cannot be disabled`

That includes MCP (`mcp_gmail__*`, `mcp_buddy__*`, …), `run_script`/`run_command`, `verify_and_record`. Symptoms look like «pipeline broken» but skills/calendar are unrelated.

Fix: set `OUROBOROS_MODEL_LIGHT` to a model that accepts non-reasoning calls (demo: `openai/gpt-5.5`), then restart Ouroboros. Confirm in Settings → Models → Light.