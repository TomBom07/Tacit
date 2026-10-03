# Tacit intelligence layer

Tacit separates **semantic understanding** from **executable authority**. A model may help describe a procedure, but it cannot silently rewrite what the browser will do.

## 1. Deterministic compiler

Every compiled skill is created locally first.

The deterministic pass produces:

- typed variables
- secret markers
- semantic locators
- step-level intent
- external effects such as `send`, `delete`, `publish`, and `purchase`
- risk labels
- confirmation requirements
- an explicit control-flow program
- fixed-repeat compression when repeated sequences are provably identical

This layer is authoritative for execution and policy.

## 2. Optional AI semantic pass

Tacit supports a Responses-style Structured Outputs endpoint:

```bash
TACIT_AI_PROVIDER=responses
TACIT_AI_ENDPOINT=https://api.openai.com/v1/responses
TACIT_AI_API_KEY=...
TACIT_AI_MODEL=...
```

Or an OpenAI-compatible Chat Completions endpoint:

```bash
TACIT_AI_PROVIDER=chat
TACIT_AI_ENDPOINT=https://example.com/v1/chat/completions
TACIT_AI_API_KEY=...
TACIT_AI_MODEL=...
```

The optional model may improve:

- skill description
- overall goal wording
- variable descriptions
- step summaries
- target wording
- non-executable branch hints
- non-executable loop hints

It is not allowed to change:

- action order
- action type
- DOM locator
- URL
- demonstrated values
- step IDs
- confirmation policy
- executable control flow

The model receives variable metadata but not stored defaults from the compact AI payload. Secret values are never persisted into the skill.

If the model is unavailable, misconfigured, or returns invalid structured data, Tacit keeps the deterministic skill and records the AI pass as disabled/error.

## 3. Control flow

The original linear trace stays in `skill.steps`.

The executable structure lives in `skill.controlFlow.program` and supports:

- `step`
- `repeat`
- guarded `if / else`

Single demonstrations do not provide enough evidence to invent alternative paths safely, so AI branch hints remain metadata until a user/editor explicitly turns them into executable guards.

See [CONTROL_FLOW.md](CONTROL_FLOW.md).

## 4. Repair proposals

When replay cannot identify a target confidently, the browser worker reports ranked semantic candidates. Tacit converts that failure into a repair proposal containing:

- original locator
- proposed locator
- confidence score
- margin over the next-best candidate
- ambiguity flag
- stable step ID
- source run

Repairs never apply automatically.

Review them in the Chrome popup, or use:

```bash
tacit repairs
tacit repair <repair-id>
tacit repair-apply <repair-id> --yes
tacit repair-reject <repair-id>
```

Applied repairs increment the skill revision and append to `repairHistory`.

## 5. MCP

Keep the runtime daemon running:

```bash
npm start
```

Then start the MCP stdio process separately:

```bash
npm run mcp
```

Run operations are sent back through the persistent runtime instead of being written directly by the MCP process. This matters for secret inputs: the runtime can hold them in memory until Chrome claims the run without ever writing them to disk.

The MCP tool registry hot-reloads learned or repaired skills. Compatible clients receive a tool-list change signal instead of requiring a Tacit restart.

Built-in MCP tools include:

- `tacit_list_skills`
- `tacit_run_skill`
- `tacit_list_runs`
- `tacit_get_run`
- `tacit_cancel_run`

Each learned skill also receives a dedicated tool.

Protected external effects expose a confirmation field; the runtime still performs the final confirmation check before queueing.
