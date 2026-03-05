import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { grabCommand } from "./commands/grab.js";
import { statusCommand } from "./commands/status.js";
import { stopCommand } from "./commands/stop.js";
import { Tailer } from "./core/tailer.js";
import type { Source } from "./core/types.js";

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number "${value}"`);
  }
  return parsed;
}

const program = new Command();
program.name("logjack").description("A flight recorder for local logs.").version("0.1.0");

program
  .command("start")
  .description("Begin tailing log sources")
  .option("--pm2", "Auto-discover PM2 sources")
  .option("--tail <name:path>", "Tail a specific file source", (value, prev: string[]) => {
    prev.push(value);
    return prev;
  }, [])
  .action(async (opts) => {
    await startCommand(opts);
  });

program
  .command("grab")
  .description("Grab a time-windowed snapshot of logs")
  .option("--last <seconds>", "Window in seconds", parseIntOption)
  .option("--service <name>", "Filter to service", (value, prev: string[]) => {
    prev.push(value);
    return prev;
  }, [])
  .option("--level <level>", "Minimum level: error|warn|info|debug")
  .option("--pattern <pattern>", "Substring or /regex/flags pattern")
  .option("--format <format>", "pretty|ndjson|json", "pretty")
  .option("--out <file>", "Write output to file")
  .action(async (opts) => {
    await grabCommand(opts);
  });

program.command("status").description("Show running status").action(statusCommand);
program.command("stop").description("Stop tailing worker").action(stopCommand);

program
  .command("worker")
  .description("Internal detached worker process")
  .requiredOption("--sources <json>", "Serialized source list")
  .action(async (opts: { sources: string }) => {
    const sources = JSON.parse(opts.sources) as Source[];
    const tailer = new Tailer(sources);
    await tailer.start();

    const shutdown = () => {
      tailer.stop();
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Keep process alive; tailing is event/timer driven.
    await new Promise<void>(() => undefined);
  });

program
  .command("mcp")
  .description("Start the MCP server over stdio")
  .action(async () => {
    const { startMcpServer } = await import("./mcp/server.js");
    await startMcpServer();
  });

void program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
