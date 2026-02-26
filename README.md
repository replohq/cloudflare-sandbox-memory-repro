# Cloudflare Sandbox `writeFile()` Port-Check Failure Reproduction

Minimal DO-only reproduction where `sandbox.writeFile()` fails during container startup checks.

## Summary

Environment:

- `@cloudflare/sandbox`: `0.7.6`
- Base image: `docker.io/cloudflare/sandbox:0.7.6`
- Runtime path: Worker -> `ReproAgent` Durable Object -> `getSandbox()` -> `writeFile()`
- Repro mode: each DO request uses a fresh sandbox ID (no sandbox caching)

Observed behavior:

- `writeFile()` triggers `createSession`
- Startup repeatedly fails with port-check errors for port `3000`
- Some runs end with `Container exited with unexpected exit code: 137`
- Request returns `SandboxError: HTTP error! status: 500`

Expected behavior:

- `sandbox.writeFile()` writes `/test-config.json` successfully

## Key Errors

```text
Error checking if container is ready: connect(): Connection refused: container port not found. Make sure you exposed the port in your container definition.
Error checking 3000: connect(): Connection refused: container port not found. Make sure you exposed the port in your container definition.
Error checking if container is ready: The operation was aborted
Error checking 3000: The operation was aborted
✘ [ERROR] {"message":"Monitor failed to find container"}
✘ [ERROR] {"message":"Container crashed while checking for ports, did you start the container and setup the entrypoint correctly?"}
✘ [ERROR] {"message":"Container exited with unexpected exit code: 137"}
✘ [ERROR] {"msg":"Container startup failed with permanent error"}
✘ [ERROR] {"msg":"Unexpected error in createSession","httpStatus":500}
{"error":"SandboxError: HTTP error! status: 500"}
✘ [ERROR] Error in worker: { pathname: '/do/write', error: 'SandboxError: HTTP error! status: 500' }
✘ [ERROR] Uncaught SandboxError: HTTP error! status: 500
```

Typical stack chain:

```text
Sandbox.waitForPort
Sandbox.startAndWaitForPorts
Sandbox.containerFetch
UtilityClient.createSession
Sandbox.ensureDefaultSession
Sandbox.writeFile
```

## Quick Repro

```bash
cp .dev.vars.template .dev.vars
pnpm install && pnpm repro
```

Key logs found in Wrangler dev:

- `Error checking if container is ready: connect(): Connection refused`
- `Error checking 3000: connect(): Connection refused`
- `Error checking if container is ready: The operation was aborted`
- `Error checking 3000: The operation was aborted`
- `Monitor failed to find container`
- `Container crashed while checking for ports`
- `Container exited with unexpected exit code: 137`
- `Container startup failed with permanent error`
- `Unexpected error in createSession`
- `Sandbox.ensureDefaultSession`
- `SandboxError: HTTP error! status: 500`
- `Error in worker: { pathname: '/do/write'`
- `Uncaught SandboxError: HTTP error! status: 500`

## Relevant Files

- `src/index.ts` - Worker entry routing `/do/*` to `ReproAgent`
- `src/repro-agent.ts` - Durable Object calling `getSandbox()` and `writeFile()`
- `repro.mts` - Automated DO-only stress repro
- `Dockerfile` - Sandbox image customization
- `wrangler.jsonc` - Worker + container + DO config