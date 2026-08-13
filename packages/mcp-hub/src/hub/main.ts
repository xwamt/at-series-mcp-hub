import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_SERVER_DISPLAY_NAME } from '../protocol/index';
import { toMcpToolDescriptors } from './annotations';
import { resolveHostAppFromEnv } from './hostApp';
import { createHubRuntime } from './server';

declare const __HUB_VERSION__: string;

async function main(): Promise<void> {
  const hostApp = resolveHostAppFromEnv(process.env);
  const hubVersion =
    typeof __HUB_VERSION__ === 'string' && __HUB_VERSION__.length > 0
      ? __HUB_VERSION__
      : '0.0.0-dev';

  let mcpServer: McpServer | undefined;

  const runtime = await createHubRuntime({
    hostApp,
    hubVersion,
    onToolsListChanged: () => {
      if (!mcpServer) {
        return;
      }
      try {
        // SDK McpServer.sendToolListChanged → notifications/tools/list_changed
        mcpServer.sendToolListChanged();
      } catch {
        // Client may not be connected yet; ignore.
      }
    }
  });

  mcpServer = new McpServer({
    name: MCP_SERVER_DISPLAY_NAME,
    version: hubVersion
  });

  mcpServer.server.registerCapabilities({
    tools: { listChanged: true }
  });

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toMcpToolDescriptors(await runtime.listToolsForMcp()) };
  });

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args =
      request.params.arguments && typeof request.params.arguments === 'object'
        ? (request.params.arguments as Record<string, unknown>)
        : {};
    return runtime.callTool(name, args);
  });

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  const shutdown = async (): Promise<void> => {
    await runtime.close();
    await mcpServer?.close();
  };

  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });
}

// Deliberately non-fatal: the Hub is a long-lived IDE child process, so one
// transient error must not make every AT Series tool disappear from the IDE.
// Genuinely fatal startup failures are still handled by main().catch below.
process.on('unhandledRejection', (reason) => {
  process.stderr.write(
    `[at-series-hub] error: unhandled rejection: ${String(reason)}\n`
  );
});

process.on('uncaughtException', (err) => {
  process.stderr.write(
    `[at-series-hub] error: uncaught exception: ${err.message}\n`
  );
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
