# Tacit

**Teach software by doing.**

Tacit records a browser procedure once, compiles the demonstration into a reusable skill, and replays it using semantic element matching instead of brittle coordinates or generated CSS selectors.

A normal automation says: **click `div:nth-child(4) > button`**.  
Tacit tries to say: **click the button whose role is `button` and whose meaning is `Send message`.**

That distinction is the product.

## What works in this V1

- Chrome MV3 extension records clicks, inputs, selects, Enter presses and navigations.
- Semantic fingerprints capture role, accessible name, labels, test IDs, placeholder, text and element type.
- Demonstrations compile into versioned `Skill` JSON.
- Typed values become reusable parameters automatically.
- Password values are never persisted.
- Local runtime stores recordings, skills and runs in `~/.tacit/store.json`.
- CLI can list, inspect, export and queue learned skills.
- Replay uses weighted semantic matching and stops on low confidence rather than blindly clicking.
- Every skill is annotated with step intent, external effects and confirmation requirements.
- Blocked replays generate reviewable semantic repair proposals instead of silently changing the skill.
- Learned skills can be exposed directly through an MCP v2 stdio server.
- An optional AI compiler can improve semantic descriptions without being allowed to change executable behavior.

## Quick start

Requires Node.js 20+ and Chromium/Chrome.

```bash
npm install
npm start
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` folder.

1. Open the site you want to teach.
2. Open Tacit and name the skill.
3. Press **Start teaching**.
4. Perform the task normally.
5. Press **Finish skill**.

Inspect what Tacit learned:

```bash
node src/cli.js list
node src/cli.js show <skill-id>
node src/cli.js tool <skill-id>
```

Replay it:

```bash
node src/cli.js run <skill-id> email=you@example.com title="Hello"

# For a skill that sends, deletes, publishes or purchases:
node src/cli.js run <skill-id> message="Hello" --confirm
```

Keep Chrome open with the extension enabled. The extension claims the queued run from the local runtime and executes it in the active tab.

## The skill format

```json
{
  "id": "skill_...",
  "name": "Create issue",
  "startUrl": "https://example.com/issues/new",
  "variables": {
    "title": {
      "type": "string",
      "description": "Title",
      "default": "Fix checkout regression"
    }
  },
  "steps": [
    {
      "action": "input",
      "locator": {
        "role": "textbox",
        "label": "Title"
      },
      "value": {
        "variable": "title",
        "default": "Fix checkout regression"
      }
    }
  ]
}
```

## Local API

The runtime listens on `127.0.0.1:4317`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Runtime health |
| `POST` | `/recordings` | Save + compile a demonstration |
| `GET` | `/skills` | List learned skills |
| `GET` | `/skills/:id` | Read a skill |
| `GET` | `/skills/:id/tool` | Agent tool definition |
| `POST` | `/runs` | Queue a skill run |
| `GET` | `/runs/:id` | Inspect a run |
| `GET` | `/repairs` | List repair proposals |
| `POST` | `/repairs/:id/apply` | Apply an approved repair |
| `POST` | `/repairs/:id/reject` | Reject a repair |

## Agent use through MCP

Tacit now exposes learned browser procedures over the current MCP stdio transport.

```bash
npm run mcp
```

The MCP server snapshots the skills available at startup and registers each one as a tool. Restart the MCP process after teaching a new skill.

Skills with external effects require an explicit `_confirm: true` argument before they can be queued. Tacit also exposes `tacit_list_skills` and `tacit_get_run`.

## Intent-aware compilation

Every skill now receives deterministic semantic metadata: its goal, each step's target/effect/risk, and which effects require confirmation.

An optional AI pass can improve descriptions while being prevented from changing executable actions or locators:

```bash
export TACIT_AI_ENDPOINT="https://your-openai-compatible-endpoint/v1/chat/completions"
export TACIT_AI_API_KEY="..."
export TACIT_AI_MODEL="..."
```

No AI endpoint is required. Without one, compilation stays entirely local.

## Self-repair loop

When a replay is blocked, Tacit stores the best semantic candidates as a repair proposal.

```bash
node src/cli.js repairs
node src/cli.js repair <repair-id>
node src/cli.js repair-apply <repair-id> --yes
# or:
node src/cli.js repair-reject <repair-id>
```

Applying a repair increments the skill revision and records the before/after locator in `repairHistory`. Tacit never applies a repair silently.

See [`docs/INTELLIGENCE.md`](docs/INTELLIGENCE.md) for the trust boundaries.

## Safety model

Tacit is intentionally conservative when replay confidence is low. It stops on ambiguous targets instead of guessing. Confirmation gates are enforced when a learned skill can send, delete, publish or purchase, and semantic repairs require explicit approval before changing the stored skill.

## Run tests

```bash
npm test
```

## Where this goes

The browser V1 is the wedge. The larger idea is a compiler for **tacit human procedures**: demonstrate how work is done, turn that behavior into inspectable software, let agents call it, and repair the procedure when interfaces drift.

The long-term ecosystem is closer to **npm for procedures** than another macro recorder: versioned skills, signatures, repair history, permissions, an MCP interface, and eventually cross-application computer-use adapters.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
