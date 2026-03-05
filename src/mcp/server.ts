import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DEFAULT_LAST_SECONDS, MAX_GRAB_SECONDS } from "../core/constants.js";
import { grabEntries } from "../core/grabber.js";
import { getSessionStatus } from "../core/session.js";

const grabInputShape = {
  lastSeconds: z
    .number()
    .int()
    .min(1)
    .max(MAX_GRAB_SECONDS)
    .default(DEFAULT_LAST_SECONDS),
  services: z.array(z.string()).optional(),
  level: z.enum(["error", "warn", "info", "debug"]).optional(),
  pattern: z.string().optional(),
  format: z.enum(["pretty", "ndjson", "json"]).default("json")
};

const grabInputSchema = z.object(grabInputShape);

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "logjack-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "logjack_grab",
    {
      title: "Grab logs",
      description: "Grab a time-windowed logs snapshot from local buffers.",
      inputSchema: grabInputShape,
      annotations: {
        readOnlyHint: true
      }
    },
    async (input) => {
      const parsed = grabInputSchema.parse(input);
      const result = await grabEntries({
        lastSeconds: parsed.lastSeconds,
        services: parsed.services,
        level: parsed.level,
        pattern: parsed.pattern
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result)
          }
        ],
        structuredContent: result as unknown as Record<string, unknown>
      };
    }
  );

  server.registerTool(
    "logjack_status",
    {
      title: "Logjack status",
      description: "Check if logjack is running and list watched services.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true
      }
    },
    async () => {
      const status = await getSessionStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status)
          }
        ],
        structuredContent: status as unknown as Record<string, unknown>
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startMcpServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
