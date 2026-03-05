import { getSessionStatus } from "../core/session.js";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}h ${m}m ${s}s`;
}

export async function statusCommand(): Promise<void> {
  const status = await getSessionStatus();
  if (!status.running) {
    console.log("logjack is not running.");
    return;
  }

  console.log(`logjack is running (pid ${status.pid})`);
  if (typeof status.uptimeMs === "number") {
    console.log(`uptime: ${formatDuration(status.uptimeMs)}`);
  }
  console.log("sources:");
  for (const source of status.sources) {
    console.log(`- ${source.name}: ${source.filePath}`);
  }
}
