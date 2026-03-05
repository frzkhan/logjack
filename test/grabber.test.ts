import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("grabber", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("filters by level, service and pattern", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "logjack-grabber-"));
    process.env.LOGSNAP_DIR = temp;
    const { RollingBuffer } = await import("../src/core/buffer.js");
    const { grabEntries } = await import("../src/core/grabber.js");

    const payments = new RollingBuffer("payments");
    const auth = new RollingBuffer("auth");
    await payments.write({ ts: 1000, service: "payments", level: "info", line: "boot complete" });
    await payments.write({
      ts: 1500,
      service: "payments",
      level: "error",
      line: "idempotency key collision"
    });
    await auth.write({ ts: 1700, service: "auth", level: "warn", line: "token expiring" });

    const result = await grabEntries(
      {
        lastSeconds: 5,
        services: ["payments", "auth"],
        level: "warn",
        pattern: "idempotency"
      },
      5000
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.service).toBe("payments");
    expect(result.entries[0]?.level).toBe("error");
  });
});
