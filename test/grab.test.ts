import { describe, expect, test, vi, beforeEach } from "vitest";
import { parseTimeArg } from "../src/commands/grab.js";
import { grabEntries } from "../src/core/grabber.js";
import { DEFAULT_LAST_SECONDS } from "../src/core/constants.js";

// --- parseTimeArg ---

describe("parseTimeArg", () => {
  test("parses HH:MM time-only as today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(parseTimeArg("01:00")).toBe(Date.parse(`${today}T01:00`));
    expect(parseTimeArg("14:30")).toBe(Date.parse(`${today}T14:30`));
  });

  test("parses HH:MM:SS time-only as today's date", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(parseTimeArg("09:05:30")).toBe(Date.parse(`${today}T09:05:30`));
  });

  test("parses ISO 8601 datetime string", () => {
    expect(parseTimeArg("2024-06-15T10:30:00")).toBe(Date.parse("2024-06-15T10:30:00"));
  });

  test("parses datetime with space separator", () => {
    expect(parseTimeArg("2024-06-15 10:30:00")).toBe(Date.parse("2024-06-15T10:30:00"));
  });

  test("parses date-only string", () => {
    expect(parseTimeArg("2024-06-15")).toBe(Date.parse("2024-06-15"));
  });

  test("throws on invalid input", () => {
    expect(() => parseTimeArg("notadate")).toThrow(/Invalid time/);
    expect(() => parseTimeArg("25:99")).toThrow(/Invalid time/);
  });
});

// --- grabEntries time window ---

vi.mock("../src/core/buffer.js", () => {
  const mockRead = vi.fn().mockResolvedValue([]);
  const RollingBuffer = vi.fn().mockImplementation(() => ({ read: mockRead }));
  return { RollingBuffer };
});

import { RollingBuffer } from "../src/core/buffer.js";

function getMockRead() {
  const instance = vi.mocked(RollingBuffer).mock.results[vi.mocked(RollingBuffer).mock.results.length - 1]?.value as { read: ReturnType<typeof vi.fn> };
  return instance.read as ReturnType<typeof vi.fn>;
}

describe("grabEntries time window", () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.mocked(RollingBuffer).mockClear();
  });

  test("uses fromMs and toMs directly when provided", async () => {
    const fromMs = NOW - 3600_000;
    const toMs = NOW - 1800_000;
    const result = await grabEntries({ fromMs, toMs, services: ["svc"] }, NOW);
    const read = getMockRead();
    expect(read).toHaveBeenCalledWith(fromMs, toMs);
    expect(result.windowSeconds).toBe(1800);
  });

  test("uses only fromMs with now as toMs", async () => {
    const fromMs = NOW - 5000_000;
    const result = await grabEntries({ fromMs, services: ["svc"] }, NOW);
    const read = getMockRead();
    expect(read).toHaveBeenCalledWith(fromMs, NOW);
    expect(result.windowSeconds).toBe(5000);
  });

  test("uses lastSeconds to compute fromMs when no explicit range", async () => {
    const result = await grabEntries({ lastSeconds: 60, services: ["svc"] }, NOW);
    const read = getMockRead();
    expect(read).toHaveBeenCalledWith(NOW - 60_000, NOW);
    expect(result.windowSeconds).toBe(60);
  });

  test("defaults to DEFAULT_LAST_SECONDS when no options given", async () => {
    const result = await grabEntries({ services: ["svc"] }, NOW);
    const read = getMockRead();
    expect(read).toHaveBeenCalledWith(NOW - DEFAULT_LAST_SECONDS * 1000, NOW);
    expect(result.windowSeconds).toBe(DEFAULT_LAST_SECONDS);
  });

  test("filters entries by level threshold", async () => {
    const entries = [
      { ts: NOW - 100, service: "svc", level: "debug" as const, line: "debug msg" },
      { ts: NOW - 200, service: "svc", level: "info" as const, line: "info msg" },
      { ts: NOW - 300, service: "svc", level: "error" as const, line: "error msg" }
    ];
    vi.mocked(RollingBuffer).mockImplementationOnce(() => ({
      read: vi.fn().mockResolvedValue(entries)
    }) as unknown as RollingBuffer);
    const result = await grabEntries({ lastSeconds: 60, services: ["svc"], level: "warn" }, NOW);
    expect(result.entries.map((e) => e.level)).toEqual(["error"]);
  });

  test("filters entries by pattern", async () => {
    const entries = [
      { ts: NOW - 100, service: "svc", level: "info" as const, line: "connected to db" },
      { ts: NOW - 200, service: "svc", level: "info" as const, line: "server started" }
    ];
    vi.mocked(RollingBuffer).mockImplementationOnce(() => ({
      read: vi.fn().mockResolvedValue(entries)
    }) as unknown as RollingBuffer);
    const result = await grabEntries({ lastSeconds: 60, services: ["svc"], pattern: "db" }, NOW);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].line).toBe("connected to db");
  });
});
