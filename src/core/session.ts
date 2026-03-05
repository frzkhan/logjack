import fsp from "node:fs/promises";
import { LOGSNAP_DIR, SESSION_FILE } from "./constants.js";
import type { SessionState, SessionStatus } from "./types.js";

async function ensureSessionDir() {
  await fsp.mkdir(LOGSNAP_DIR, { recursive: true });
}

export async function saveSession(session: SessionState): Promise<void> {
  await ensureSessionDir();
  await fsp.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf8");
}

export async function loadSession(): Promise<SessionState | null> {
  try {
    const raw = await fsp.readFile(SESSION_FILE, "utf8");
    return JSON.parse(raw) as SessionState;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function clearSession(): Promise<void> {
  await fsp.rm(SESSION_FILE, { force: true });
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function getSessionStatus(now: number = Date.now()): Promise<SessionStatus> {
  const session = await loadSession();
  if (!session) {
    return { running: false, sources: [] };
  }

  const running = isPidAlive(session.pid);
  return {
    running,
    pid: session.pid,
    startedAt: session.startedAt,
    uptimeMs: running ? Math.max(0, now - session.startedAt) : undefined,
    sources: session.sources
  };
}
