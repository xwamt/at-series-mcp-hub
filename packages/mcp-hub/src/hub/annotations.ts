import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import {
  normalizeToolRisk,
  type JsonSchemaObject,
  type ToolCatalogEntry
} from '../protocol/index';

/** Shape the Hub puts on the wire for one MCP `tools/list` entry. */
export type McpToolDescriptor = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchemaObject;
  annotations: ToolAnnotations;
};

/**
 * Map a Bridge-declared risk onto MCP tool annotations.
 *
 * The input is `unknown` because `risk` crosses the Bridge wire without
 * runtime validation: `normalizeToolRisk` folds a missing or invalid value to
 * `exec` (protocol v1 §6), which surfaces here as `destructiveHint: true`.
 *
 * `idempotentHint` is deliberately absent — risk says nothing about whether a
 * repeated call has further effect, and MCP reads a missing hint as unknown.
 */
export function toolAnnotationsForRisk(risk: unknown): ToolAnnotations {
  const normalized = normalizeToolRisk(risk);
  return {
    readOnlyHint: normalized === 'read',
    destructiveHint: normalized === 'exec',
    // Every AT Series tool acts on a remote system outside the Hub process.
    openWorldHint: true
  };
}

/**
 * Annotations are advisory metadata only: they never gate routing, and the set
 * of tools handed in here is still decided solely by progressive exposure.
 */
export function toMcpToolDescriptors(
  tools: readonly ToolCatalogEntry[]
): McpToolDescriptor[] {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: toolAnnotationsForRisk(tool.risk)
  }));
}
