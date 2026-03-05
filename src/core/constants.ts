import os from "node:os";
import path from "node:path";

export const LOGSNAP_DIR = process.env.LOGSNAP_DIR ?? path.join(os.homedir(), ".logjack");
export const BUFFERS_DIR = path.join(LOGSNAP_DIR, "buffers");
export const SESSION_FILE = path.join(LOGSNAP_DIR, "session.json");
export const DEFAULT_LAST_SECONDS = 60;
export const MAX_GRAB_SECONDS = 3600;
export const DEFAULT_BUFFER_MAX_BYTES = 50 * 1024 * 1024;

export const LEVEL_PRIORITY: Record<string, number> = {
  unknown: -1,
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
