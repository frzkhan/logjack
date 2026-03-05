import { describe, expect, test } from "vitest";
import { detectLevelFromText, parseLine } from "../src/core/parser.js";

describe("parser", () => {
  test("detects plain text levels", () => {
    expect(detectLevelFromText("ERROR could not connect")).toBe("error");
    expect(detectLevelFromText("warning: retries exceeded")).toBe("warn");
    expect(detectLevelFromText("info startup done")).toBe("info");
    expect(detectLevelFromText("debug payload")).toBe("debug");
    expect(detectLevelFromText("all good")).toBe("unknown");
  });

  test("parses JSON structured logs", () => {
    const entry = parseLine('{"level":"warn","message":"hello","id":1}', "payments", 123);
    expect(entry.service).toBe("payments");
    expect(entry.ts).toBe(123);
    expect(entry.level).toBe("warn");
    expect(entry.line).toBe("hello");
    expect(entry.parsed).toEqual({ level: "warn", message: "hello", id: 1 });
  });

  test("falls back to plain text for invalid JSON", () => {
    const entry = parseLine("{oops", "auth", 456);
    expect(entry.level).toBe("unknown");
    expect(entry.line).toBe("{oops");
  });
});
