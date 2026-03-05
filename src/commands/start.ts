import { spawn } from "node:child_process";
import process from "node:process";
import { saveSession, getSessionStatus } from "../core/session.js";
import type { Source } from "../core/types.js";
import { parseTailSource } from "../sources/files.js";
import { discoverPm2Sources } from "../sources/pm2.js";

export interface StartOptions {
  pm2?: boolean;
  tail?: string[];
}

function uniqueSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const deduped: Source[] = [];
  for (const source of sources) {
    const key = `${source.name}::${source.filePath}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(source);
  }
  return deduped;
}

export async function startCommand(options: StartOptions): Promise<void> {
  const status = await getSessionStatus();
  if (status.running) {
    throw new Error(`logjack is already running (pid ${status.pid}).`);
  }

  const sources: Source[] = [];
  if (options.pm2) {
    const pm2Sources = await discoverPm2Sources();
    sources.push(...pm2Sources);
  }
  for (const item of options.tail ?? []) {
    sources.push(parseTailSource(item));
  }

  const resolved = uniqueSources(sources);
  if (resolved.length === 0) {
    throw new Error("No sources provided. Use --pm2 and/or --tail name:/path/to/file.log.");
  }

  // Spawn a detached worker using the same CLI entry file that was used to start this process.
  const cliPath = process.argv[1];
  const child = spawn(process.execPath, [cliPath, "worker", "--sources", JSON.stringify(resolved)], {
    detached: true,
    stdio: "ignore",
    env: process.env
  });
  child.unref();

  if (!child.pid) {
    throw new Error("Failed to start logjack worker process.");
  }

  await saveSession({
    pid: child.pid,
    startedAt: Date.now(),
    sources: resolved
  });

  console.log(`Started logjack (pid ${child.pid}) with ${resolved.length} source(s).`);
}
