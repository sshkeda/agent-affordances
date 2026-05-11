# agent-affordances

**agent-affordances** is a tiny metadata/projection library for agent-callable capabilities.

Think of it as **OpenAPI for agent tools**: define a tool, command, or operation once, then project that metadata into the shapes different agent surfaces need.

Supported projections today:

- MCP tool descriptors
- Pi tool definitions
- CLI command metadata
- OpenAPI operation/path documents
- SDK operation manifests
- Markdown documentation

It intentionally does **not** execute tools. Product repos keep handlers, auth, IO, process management, routing, and CLI parsing explicit.

## Why?

Agent products often duplicate the same capability metadata across:

- MCP tool schemas
- app/extension tool definitions
- CLI help
- SDK method metadata
- OpenAPI docs
- Markdown docs
- tests and snapshots

That drift is easy to miss. `agent-affordances` keeps the source of truth as plain TypeScript metadata and pure projector functions.

## Non-goals

This package is not a framework.

It must not contain:

- tool handlers
- auth or permission enforcement
- network/process/filesystem runtime logic
- Commander/Yargs/HTTP server adapters
- product-specific strings or business rules
- lifecycle hooks or middleware

The rule is simple:

> `agent-affordances` describes what exists; your product decides how it runs.

## Install

This repo is currently intended for source/git/submodule use while the API settles.

```bash
git clone https://github.com/sshkeda/agent-affordances
cd agent-affordances
bun install
bun run test
```

For another repo, prefer one of:

```json
{
  "devDependencies": {
    "agent-affordances": "github:sshkeda/agent-affordances#main"
  }
}
```

or a submodule/vendor path:

```bash
git submodule add https://github.com/sshkeda/agent-affordances vendor/agent-affordances
```

```json
{
  "devDependencies": {
    "agent-affordances": "file:vendor/agent-affordances"
  }
}
```

Keep it as a dev/generation dependency when possible. Public runtime packages should consume generated artifacts instead of importing the catalog engine at runtime.

## Example

```ts
import { z } from "zod";
import {
  defineCatalog,
  defineTool,
  toMcpTools,
  toMarkdownDocument,
  toOpenApiDocument,
} from "agent-affordances";

const runTool = defineTool({
  kind: "tool",
  id: "agent_mcp.run",
  version: "0.1.0",
  title: "Run Agent SDK Code",
  description: "Run JavaScript with repo/npm/shell/ui SDK globals.",
  input: z.object({
    code: z.string().describe("Async JavaScript function body."),
    timeout_seconds: z.number().optional().describe("Execution timeout in seconds."),
  }),
  output: z.object({
    ok: z.boolean(),
    result: z.unknown().optional(),
  }),
  execution: { mode: "sync", sideEffects: "external", idempotent: false },
  projections: {
    mcp: { name: "run" },
    cli: { name: "run", usage: "agent-mcp run <code>", group: "tools" },
    openapi: { method: "post", path: "/tools/run", operationId: "runAgentCode" },
    sdk: { name: "run" },
  },
});

const catalog = defineCatalog({
  id: "agent-mcp",
  title: "agent-mcp",
  version: "0.1.0",
  affordances: [runTool],
});

const mcpTools = toMcpTools(catalog.affordances);
const openapi = toOpenApiDocument(catalog.affordances, {
  title: "agent-mcp API",
  version: "0.1.0",
});
const docs = toMarkdownDocument(catalog.affordances);
```

## Core concepts

### `defineTool`

Defines an agent-callable capability.

A tool has:

- stable `id`
- `version`
- `title` and `description`
- Zod `input` and `output` schemas
- optional permission/runtime/execution metadata
- optional projection overrides

### `defineCommand`

Defines a local/CLI command affordance. Commands are metadata too, but require a CLI projection name.

### `defineCatalog`

Groups affordances into one named catalog and rejects duplicate affordance IDs.

### Projectors

Projectors are pure functions. They return plain data, not executable handlers.

Examples:

- `toMcpTool`, `toMcpTools`
- `toPiToolDefinition`, `toPiToolDefinitions`
- `toCliCommand`, `toCliCommands`
- `toOpenApiOperation`, `toOpenApiDocument`
- `toSdkOperation`, `toSdkManifest`
- `toMarkdown`, `toMarkdownDocument`

## Recommended architecture

```text
product-affordances/
  src/catalog.ts       # defineTool/defineCommand/defineCatalog
  scripts/generate.ts  # writes generated artifacts

public-runtime-package/
  src/generated.ts     # generated metadata snapshot
  src/handlers.ts      # explicit handlers, not generated
```

Keep handlers explicit:

```ts
const handlers = {
  run: async (input, ctx) => {
    // Product runtime logic lives here, not in agent-affordances.
  },
};
```

## Development

```bash
bun install
bun run build
bun run test
bun run typecheck
```

## Status

Early but usable. The package is being dogfooded for `agent-mcp` tool descriptors and other agent-facing capability catalogs.

## License

MIT
