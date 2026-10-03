# Security

Tacit controls a real browser, so its trust boundaries are intentionally conservative.

## Local runtime

The HTTP runtime binds to `127.0.0.1` by default.

Requests originating from ordinary web pages are rejected. Browser-origin requests are accepted only from `chrome-extension://` origins; command-line and local-process requests have no browser Origin header and remain supported.

Do not bind Tacit to `0.0.0.0` on an untrusted network.

## Secrets

Password fields are marked as secret during compilation.

Secret run inputs:

- are required explicitly when the skill needs them;
- are held only in the runtime process memory until the browser claims the run;
- are not written into `~/.tacit/store.json`;
- are discarded after claim or cancellation;
- expire if the runtime process restarts before the browser claims the run.

A run whose secret input expired is blocked instead of guessing or persisting the secret.

## External effects

Skills that can send, delete, publish, or purchase require explicit confirmation before queueing through the HTTP API, CLI, or MCP tools.

Tacit does not infer confirmation from a model deciding to set a field. Agent hosts should set confirmation only after the user explicitly approves the external effect.

## Repair

Failed semantic matches can generate repair proposals. Repairs never modify a learned skill automatically.

Applying a repair requires an explicit action and creates a new skill revision with an auditable `repairHistory`.

## AI compiler

The AI compiler is optional.

Its output is bounded to semantic descriptions and hints. It cannot modify executable action types, locator data, URLs, demonstrated values, policies, IDs, or control-flow nodes.

If the model call fails or returns invalid structured data, Tacit keeps the deterministic compilation.

## Browser permissions

The current unpacked extension needs broad host access to observe and replay workflows across arbitrary sites. Treat the extension as privileged software and load it only from a repository you trust.

## Reporting

For a security issue, open a private GitHub security advisory for the repository rather than publishing exploit details in a normal issue.
