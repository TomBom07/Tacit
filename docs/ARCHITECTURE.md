# Tacit architecture

Tacit treats a human demonstration as training data for a small executable procedure.

## Data flow

1. **Observe** — the MV3 extension records user actions plus semantic element fingerprints.
2. **Compile** — the local runtime removes noise, turns demonstrated values into parameters, and emits a versioned `Skill`.
3. **Store** — recordings, skills and runs live locally in `~/.tacit/store.json`.
4. **Expose** — every skill can be rendered as an agent-compatible tool definition with a JSON Schema input contract.
5. **Replay** — the extension claims queued runs and executes them in the active browser.
6. **Repair** — targets are located using weighted semantics (`role`, accessible name, label, test id, text, etc.) rather than one CSS selector. Low-confidence matches stop instead of guessing.

## Why this is different from macro recording

A traditional macro remembers *where* you clicked. Tacit tries to remember *what you meant to click*.

A recorded target can contain:

```json
{
  "role": "button",
  "name": "Send message",
  "text": "Send",
  "testId": "composer-send"
}
```

If the DOM hierarchy or generated CSS classes change, replay can still recover the target from its semantics.

## Next architectural layers

- LLM compiler for naming steps, detecting loops/branches and inferring richer parameters.
- Browser-side repair proposals that can be accepted once and persisted back into the skill.
- Human-confirmation gates for irreversible actions.
- Skill packages, versioning, signatures and a registry (`tacit install ...`).
- Multi-app procedures through desktop accessibility / computer-use adapters.
- MCP server so any compatible agent can discover and invoke installed Tacit skills directly.
