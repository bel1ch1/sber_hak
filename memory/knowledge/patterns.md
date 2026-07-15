# Pattern Register

| Error class | Count | Root cause | Structural fix | Status |
|-------------|-------|------------|----------------|--------|
| Safety violation on script/command execution (`run_script`, `run_command`) — BadRequestError 400 "Reasoning is mandatory for this endpoint and cannot be disabled." | 3 | Safety-check LLM call routes to incompatible model endpoint that requires mandatory reasoning param; blocks all shell execution | Configure safety-check to use compatible model endpoint or pass required reasoning parameter; audit endpoint routing in safety layer | Open |
| `commit_reviewed` premature infra failure (×4) blocking MCP config discovery | 4 | `commit_reviewed` tool called before stable execution context established; repeated infra errors prevent MCP server enumeration | Defer `commit_reviewed` calls until after primary tool calls succeed; add pre-flight check for execution context health | Open |
