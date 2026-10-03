# Tacit

**Teach software by doing.**

Tacit records a browser procedure, compiles the demonstration into a reusable skill, and replays it using semantic element matching instead of brittle coordinates or generated CSS selectors.

A normal macro remembers **where you clicked**.

Tacit tries to remember **what you meant to click**.

> Example: click the `button` whose accessible meaning is **Send message**, even if its generated DOM ID changes.

## What exists today

Tacit 0.3.0 is a local-first browser automation runtime with:

- Chrome Manifest V3 recorder and replay worker
- semantic element fingerprints
- deterministic demonstration compiler
- reusable typed parameters
- secret/password handling that never writes run secrets to disk
- explicit control-flow programs with fixed repeats and guarded branches
- intent/effect/risk annotations
- confirmation gates for sending, deleting, publishing, and purchasing
- optional AI semantic enrichment through strict Structured Outputs
- reviewable self-repair proposals for UI drift
- skill revision and repair history
- portable `.tacit.json` skill bundles
- local HTTP API
- CLI
- live-updating MCP v2 server
- run history and cancellation

## Quick start

Requires Node.js 20+ and Chromium/Chrome.

```bash
git clone https://github.com/TomBom07/Tacit.git
cd Tacit
npm install
npm start
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the repository's `extension/` directory.
5. Open a site you want to teach.
6. Open Tacit.
7. Name the skill.
8. Press **Start teaching**.
9. Perform the task normally.
10. Press **Finish skill**.

Tacit stores local state at:

```text
~/.tacit/store.json
```

Override it with `TACIT_STORE`.

## Use a learned skill

List and inspect skills:

```bash
node src/cli.js list
node src/cli.js show <skill-id-or-slug>
node src/cli.js tool <skill-id-or-slug>
```

Queue a run:

```bash
node src/cli.js run <skill-id-or-slug> title="Hello"
```

For a skill with a protected external effect:

```bash
node src/cli.js run <skill-id-or-slug> message="Hello" --confirm
```

Inspect or cancel runs:

```bash
node src/cli.js runs
node src/cli.js runs --status running
node src/cli.js cancel <run-id>
```

Keep Chrome open with the Tacit extension enabled. The extension claims queued runs from the local runtime.

## Skill model

A skill preserves the original compiled steps and also contains an executable control-flow program.

```json
{
  "schemaVersion": 2,
  "id": "skill_...",
  "name": "Create issue",
  "revision": 1,
  "startUrl": "https://example.com/issues/new",
  "variables": {
    "title": {
      "type": "string",
      "description": "Issue title",
      "default": "Fix checkout regression"
    }
  },
  "steps": [
    {
      "id": "step_...",
      "action": "input",
      "locator": {
        "role": "textbox",
        "label": "Title"
      },
      "value": {
        "variable": "title",
        "default": "Fix checkout regression"
      },
      "intent": {
        "effect": "enter_data",
        "risk": "low"
      }
    }
  ],
  "controlFlow": {
    "version": 1,
    "program": [
      {
        "type": "step",
        "stepId": "step_..."
      }
    ]
  }
}
```

See [Control flow](docs/CONTROL_FLOW.md).

## Semantic replay

A recorded element fingerprint can contain:

- role
- accessible name
- label
- test ID
- placeholder
- visible text
- element type
- tag
- href
- DOM ID

Replay uses weighted semantic similarity across these fields.

Tacit blocks rather than guessing when:

- the best candidate is below the confidence threshold; or
- two candidates are both strong and too close to distinguish safely.

## Self-repair

When replay is blocked, Tacit can persist a repair proposal containing:

- original locator
- proposed locator
- confidence
- margin over the next candidate
- ambiguity
- originating run and step

Review from the Chrome popup, or use:

```bash
node src/cli.js repairs
node src/cli.js repair <repair-id>
node src/cli.js repair-apply <repair-id> --yes
node src/cli.js repair-reject <repair-id>
```

A repair is **never applied automatically**. Applying one increments the skill revision and records the change in `repairHistory`.

## Portable skills

Export:

```bash
node src/cli.js export <skill-id-or-slug>
```

Import:

```bash
node src/cli.js import create_issue.tacit.json
```

Replace an existing skill with the same ID:

```bash
node src/cli.js import create_issue.tacit.json --replace
```

Imports validate the skill and its control-flow references before storage.

## MCP

Start the MCP stdio server:

```bash
npm run mcp
```

Tacit exposes:

- one dedicated tool for every learned skill
- `tacit_list_skills`
- `tacit_run_skill`
- `tacit_list_runs`
- `tacit_get_run`
- `tacit_cancel_run`

The MCP server watches the skill store. Teaching, importing, or repairing a skill updates the live tool registry; connected clients that support tool-list change notifications can refresh without restarting Tacit.

Risky skill tools expose an explicit confirmation field. Tacit refuses to queue protected effects without confirmation.

## Optional AI compiler

Tacit works without AI.

The deterministic compiler remains the execution authority. An optional model can improve:

- overall goal wording
- descriptions
- variable descriptions
- semantic step summaries
- non-executable branch hints
- non-executable loop hints

It cannot change:

- action order
- action types
- locators
- URLs
- demonstrated values
- step IDs
- confirmation policy
- executable control flow

### Responses API

```bash
export TACIT_AI_PROVIDER=responses
export TACIT_AI_ENDPOINT=https://api.openai.com/v1/responses
export TACIT_AI_API_KEY=...
export TACIT_AI_MODEL=...
```

### OpenAI-compatible Chat Completions

```bash
export TACIT_AI_PROVIDER=chat
export TACIT_AI_ENDPOINT=https://example.com/v1/chat/completions
export TACIT_AI_API_KEY=...
export TACIT_AI_MODEL=...
```

If the model is unavailable or returns invalid structured output, the deterministic skill still compiles.

See [Intelligence layer](docs/INTELLIGENCE.md).

## Local API

Default runtime: `http://127.0.0.1:4317`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Runtime health |
| `POST` | `/recordings` | Save and compile a demonstration |
| `POST` | `/skills/compile` | Compile a stored or supplied recording |
| `GET` | `/skills` | List skills |
| `GET` | `/skills/:id` | Read a skill |
| `GET` | `/skills/:id/tool` | Read the agent tool definition |
| `POST` | `/runs` | Queue a run |
| `GET` | `/runs` | List recent runs |
| `GET` | `/runs/next` | Claim the next queued run |
| `GET` | `/runs/:id` | Read a run |
| `POST` | `/runs/:id/cancel` | Cancel a queued/running run |
| `POST` | `/runs/:id/result` | Submit browser execution result |
| `GET` | `/repairs` | List repair proposals |
| `GET` | `/repairs/:id` | Read a repair |
| `POST` | `/repairs/:id/apply` | Apply an explicitly approved repair |
| `POST` | `/repairs/:id/reject` | Reject a repair |

Browser requests from normal website origins are rejected. See [Security](SECURITY.md).

## Development

Run the full test suite:

```bash
npm test
```

Run tests plus syntax checks:

```bash
npm run check
```

CI runs on Node 20 and Node 22.

## Architecture

```text
human demonstration
        ↓
browser recorder
        ↓
deterministic compiler
        ↓
semantic intent + typed inputs
        ↓
control-flow program
        ↓
optional bounded AI enrichment
        ↓
versioned Tacit skill
        ↓
CLI / HTTP / MCP
        ↓
browser runner
        ↓
semantic matcher
        ↓
success ───────────────→ run history
   │
   └─ blocked
        ↓
repair proposal
        ↓
human review
        ↓
new skill revision
```

The larger goal is a compiler for **tacit human procedures**: demonstrate how work is done, turn that behavior into inspectable software, let agents call it, and repair the procedure when interfaces drift.

See [Architecture](docs/ARCHITECTURE.md).
