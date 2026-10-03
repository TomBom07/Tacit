# Control flow

Tacit keeps two representations of a learned procedure:

1. `steps`: the original linear compiled trace, preserved for inspection and repair.
2. `controlFlow.program`: the executable structural representation.

Keeping both makes structural optimization reversible and debuggable.

## Step node

```json
{ "type": "step", "stepId": "step_..." }
```

## Fixed repeat

When the deterministic compiler sees identical adjacent sequences, it can represent them as a repeat without changing observed behavior.

```json
{
  "type": "repeat",
  "count": 3,
  "body": ["step_a", "step_b"]
}
```

The runner executes the referenced body exactly `count` times.

## Guarded branch

The runtime also understands guarded branches:

```json
{
  "type": "if",
  "condition": {
    "type": "elementExists",
    "locator": { "role": "dialog", "name": "Confirm" }
  },
  "then": [
    { "type": "step", "stepId": "step_confirm" }
  ],
  "else": []
}
```

Supported conditions:

- `variableEquals`
- `urlIncludes`
- `urlMatches`
- `elementExists`
- `elementTextIncludes`

Single demonstrations do not provide enough evidence to safely invent alternative branches, so the deterministic compiler does not fabricate them. Optional AI may produce non-executable branch and loop hints under `semantics.aiInsights`, but those hints are not promoted into the executable program automatically.

Imported skill bundles are validated so control-flow nodes cannot reference missing steps and repeat counts are bounded.
