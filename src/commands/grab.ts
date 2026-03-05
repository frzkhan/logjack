import fsp from "node:fs/promises";
import {
  DEFAULT_LAST_SECONDS,
  MAX_GRAB_SECONDS
} from "../core/constants.js";
import { formatJson, formatNdjson, formatPretty, grabEntries } from "../core/grabber.js";
import type { LogLevel } from "../core/types.js";

type GrabFormat = "pretty" | "ndjson" | "json";

export interface GrabOptions {
  last?: number;
  service?: string[];
  level?: Exclude<LogLevel, "unknown">;
  pattern?: string;
  format?: GrabFormat;
  out?: string;
}

export async function grabCommand(options: GrabOptions): Promise<void> {
  const lastSeconds = Math.max(1, Math.min(MAX_GRAB_SECONDS, options.last ?? DEFAULT_LAST_SECONDS));
  const format: GrabFormat = options.format ?? "pretty";

  const result = await grabEntries({
    lastSeconds,
    services: options.service,
    level: options.level,
    pattern: options.pattern
  });

  let output: string;
  if (format === "json") {
    output = formatJson(result);
  } else if (format === "ndjson") {
    output = formatNdjson(result);
  } else {
    output = formatPretty(result);
  }

  if (options.out) {
    await fsp.writeFile(options.out, output + (format === "ndjson" ? "\n" : ""), "utf8");
    return;
  }
  process.stdout.write(output);
  if (format !== "ndjson") {
    process.stdout.write("\n");
  }
}
