# Tacit intelligence layer

Tacit's intelligence layer is deliberately split into three levels so model output never becomes executable behavior by accident.

## 1. Deterministic semantics

Every compiled skill is annotated locally with:

- the human goal
- step-level intent
- external effects such as `send`, `delete`, `publish`, or `purchase`
- risk level
- confirmation requirements

This layer has no network dependency and is always authoritative for execution policy.

## 2. Optional AI compiler

Set:

```bash
TACIT_AI_ENDPOINT=https://your-openai-compatible-endpoint/v1/chat/completions
TACIT_AI_API_KEY=...
TACIT_AI_MODEL=...
```

The optional model may improve:

- skill description
- overall goal wording
- variable descriptions
- step summaries
- semantic effect/target labels

It is not allowed to change:

- action order
- action type
- DOM locator
- URL
- demonstrated values
- step IDs
- confirmation policy

If the model is unavailable or returns invalid JSON, Tacit keeps the deterministic skill and marks the AI pass as an error instead of failing compilation.

## 3. Repair proposals

When replay cannot identify a target confidently, the browser worker reports its ranked semantic candidates. Tacit converts that failure into a repair proposal containing:

- original locator
- proposed locator
- confidence score
- margin over the next-best candidate
- ambiguity flag
- source run and step

Repairs never apply automatically.

Review them:

```bash
tacit repairs
tacit repair <repair-id>
```

Apply or reject:

```bash
tacit repair-apply <repair-id> --yes
tacit repair-reject <repair-id>
```

Applied repairs increment the skill revision and append to `repairHistory`.

## MCP

Run:

```bash
npm run mcp
```

Tacit starts an MCP stdio server and exposes the currently learned skills as tools. It also exposes:

- `tacit_list_skills`
- `tacit_get_run`

A learned skill that can cause an external effect receives an `_confirm` field. The MCP handler refuses to queue the run unless that value is explicitly true.

The browser extension still performs the actual browser execution; MCP is the agent-facing invocation layer.
