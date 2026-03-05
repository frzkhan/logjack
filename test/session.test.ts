import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("session", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("saves, loads, and reports running status", async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "logjack-session-"));
    process.env.LOGSNAP_DIR = temp;
    const { saveSession, loadSession, getSessionStatus, clearSession } = await import(
      "../src/core/session.js"
    );

    await saveSession({
      pid: process.pid,
      startedAt: 1000,
      sources: [{ name: "svc", filePath: "/tmp/svc.log" }]
    });
    const loaded = await loadSession();
    expect(loaded?.pid).toBe(process.pid);

    const status = await getSessionStatus(3000);
    expect(status.running).toBe(true);
    expect(status.uptimeMs).toBe(2000);
    expect(status.sources).toHaveLength(1);

    await clearSession();
    expect(await loadSession()).toBeNull();
  });
});
