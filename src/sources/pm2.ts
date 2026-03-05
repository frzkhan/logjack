import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Source } from "../core/types.js";

const execFileAsync = promisify(execFile);

interface Pm2Proc {
  name?: string;
  pm2_env?: {
    pm_out_log_path?: string;
    pm_err_log_path?: string;
  };
}

export async function discoverPm2Sources(): Promise<Source[]> {
  let stdout = "";
  try {
    const out = await execFileAsync("pm2", ["jlist"]);
    stdout = out.stdout;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error when executing pm2 jlist";
    throw new Error(`Could not run pm2 jlist: ${message}`);
  }

  let processes: Pm2Proc[];
  try {
    processes = JSON.parse(stdout) as Pm2Proc[];
  } catch {
    throw new Error("pm2 jlist returned invalid JSON output.");
  }

  const sources: Source[] = [];
  for (const proc of processes) {
    const name = proc.name?.trim();
    if (!name) {
      continue;
    }
    const outPath = proc.pm2_env?.pm_out_log_path?.trim();
    const errPath = proc.pm2_env?.pm_err_log_path?.trim();
    if (outPath) {
      sources.push({ name, filePath: outPath });
    }
    if (errPath && errPath !== outPath) {
      sources.push({ name: `${name}-err`, filePath: errPath });
    }
  }

  if (sources.length === 0) {
    throw new Error("No PM2 log files discovered. Is PM2 running processes?");
  }

  return sources;
}
