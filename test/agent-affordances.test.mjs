import { test } from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"
import {
  createAffordanceRegistry,
  defineTool,
  toCliCommand,
  toCliCommands,
  toMarkdown,
  toMarkdownDocument,
  toMcpTool,
  toMcpTools,
  toOpenApiDocument,
  toOpenApiOperation,
  toOpenApiPaths,
  toPiToolDefinition,
  toPiToolDefinitions,
  toSdkManifest,
  toSdkOperation,
  toSdkOperations,
} from "../dist/index.js"

const input = z.object({
  input: z.string().describe("Question or task to send to the council"),
})
const output = z.object({
  ok: z.literal(true),
  data: z.object({ answer: z.string() }),
})

function sampleTool() {
  return defineTool({
    kind: "tool",
    id: "zcouncil.run",
    version: "0.1.0",
    title: "Run zcouncil",
    description: "Ask the default zcouncil profile for perspectives on an input.",
    input,
    output,
    permissions: { requires: ["model.invoke"], dataClasses: ["user_text"] },
    runtime: { network: true, env: ["OPENROUTER_API_KEY"] },
    execution: { mode: "sync", sideEffects: "external", idempotent: false },
    projections: {
      mcp: { name: "run" },
      pi: { name: "zcouncil_run", label: "Run zcouncil" },
      cli: { name: "run", usage: "zcouncil run <prompt>", group: "api" },
      openapi: {
        method: "post",
        path: "/v1/run",
        operationId: "runCouncil",
        tags: ["zcouncil"],
      },
      sdk: { name: "run" },
    },
  })
}

test("defineTool validates stable ids and registry rejects duplicates", () => {
  assert.throws(() => defineTool({ ...sampleTool(), id: "Bad Id" }), /Invalid affordance id/)
  const tool = sampleTool()
  const registry = createAffordanceRegistry([tool])
  assert.equal(registry.require("zcouncil.run"), tool)
  assert.throws(() => registry.register(tool), /Duplicate affordance id/)
})

test("projects one tool definition to MCP, Pi, OpenAPI, and docs", () => {
  const tool = sampleTool()

  const mcp = toMcpTool(tool)
  assert.equal(mcp.name, "run")
  assert.equal(mcp.title, "Run zcouncil")
  assert.equal(mcp.inputSchema.type, "object")
  assert.deepEqual(mcp.annotations, {
    destructiveHint: false,
    idempotentHint: false,
  })

  const pi = toPiToolDefinition(tool)
  assert.equal(pi.name, "zcouncil_run")
  assert.equal(pi.label, "Run zcouncil")
  assert.equal(pi.parameters.type, "object")

  const cli = toCliCommand(tool)
  assert.equal(cli.name, "run")
  assert.equal(cli.usage, "zcouncil run <prompt>")
  assert.equal(cli.group, "api")
  assert.equal(cli.inputSchema.type, "object")

  const openapi = toOpenApiOperation(tool)
  assert.equal(openapi.path, "/v1/run")
  assert.equal(openapi.method, "post")
  assert.equal(openapi.operation.operationId, "runCouncil")
  assert.deepEqual(openapi.operation.tags, ["zcouncil"])

  const markdown = toMarkdown(tool)
  assert.match(markdown, /# Run zcouncil/)
  assert.match(markdown, /`zcouncil\.run`/)
  assert.match(markdown, /OPENROUTER_API_KEY/)
})

test("projects collections without duplicating adapter merge logic", () => {
  const tool = sampleTool()
  assert.equal(toMcpTools([tool])[0].name, "run")
  assert.equal(toPiToolDefinitions([tool])[0].name, "zcouncil_run")
  assert.equal(toOpenApiPaths([tool])["/v1/run"].post.operationId, "runCouncil")
  assert.equal(toSdkOperations([tool])[0].name, "run")
  assert.equal(toCliCommands([tool])[0].name, "run")
  const doc = toOpenApiDocument([tool], {
    title: "zcouncil API",
    version: "0.1.0",
  })
  assert.equal(doc.openapi, "3.1.0")
  assert.equal(doc.paths["/v1/run"].post.operationId, "runCouncil")
  const manifest = toSdkManifest([tool], {
    name: "zcouncil",
    version: "0.1.0",
  })
  assert.equal(manifest.operations[0].path, "/v1/run")
  assert.match(toMarkdownDocument([tool]), /# Run zcouncil/)
})

test("projects SDK operation metadata for codegen and handwritten clients", () => {
  const operation = toSdkOperation(sampleTool())
  assert.equal(operation.id, "zcouncil.run")
  assert.equal(operation.name, "run")
  assert.equal(operation.method, "post")
  assert.equal(operation.path, "/v1/run")
  assert.equal(operation.inputSchema.type, "object")
  assert.equal(operation.outputSchema.type, "object")
  assert.equal(operation.sideEffects, "external")
  assert.equal(operation.idempotent, false)
})

test("default projection names are deterministic", () => {
  const tool = defineTool({
    kind: "tool",
    id: "pi_chatgpt.ask-gpt-pro",
    version: "0.1.0",
    title: "Ask GPT Pro",
    description: "Ask GPT Pro with supplied evidence.",
    input: z.object({ prompt: z.string() }),
    output: z.object({ answer: z.string() }),
  })
  assert.equal(toMcpTool(tool).name, "pi_chatgpt_ask_gpt_pro")
  assert.equal(toPiToolDefinition(tool).name, "pi_chatgpt_ask_gpt_pro")
  assert.equal(toOpenApiOperation(tool).path, "/pi/chatgpt/ask/gpt/pro")
})
