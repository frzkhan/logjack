import fsp from "node:fs/promises";
import path from "node:path";
import { BUFFERS_DIR, DEFAULT_LAST_SECONDS, LEVEL_PRIORITY } from "./constants.js";
import { RollingBuffer } from "./buffer.js";
import type { LogEntry, LogLevel } from "./types.js";

export interface GrabOptions {
  lastSeconds?: number;
  fromMs?: number;
  toMs?: number;
  services?: string[];
  level?: Exclude<LogLevel, "unknown">;
  pattern?: string;
}

export interface GrabResult {
  entries: LogEntry[];
  serviceCount: number;
  windowSeconds: number;
}

function buildMatcher(pattern?: string): ((line: string) => boolean) | undefined {
  if (!pattern) {
    return undefined;
  }
  // /foo/i style regex support.
  if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
    const lastSlash = pattern.lastIndexOf("/");
    const body = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    try {
      const re = new RegExp(body, flags);
      return (line) => re.test(line);
    } catch {
      // If invalid regex, fallback to substring match.
    }
  }
  return (line) => line.includes(pattern);
}

function shouldIncludeLevel(entryLevel: LogLevel, threshold?: Exclude<LogLevel, "unknown">): boolean {
  if (!threshold) {
    return true;
  }
  return LEVEL_PRIORITY[entryLevel] >= LEVEL_PRIORITY[threshold];
}

async function discoverServices(): Promise<string[]> {
  try {
    const names = await fsp.readdir(BUFFERS_DIR);
    const services = new Set<string>();
    for (const file of names) {
      const match = file.match(/^(.+?)(?:\.1)?\.ndjson$/);
      if (match) {
        services.add(match[1]);
      }
    }
    return [...services];
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function grabEntries(options: GrabOptions, now = Date.now()): Promise<GrabResult> {
  const toMs = options.toMs ?? now;
  const fromMs = options.fromMs ?? (toMs - (options.lastSeconds ?? DEFAULT_LAST_SECONDS) * 1000);
  const matcher = buildMatcher(options.pattern);
  const selectedServices = options.services?.length ? options.services : await discoverServices();

  const allEntries: LogEntry[] = [];
  for (const service of selectedServices) {
    const buffer = new RollingBuffer(service);
    const entries = await buffer.read(fromMs, toMs);
    for (const entry of entries) {
      if (!shouldIncludeLevel(entry.level, options.level)) {
        continue;
      }
      if (matcher && !matcher(entry.line)) {
        continue;
      }
      allEntries.push(entry);
    }
  }

  allEntries.sort((a, b) => a.ts - b.ts);
  return {
    entries: allEntries,
    serviceCount: new Set(allEntries.map((entry) => entry.service)).size,
    windowSeconds: Math.round((toMs - fromMs) / 1000)
  };
}

export function formatPretty(result: GrabResult): string {
  const icons: Record<LogLevel, string> = {
    error: "✖",
    warn: "⚠",
    info: "ℹ",
    debug: "·",
    unknown: " "
  };

  const lines = result.entries.map((entry) => {
    const date = new Date(entry.ts);
    const ts = date.toISOString().split("T")[1]?.replace("Z", "") ?? "";
    const service = entry.service.padEnd(15, " ");
    return `[${ts}] [${service}] ${icons[entry.level]} ${entry.line}`;
  });

  lines.push("");
  lines.push(
    `— ${result.entries.length} entries from ${result.serviceCount} service(s) | window: last ${result.windowSeconds}s`
  );
  return lines.join("\n");
}

export function formatNdjson(result: GrabResult): string {
  return result.entries.map((entry) => JSON.stringify(entry)).join("\n");
}

export function formatJson(result: GrabResult): string {
  return JSON.stringify(result, null, 2);
}

export function bufferPathForService(service: string): string {
  return path.join(BUFFERS_DIR, `${service}.ndjson`);
}
