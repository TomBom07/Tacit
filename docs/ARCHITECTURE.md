# Tacit architecture

Tacit treats a human demonstration as training data for a small, inspectable executable procedure.

## Data flow

1. **Observe** — the Manifest V3 extension records user actions plus semantic element fingerprints.
2. **Compile** — a deterministic compiler removes noise, parameterizes inputs, marks secrets, infers effects, and builds a control-flow program.
3. **Enrich** — an optional bounded AI pass may improve semantic descriptions but cannot mutate executable behavior.
4. **Store** — recordings, skills, runs, and repair proposals live locally in `~/.tacit/store.json`. Mutations use cross-process file locking and atomic replacement.
5. **Expose** — skills are available through the CLI, local HTTP API, and a live-updating MCP v2 server.
6. **Queue** — CLI and MCP run requests go through the persistent HTTP runtime. This keeps ephemeral secret values in one long-lived process.
7. **Replay** — the Chrome extension claims queued runs and executes the skill's control-flow program.
8. **Match** — targets are located by weighted semantics rather than a single selector.
9. **Repair** — low-confidence or ambiguous matches stop execution and can produce a human-reviewable repair proposal.
10. **Version** — accepted repairs increment the skill revision and create repair history.

## Process model

```text
                    ┌────────────────────┐
                    │  CLI / MCP client  │
                    └─────────┬──────────┘
                              │ queue/list/cancel
                              ▼
┌──────────────┐     HTTP   ┌────────────────────┐
│ Chrome       │◄──────────►│ persistent runtime │
│ extension    │            │ 127.0.0.1:4317     │
└──────┬───────┘            └─────────┬──────────┘
       │                               │
       │ execute                       │ atomic store
       ▼                               ▼
 browser UI                    ~/.tacit/store.json
```

The MCP process reads the shared skill store for discovery, but execution requests go through the runtime daemon so secret values do not get stranded in a short-lived CLI/MCP process.

## Why this is different from macro recording

A traditional macro remembers *where* you clicked.

Tacit tries to remember *what you meant to click*.

A recorded target can contain:

```json
{
  "role": "button",
  "name": "Send message",
  "text": "Send",
  "testId": "composer-send"
}
```

If generated IDs, CSS classes, or surrounding DOM structure change, replay can still recover the target from semantic evidence.

## Dual representation

Tacit deliberately preserves:

- `steps` — the original compiled trace
- `controlFlow.program` — the executable structural form

This makes repeat compression and future structural edits auditable and reversible.

## Trust boundaries

- ordinary web origins cannot call the local HTTP API from the browser;
- secret run inputs are in-memory only;
- risky external effects require confirmation;
- AI cannot alter executable behavior;
- ambiguous element matches stop rather than guess;
- repairs require explicit approval.

See [SECURITY.md](../SECURITY.md).

## Current extension points

The architecture is ready for:

- multi-demonstration branch synthesis
- signed skill packages and a registry
- desktop accessibility / computer-use adapters
- richer assertions and postconditions
- deterministic recovery strategies beyond locator repair
- collaborative/shared procedure libraries
