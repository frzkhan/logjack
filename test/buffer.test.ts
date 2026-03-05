import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("rolling buffer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("writes and reads entries in time window", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "logjack-buffer-"));
    process.env.LOGSNAP_DIR = temp;
    const { RollingBuffer } = await import("../src/core/buffer.js");

    const buf = new RollingBuffer("payments", 1024 * 1024);
    await buf.write({ ts: 1000, service: "payments", level: "info", line: "a" });
    await buf.write({ ts: 2000, service: "payments", level: "error", line: "b" });

    const entries = await buf.read(1500, 3000);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.line).toBe("b");
  });

  test("rotates files when max size exceeded", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "logjack-buffer-"));
    process.env.LOGSNAP_DIR = temp;
    const { RollingBuffer } = await import("../src/core/buffer.js");
    const { BUFFERS_DIR } = await import("../src/core/constants.js");

    const buf = new RollingBuffer("svc", 80);
    await buf.write({ ts: 1000, service: "svc", level: "info", line: "first line long enough" });
    await buf.write({ ts: 2000, service: "svc", level: "info", line: "second line long enough" });
    await buf.write({ ts: 3000, service: "svc", level: "info", line: "third line long enough" });

    const files = await fs.readdir(BUFFERS_DIR);
    expect(files.some((name) => name === "svc.1.ndjson")).toBe(true);
    expect(files.some((name) => name === "svc.ndjson")).toBe(true);
  });
});
