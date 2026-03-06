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
  from?: string;
  to?: string;
  service?: string[];
  level?: Exclude<LogLevel, "unknown">;
  pattern?: string;
  format?: GrabFormat;
  out?: string;
}

export function parseTimeArg(value: string): number {
  // Time-only: HH:MM or HH:MM:SS — use today's date
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
    const today = new Date().toISOString().slice(0, 10);
    const ms = Date.parse(`${today}T${value}`);
    if (!Number.isNaN(ms)) return ms;
  }
  // ISO 8601 with space separator: 2024-01-01 10:00:00
  const normalized = value.replace(" ", "T");
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid time "${value}". Use HH:MM, HH:MM:SS, or YYYY-MM-DDTHH:MM:SS`);
  }
  return ms;
}

export async function grabCommand(options: GrabOptions): Promise<void> {
  const format: GrabFormat = options.format ?? "pretty";

  const fromMs = options.from ? parseTimeArg(options.from) : undefined;
  const toMs = options.to ? parseTimeArg(options.to) : undefined;
  const lastSeconds = (fromMs == null && toMs == null)
    ? Math.max(1, Math.min(MAX_GRAB_SECONDS, options.last ?? DEFAULT_LAST_SECONDS))
    : undefined;

  const result = await grabEntries({
    lastSeconds,
    fromMs,
    toMs,
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
