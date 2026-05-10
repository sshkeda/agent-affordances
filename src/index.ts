import { z } from "zod";

export type Schema = z.ZodType;
export type JsonSchema = Record<string, unknown>;

export interface PermissionDeclaration {
  requires?: string[];
  dataClasses?: string[];
}

export interface RuntimeDeclaration {
  environments?: string[];
  env?: string[];
  network?: boolean;
}

export interface ToolExecutionDeclaration {
  mode?: "sync" | "async" | "streaming";
  idempotent?: boolean;
  sideEffects?: "none" | "read" | "write" | "external";
}

export interface ProjectionOverrides {
  mcp?: {
    name?: string;
    title?: string;
    description?: string;
  };
  pi?: {
    name?: string;
    label?: string;
    description?: string;
  };
  openapi?: {
    operationId?: string;
    method?: "get" | "post" | "put" | "patch" | "delete";
    path?: string;
    tags?: string[];
  };
  sdk?: {
    name?: string;
  };
  cli?: {
    name?: string;
    title?: string;
    description?: string;
    usage?: string;
    group?: string;
    examples?: string[];
    hidden?: boolean;
  };
}

export interface ToolDefinition<
  Input extends Schema = Schema,
  Output extends Schema = Schema,
> {
  kind: "tool";
  id: string;
  version: string;
  title: string;
  description: string;
  input: Input;
  output: Output;
  permissions?: PermissionDeclaration;
  runtime?: RuntimeDeclaration;
  execution?: ToolExecutionDeclaration;
  projections?: ProjectionOverrides;
  examples?: {
    name: string;
    input: z.input<Input>;
    output?: z.output<Output>;
  }[];
}

export type AnyToolDefinition = ToolDefinition<Schema, Schema>;

export interface EvidenceEnvelope<TPayload = unknown> {
  kind: string;
  id?: string;
  title?: string;
  summary?: string;
  payload: TPayload;
  source?: {
    type: string;
    uri?: string;
    name?: string;
  };
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolEnvelope<TData = unknown> {
  ok: boolean;
  data?: TData;
  error?: { code?: string; message: string };
  evidence?: EvidenceEnvelope[];
  citations?: { title?: string; uri?: string; text?: string }[];
  telemetry?: Record<string, unknown>;
}

export const evidenceEnvelopeSchema = z.object({
  kind: z.string(),
  id: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  payload: z.unknown(),
  source: z
    .object({
      type: z.string(),
      uri: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
  createdAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const toolEnvelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({ code: z.string().optional(), message: z.string() })
    .optional(),
  evidence: z.array(evidenceEnvelopeSchema).optional(),
  citations: z
    .array(
      z.object({
        title: z.string().optional(),
        uri: z.string().optional(),
        text: z.string().optional(),
      }),
    )
    .optional(),
  telemetry: z.record(z.string(), z.unknown()).optional(),
});

export function defineTool<Input extends Schema, Output extends Schema>(
  definition: ToolDefinition<Input, Output>,
): ToolDefinition<Input, Output> {
  validateToolIdentity(definition.id);
  if (!definition.version.trim())
    throw new Error(`Tool ${definition.id} requires a version`);
  return Object.freeze({ ...definition });
}

export class AffordanceRegistry {
  readonly tools = new Map<string, AnyToolDefinition>();

  register(tool: AnyToolDefinition): this {
    if (this.tools.has(tool.id))
      throw new Error(`Duplicate affordance id: ${tool.id}`);
    this.tools.set(tool.id, tool);
    return this;
  }

  get(id: string): AnyToolDefinition | undefined {
    return this.tools.get(id);
  }

  require(id: string): AnyToolDefinition {
    const tool = this.get(id);
    if (!tool) throw new Error(`Unknown affordance id: ${id}`);
    return tool;
  }

  list(): AnyToolDefinition[] {
    return [...this.tools.values()];
  }
}

export function createAffordanceRegistry(
  tools: AnyToolDefinition[] = [],
): AffordanceRegistry {
  const registry = new AffordanceRegistry();
  for (const tool of tools) registry.register(tool);
  return registry;
}

function validateToolIdentity(id: string): void {
  if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(id)) {
    throw new Error(`Invalid affordance id: ${id}`);
  }
}

export function schemaToJsonSchema(schema: Schema): JsonSchema {
  return z.toJSONSchema(schema, { target: "draft-7" }) as JsonSchema;
}

export function defaultProjectionName(id: string): string {
  return id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export interface McpToolProjection {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: Record<string, unknown>;
}

export function toMcpTool(tool: AnyToolDefinition): McpToolProjection {
  return {
    name: tool.projections?.mcp?.name ?? defaultProjectionName(tool.id),
    title: tool.projections?.mcp?.title ?? tool.title,
    description: tool.projections?.mcp?.description ?? tool.description,
    inputSchema: schemaToJsonSchema(tool.input),
    annotations: {
      ...(tool.execution?.sideEffects === "none" ||
      tool.execution?.sideEffects === "read"
        ? { readOnlyHint: true }
        : {}),
      ...(tool.execution?.sideEffects === "write" ||
      tool.execution?.sideEffects === "external"
        ? { destructiveHint: tool.execution.sideEffects === "write" }
        : {}),
      ...(tool.execution?.idempotent !== undefined
        ? { idempotentHint: tool.execution.idempotent }
        : {}),
    },
  };
}

export function toMcpTools(tools: AnyToolDefinition[]): McpToolProjection[] {
  return tools.map((tool) => toMcpTool(tool));
}

export interface PiToolProjection {
  name: string;
  label: string;
  description: string;
  parameters: JsonSchema;
}

export function toPiToolDefinition(tool: AnyToolDefinition): PiToolProjection {
  return {
    name: tool.projections?.pi?.name ?? defaultProjectionName(tool.id),
    label: tool.projections?.pi?.label ?? tool.title,
    description: tool.projections?.pi?.description ?? tool.description,
    parameters: schemaToJsonSchema(tool.input),
  };
}

export function toPiToolDefinitions(
  tools: AnyToolDefinition[],
): PiToolProjection[] {
  return tools.map((tool) => toPiToolDefinition(tool));
}

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

export interface OpenApiOperationProjection {
  path: string;
  method: HttpMethod;
  operation: {
    operationId: string;
    summary: string;
    description: string;
    tags?: string[];
    requestBody?: unknown;
    responses: Record<string, unknown>;
  };
}

export function httpMethodFor(tool: AnyToolDefinition): HttpMethod {
  return tool.projections?.openapi?.method ?? "post";
}

export function httpPathFor(tool: AnyToolDefinition): string {
  return (
    tool.projections?.openapi?.path ??
    `/${defaultProjectionName(tool.id).replace(/_/g, "/")}`
  );
}

export function toOpenApiOperation(
  tool: AnyToolDefinition,
): OpenApiOperationProjection {
  const method = httpMethodFor(tool);
  const path = httpPathFor(tool);
  return {
    path,
    method,
    operation: {
      operationId:
        tool.projections?.openapi?.operationId ??
        defaultProjectionName(tool.id),
      summary: tool.title,
      description: tool.description,
      ...(tool.projections?.openapi?.tags
        ? { tags: tool.projections.openapi.tags }
        : {}),
      requestBody:
        method === "get"
          ? undefined
          : {
              required: true,
              content: {
                "application/json": { schema: schemaToJsonSchema(tool.input) },
              },
            },
      responses: {
        "200": {
          description: "Successful response",
          content: {
            "application/json": { schema: schemaToJsonSchema(tool.output) },
          },
        },
      },
    },
  };
}

export interface OpenApiDocumentInfo {
  title: string;
  version: string;
  description?: string;
}

export function toOpenApiPaths(
  tools: AnyToolDefinition[],
): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const tool of tools) {
    const projected = toOpenApiOperation(tool);
    paths[projected.path] = {
      ...(paths[projected.path] ?? {}),
      [projected.method]: projected.operation,
    };
  }
  return paths;
}

export function toOpenApiDocument(
  tools: AnyToolDefinition[],
  info: OpenApiDocumentInfo,
): {
  openapi: "3.1.0";
  info: OpenApiDocumentInfo;
  paths: Record<string, Record<string, unknown>>;
} {
  return { openapi: "3.1.0", info, paths: toOpenApiPaths(tools) };
}

export interface SdkOperationProjection {
  id: string;
  name: string;
  title: string;
  description: string;
  method: HttpMethod;
  path: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  sideEffects?: ToolExecutionDeclaration["sideEffects"];
  idempotent?: boolean;
}

export function toSdkOperation(
  tool: AnyToolDefinition,
): SdkOperationProjection {
  return {
    id: tool.id,
    name:
      tool.projections?.sdk?.name ??
      tool.projections?.openapi?.operationId ??
      defaultProjectionName(tool.id),
    title: tool.title,
    description: tool.description,
    method: httpMethodFor(tool),
    path: httpPathFor(tool),
    inputSchema: schemaToJsonSchema(tool.input),
    outputSchema: schemaToJsonSchema(tool.output),
    ...(tool.execution?.sideEffects !== undefined
      ? { sideEffects: tool.execution.sideEffects }
      : {}),
    ...(tool.execution?.idempotent !== undefined
      ? { idempotent: tool.execution.idempotent }
      : {}),
  };
}

export function toSdkOperations(
  tools: AnyToolDefinition[],
): SdkOperationProjection[] {
  return tools.map((tool) => toSdkOperation(tool));
}

export interface SdkManifestInfo {
  name: string;
  version: string;
}

export interface SdkManifest {
  info: SdkManifestInfo;
  operations: SdkOperationProjection[];
}

export function toSdkManifest(
  tools: AnyToolDefinition[],
  info: SdkManifestInfo,
): SdkManifest {
  return { info, operations: toSdkOperations(tools) };
}

export interface CliCommandProjection {
  id: string;
  name: string;
  title: string;
  description: string;
  usage?: string;
  group?: string;
  examples?: string[];
  hidden?: boolean;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export function toCliCommand(tool: AnyToolDefinition): CliCommandProjection {
  return {
    id: tool.id,
    name:
      tool.projections?.cli?.name ??
      tool.projections?.sdk?.name ??
      defaultProjectionName(tool.id),
    title: tool.projections?.cli?.title ?? tool.title,
    description: tool.projections?.cli?.description ?? tool.description,
    ...(tool.projections?.cli?.usage !== undefined
      ? { usage: tool.projections.cli.usage }
      : {}),
    ...(tool.projections?.cli?.group !== undefined
      ? { group: tool.projections.cli.group }
      : {}),
    ...(tool.projections?.cli?.examples !== undefined
      ? { examples: tool.projections.cli.examples }
      : {}),
    ...(tool.projections?.cli?.hidden !== undefined
      ? { hidden: tool.projections.cli.hidden }
      : {}),
    inputSchema: schemaToJsonSchema(tool.input),
    outputSchema: schemaToJsonSchema(tool.output),
  };
}

export function toCliCommands(
  tools: AnyToolDefinition[],
): CliCommandProjection[] {
  return tools.map((tool) => toCliCommand(tool));
}

export function toMarkdown(tool: AnyToolDefinition): string {
  const lines = [
    `# ${tool.title}`,
    "",
    tool.description,
    "",
    `- id: \`${tool.id}\``,
    `- version: \`${tool.version}\``,
  ];
  if (tool.permissions?.requires?.length)
    lines.push(
      `- permissions: ${tool.permissions.requires.map((p) => `\`${p}\``).join(", ")}`,
    );
  if (tool.runtime?.env?.length)
    lines.push(
      `- env: ${tool.runtime.env.map((name) => `\`${name}\``).join(", ")}`,
    );
  lines.push(
    "",
    "## Input schema",
    "",
    "```json",
    JSON.stringify(schemaToJsonSchema(tool.input), null, 2),
    "```",
    "",
    "## Output schema",
    "",
    "```json",
    JSON.stringify(schemaToJsonSchema(tool.output), null, 2),
    "```",
  );
  return `${lines.join("\n")}\n`;
}

export function toMarkdownDocument(tools: AnyToolDefinition[]): string {
  return tools.map((tool) => toMarkdown(tool)).join("\n");
}
