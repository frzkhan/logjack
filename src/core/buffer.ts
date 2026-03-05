import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { BUFFERS_DIR, DEFAULT_BUFFER_MAX_BYTES } from "./constants.js";
import type { LogEntry } from "./types.js";

async function ensureDir() {
  await fsp.mkdir(BUFFERS_DIR, { recursive: true });
}

async function readNdjson(filePath: string): Promise<LogEntry[]> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    return lines
      .map((line) => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is LogEntry => entry !== null);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export class RollingBuffer {
  private readonly currentPath: string;
  private readonly rotatedPath: string;
  private readonly maxBytes: number;

  constructor(
    private readonly service: string,
    maxBytes: number = DEFAULT_BUFFER_MAX_BYTES
  ) {
    this.currentPath = path.join(BUFFERS_DIR, `${service}.ndjson`);
    this.rotatedPath = path.join(BUFFERS_DIR, `${service}.1.ndjson`);
    this.maxBytes = maxBytes;
  }

  async write(entry: LogEntry): Promise<void> {
    await ensureDir();
    await this.rotateIfNeeded();
    const line = `${JSON.stringify(entry)}\n`;
    await fsp.appendFile(this.currentPath, line, "utf8");
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fsp.stat(this.currentPath);
      if (stat.size < this.maxBytes) {
        return;
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return;
      }
      throw error;
    }

    try {
      await fsp.rm(this.rotatedPath, { force: true });
      await fsp.rename(this.currentPath, this.rotatedPath);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw error;
      }
    }
  }

  async read(fromMs: number, toMs: number): Promise<LogEntry[]> {
    await ensureDir();
    const [older, current] = await Promise.all([
      readNdjson(this.rotatedPath),
      readNdjson(this.currentPath)
    ]);

    return [...older, ...current]
      .filter((entry) => entry.ts >= fromMs && entry.ts <= toMs)
      .sort((a, b) => a.ts - b.ts);
  }

  close(): void {
    // No persistent stream is kept open in this implementation.
    void fs;
  }
}
