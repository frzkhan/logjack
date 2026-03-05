export type LogLevel = "error" | "warn" | "info" | "debug" | "unknown";

export interface LogEntry {
  ts: number;
  service: string;
  level: LogLevel;
  line: string;
  parsed?: Record<string, unknown>;
}

export interface Source {
  name: string;
  filePath: string;
}

export interface SessionState {
  pid: number;
  startedAt: number;
  sources: Source[];
}

export interface SessionStatus {
  running: boolean;
  pid?: number;
  uptimeMs?: number;
  startedAt?: number;
  sources: Source[];
}
