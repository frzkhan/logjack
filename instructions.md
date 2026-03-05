Build a TypeScript CLI tool called logsnap — a flight recorder for local dev environments. It captures a rolling window of logs across multiple processes and lets you reach back in time to grab what happened.
Tech stack

TypeScript with strict mode
tsup for bundling (ESM output, no CJS needed)
commander for CLI interface
zod for MCP input validation
@modelcontextprotocol/sdk for MCP server

Core concept
logsnap does NOT manage processes. It reads logs from existing sources — primarily pm2 log files — tails them into a rolling on-disk buffer (NDJSON), and lets you extract time-windowed snapshots. Think of it as git stash but for logs.

Project structure
logsnap/
├── src/
│   ├── cli.ts               # Commander entry point, all commands wired here
│   ├── commands/
│   │   ├── start.ts         # logsnap start — begin tailing log sources
│   │   ├── grab.ts          # logsnap grab — extract time window
│   │   ├── status.ts        # logsnap status — show what's being watched
│   │   └── stop.ts          # logsnap stop — stop tailing
│   ├── core/
│   │   ├── types.ts         # All shared TypeScript interfaces
│   │   ├── constants.ts     # Paths, defaults (LOGSNAP_DIR = ~/.logsnap)
│   │   ├── parser.ts        # Line → LogEntry, JSON log detection, level detection
│   │   ├── buffer.ts        # RollingBuffer class — writes NDJSON to disk, rotates at 50MB
│   │   ├── tailer.ts        # Tails log files using fs.watch + readline, feeds buffer
│   │   ├── grabber.ts       # Reads buffers, filters by time/level/pattern, merges & sorts
│   │   └── session.ts       # Persists session state to ~/.logsnap/session.json
│   ├── sources/
│   │   ├── pm2.ts           # Auto-discovers pm2 processes via `pm2 jlist`, returns log file paths
│   │   └── files.ts         # Generic log file source (--tail name:/path/to/file.log)
│   └── mcp/
│       └── server.ts        # MCP server exposing grab + status as tools
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md

Data model
typescriptinterface LogEntry {
  ts: number;          // Unix ms timestamp
  service: string;     // Source name (e.g. "payments", "auth")
  level: LogLevel;     // "error" | "warn" | "info" | "debug" | "unknown"
  line: string;        // Raw log line
  parsed?: Record<string, unknown>;  // Parsed JSON if structured log
}
Entries are written to disk as NDJSON files in ~/.logsnap/buffers/<service>.ndjson. When a file hits 50MB it rotates to <service>.1.ndjson. A grab reads both files and filters by timestamp.

CLI interface
bash# Auto-discover all running pm2 processes and start tailing their log files
logsnap start --pm2

# Tail specific log files (can be combined with --pm2)
logsnap start --tail "payments:/home/user/.pm2/logs/payments-out.log"
logsnap start --tail "auth:/var/log/auth.log"

# Grab last 60 seconds (default) across all services
logsnap grab

# Grab with options
logsnap grab --last 90         # last 90 seconds
logsnap grab --service payments --service auth   # filter to specific services
logsnap grab --level error     # only errors and above
logsnap grab --pattern "idempotency"             # lines matching string or regex
logsnap grab --format ndjson   # output as NDJSON instead of pretty
logsnap grab --format json     # output as JSON array
logsnap grab --out ./debug.log # write to file instead of stdout

# Status and control
logsnap status
logsnap stop

start command — pm2 integration
The --pm2 flag should:

Run pm2 jlist as a child process and parse the JSON output
Extract each process's name, pm2_env.pm_out_log_path, and pm2_env.pm_err_log_path
Start tailing those files exactly like a --tail source
If pm2 is not installed or not running, print a clear error and exit

The sources/pm2.ts module should export:
typescriptasync function discoverPm2Sources(): Promise<Array<{ name: string; filePath: string }>>
```

---

### `grab` command — the core primitive

`grab` should:
1. Scan `~/.logsnap/buffers/` for all `*.ndjson` files
2. For each file, read all entries where `ts >= (now - lastSeconds * 1000)`
3. Apply filters: service name, log level (and above), pattern (string or regex)
4. Merge and sort all results by `ts` ascending
5. Output as pretty (default), ndjson, or json

Pretty output format:
```
[14:23:01.012] [payments       ] ✖ Error: idempotency key collision
[14:23:01.834] [stripe         ] ℹ webhook received — payment_intent.created
[14:23:02.004] [frontend       ] ⚠ WARNING: orderId missing, showing success anyway

— 3 entries from 3 service(s) | window: last 60s
Log level icons: ✖ error, ⚠ warn, ℹ info, · debug,   unknown
Level filtering means "this level and above" — --level warn shows both warn and error entries.

parser.ts — structured log support
Must handle both plain text and JSON logs:

If a line starts with {, try JSON.parse. If successful, detect level from level, severity, or lvl fields. Extract message from message, msg, or text fields.
Plain text level detection: regex match for error/warn/info/debug keywords
Timestamp for each entry is Date.now() at the moment of tailing — do not try to parse timestamps from log content


buffer.ts — RollingBuffer class
typescriptclass RollingBuffer {
  constructor(service: string, maxBytes = 50 * 1024 * 1024)
  async write(entry: LogEntry): Promise<void>
  async read(fromMs: number, toMs: number): Promise<LogEntry[]>
  close(): void
}

Writes to ~/.logsnap/buffers/<service>.ndjson (append mode)
When file size exceeds maxBytes, rotate: rename current to .1.ndjson, start fresh
read merges both files and returns entries in the time window, sorted by ts


tailer.ts — file tailer

Use fs.watch + readline or tail-file npm package to watch a log file for new lines
Each new line gets passed through parser.parseLine(line, serviceName, Date.now())
The resulting LogEntry gets written to the service's RollingBuffer
Handle file rotation gracefully (log files that get truncated or recreated)
Export a Tailer class with start() and stop() methods


session.ts — session persistence
Store session state at ~/.logsnap/session.json:
json{
  "pid": 12345,
  "startedAt": 1710000000000,
  "sources": [
    { "name": "payments", "filePath": "/home/user/.pm2/logs/payments-out.log" },
    { "name": "auth", "filePath": "/home/user/.pm2/logs/auth-out.log" }
  ]
}
```

`logsnap stop` sends SIGTERM to the stored PID. `logsnap status` checks if that PID is alive.

---

### MCP server (`mcp/server.ts`)

Expose two tools via stdio transport using `@modelcontextprotocol/sdk`:

**`logsnap_grab`**
```
Input:
  lastSeconds: number (default 60, max 3600)
  services?: string[]
  level?: "error" | "warn" | "info" | "debug"
  pattern?: string
  format?: "pretty" | "ndjson" | "json" (default "json")

Output: GrabResult as structured JSON
```

**`logsnap_status`**
```
Input: none
Output: SessionStatus — whether logsnap is running, which services, uptime
Use server.registerTool() with Zod schemas and proper annotations (readOnlyHint: true).
The MCP server should run as a separate entry point: logsnap mcp command, or node dist/mcp/server.js directly.

tsup.config.ts
typescriptimport { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "mcp/server": "src/mcp/server.ts",
  },
  format: ["esm"],
  target: "node18",
  clean: true,
  splitting: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

package.json key fields
json{
  "name": "logsnap",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "logsnap": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "start": "node dist/cli.js"
  }
}

Key constraints

Never spawn or manage processes — only tail files
No global state in memory — everything persists to disk so grab works even from a different terminal session than start
grab is always fast — reads from local disk only, no network, no process communication
Process-agnostic — pm2 is one source type, not a dependency. The tool works without pm2.
All output to --format json or --format ndjson must be valid parseable output with no extra text mixed in — these are for piping into other tools