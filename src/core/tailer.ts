import fs from "node:fs";
import fsp from "node:fs/promises";
import { parseLine } from "./parser.js";
import { RollingBuffer } from "./buffer.js";
import type { Source } from "./types.js";

interface SourceState {
  source: Source;
  offset: number;
  watcher?: fs.FSWatcher;
}

export class Tailer {
  private readonly buffers = new Map<string, RollingBuffer>();
  private readonly states: SourceState[];
  private interval?: NodeJS.Timeout;
  private running = false;
  private scanInFlight = false;

  constructor(private readonly sources: Source[]) {
    this.states = sources.map((source) => ({ source, offset: 0 }));
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    for (const state of this.states) {
      this.buffers.set(state.source.name, new RollingBuffer(state.source.name));
      try {
        const stat = await fsp.stat(state.source.filePath);
        state.offset = stat.size;
      } catch {
        state.offset = 0;
      }

      try {
        state.watcher = fs.watch(state.source.filePath, () => {
          void this.scanSource(state);
        });
      } catch {
        // fs.watch can fail on some filesystems; periodic scanning remains active.
      }
    }

    this.interval = setInterval(() => {
      void this.scanAll();
    }, 400);
  }

  private async scanAll(): Promise<void> {
    if (!this.running || this.scanInFlight) {
      return;
    }
    this.scanInFlight = true;
    try {
      await Promise.all(this.states.map((state) => this.scanSource(state)));
    } finally {
      this.scanInFlight = false;
    }
  }

  private async scanSource(state: SourceState): Promise<void> {
    if (!this.running) {
      return;
    }
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(state.source.filePath);
    } catch {
      return;
    }

    if (stat.size < state.offset) {
      // Source file was truncated or replaced.
      state.offset = 0;
    }

    if (stat.size === state.offset) {
      return;
    }

    const chunk = await this.readRange(state.source.filePath, state.offset, stat.size);
    state.offset = stat.size;
    if (!chunk) {
      return;
    }

    const lines = chunk.split(/\r?\n/).filter((line) => line.length > 0);
    const buffer = this.buffers.get(state.source.name);
    if (!buffer) {
      return;
    }

    for (const line of lines) {
      const entry = parseLine(line, state.source.name, Date.now());
      await buffer.write(entry);
    }
  }

  private async readRange(filePath: string, from: number, to: number): Promise<string> {
    const length = Math.max(0, to - from);
    if (length === 0) {
      return "";
    }
    const handle = await fsp.open(filePath, "r");
    try {
      const buf = Buffer.alloc(length);
      await handle.read(buf, 0, length, from);
      return buf.toString("utf8");
    } finally {
      await handle.close();
    }
  }

  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    for (const state of this.states) {
      state.watcher?.close();
    }
    for (const buffer of this.buffers.values()) {
      buffer.close();
    }
    this.buffers.clear();
  }
}
