import { clearSession, loadSession, isPidAlive } from "../core/session.js";

export async function stopCommand(): Promise<void> {
  const session = await loadSession();
  if (!session) {
    console.log("logjack is not running.");
    return;
  }

  if (isPidAlive(session.pid)) {
    process.kill(session.pid, "SIGTERM");
    console.log(`Stopped logjack worker (pid ${session.pid}).`);
  } else {
    console.log("logjack session found but worker is not running.");
  }

  await clearSession();
}
