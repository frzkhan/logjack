import type { LogEntry, LogLevel } from "./types.js";

const LEVEL_RE = /\b(error|err|warn|warning|info|debug)\b/i;

function normalizeLevel(input: unknown): LogLevel {
  if (typeof input !== "string") {
    return "unknown";
  }

  const value = input.toLowerCase();
  if (value.includes("error") || value === "err") {
    return "error";
  }
  if (value.includes("warn")) {
    return "warn";
  }
  if (value.includes("info")) {
    return "info";
  }
  if (value.includes("debug")) {
    return "debug";
  }
  return "unknown";
}

export function detectLevelFromText(line: string): LogLevel {
  const match = line.match(LEVEL_RE);
  if (!match) {
    return "unknown";
  }
  return normalizeLevel(match[1]);
}

export function parseLine(line: string, service: string, ts: number = Date.now()): LogEntry {
  const trimmed = line.trim();

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const level = normalizeLevel(parsed.level ?? parsed.severity ?? parsed.lvl);
      const msg = parsed.message ?? parsed.msg ?? parsed.text;
      return {
        ts,
        service,
        level,
        line: typeof msg === "string" ? msg : line,
        parsed
      };
    } catch {
      // Fall through to plain text parsing for malformed JSON lines.
    }
  }

  return {
    ts,
    service,
    level: detectLevelFromText(line),
    line
  };
}
