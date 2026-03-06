# logjack

`logjack` is a TypeScript CLI flight recorder for local logs. It tails existing log files into a rolling NDJSON buffer and lets you grab time-windowed snapshots quickly.

All state is stored under `~/.logjack` by default (override with `LOGSNAP_DIR=/custom/path`).

## Global usage

```bash
logjack --help
logjack <command> [options]
```

Or, during development:

```bash
node dist/cli.js <command> [options]
```

---

## `start` — begin tailing log sources

Starts a detached background worker that tails one or more log files and writes them into rolling NDJSON buffers.

```bash
logjack start [options]
```

**Options**

- `--pm2`  
  Auto-discovers all running PM2 processes via `pm2 jlist` and tails their stdout/stderr log files.  
  Use when you want to capture logs for every current PM2 app without specifying paths manually.

- `--tail "name:/path/to/file.log"` (repeatable)  
  Adds a single log file source with a logical **service name** and a file path.  
  Use when you want to tail a specific file, e.g.:
  - `--tail "main:/Users/faraz/.pm2/logs/main-out.log"`
  - `--tail "api:/var/log/my-api.log"`

You can combine `--pm2` and one or more `--tail` options in a single `start` command.

---

## Multiple logs and adding sources

**Tailing multiple logs at once**

Use one `start` with multiple `--tail` (and optionally `--pm2`). All listed sources are tailed by a single worker:

```bash
logjack start --tail "main:/Users/faraz/.pm2/logs/main-out.log" --tail "api:/path/to/api.log" --tail "worker:/path/to/worker.log"
```

Or combine PM2 discovery with extra files:

```bash
logjack start --pm2 --tail "nginx:/var/log/nginx/access.log"
```

**Adding another log later**

You cannot add a new source by running `start` again while the worker is already running — you will get “logjack is already running.” There is one worker per session, and the set of sources is fixed when you start.

To add (or remove) sources:

1. Stop the current worker: `logjack stop`
2. Start again with the **full** list of sources you want (existing + new):

```bash
logjack start --tail "main:/Users/faraz/.pm2/logs/main-out.log" --tail "api:/path/to/api.log"
```

**Grabbing from one or more services**

Once multiple sources are being tailed, you can grab from all of them or filter by service name:

```bash
logjack grab --last 300
# All services, merged and sorted by time

logjack grab --last 300 --service main
# Only the "main" service

logjack grab --last 300 --service main --service api
# Only "main" and "api"

logjack grab --from 01:00 --to 02:00
# Everything between 1 AM and 2 AM today

logjack grab --from "2024-06-15T10:30:00" --to "2024-06-15T11:00:00"
# Specific date/time range

logjack grab --from 09:00
# From 9 AM today until now
```

So you can “start with one log, then [after restart] another,” and then grab each service separately with `--service <name>`.

---

## `grab` — read a time-window of logs

Reads buffered log entries from `~/.logjack/buffers/*.ndjson`, applies filters, and prints a snapshot.

```bash
logjack grab [options]
```

**Options**

- `--last <seconds>`
  Time window to grab, in seconds.
  - Default: `60` seconds
  - Max: `3600` seconds
  Use this to say “give me the last 5 minutes” with `--last 300`.
  Ignored when `--from` or `--to` is specified.

- `--from <time>`
  Start of the time range to grab.
  Accepted formats:
  - Time only (today's date assumed): `01:00`, `14:30`, `09:05:30`
  - Date + time: `2024-06-15T10:30:00` or `2024-06-15 10:30:00`
  - Date only (midnight): `2024-06-15`
  If `--from` is given without `--to`, the window ends at now.

- `--to <time>`
  End of the time range to grab. Same format as `--from`.
  If `--to` is given without `--from`, the window starts `--last` seconds before `--to`.

- `--service <name>` (repeatable)  
  Restrict results to one or more service names (the `name` you used in `--tail`).  
  If omitted, all services are included.  
  Example: `--service main --service api`.

- `--level <level>`  
  Minimum log level to include. Levels are ordered: `debug < info < warn < error`.  
  Passing a level includes that level **and above**:
  - `--level debug` → all entries
  - `--level info` → `info`, `warn`, `error`
  - `--level warn` → `warn`, `error`
  - `--level error` → only `error`

- `--pattern <pattern>`  
  Filters entries whose **line text** matches a pattern.  
  - Plain string (substring match): `--pattern "idempotency key"`  
  - Regex with flags: `--pattern "/idempotency/i"`  
  Only entries whose `line` matches the pattern are kept.

- `--format <format>`  
  Output format:
  - `pretty` (default): human-friendly text with level icons and summary line.
  - `ndjson`: one JSON object per line (no extra text) — good for piping.
  - `json`: a JSON structure (`GrabResult` with `entries`, etc.).

- `--out <file>`  
  Write output to a file instead of stdout.  
  Useful when you want to save a snapshot for later inspection, e.g.:
  - `logjack grab --last 300 --format ndjson --out ./debug.ndjson`

---

## `status` — show what logjack is doing

Displays whether the background worker is running and which sources it’s tailing.

```bash
logjack status
```

**Output**

- If not running: `logjack is not running.`
- If running:
  - Worker PID
  - Uptime
  - List of sources in the current session (service name and file path)

Use this to confirm that `start` worked and that your expected files are being watched.

---

## `stop` — stop tailing

Stops the background worker and clears the current session.

```bash
logjack stop
```

**Behavior**

- If a worker is running, sends `SIGTERM` to its PID and removes the session file.
- If no worker is running but a session file exists, reports that the session exists but the worker is not running, then clears it.

Use this when you’re done recording logs or want to restart with a new set of sources.

---

## `mcp` — run the MCP server

Starts the Model Context Protocol (MCP) server over stdio, exposing two tools:

- **`logjack_grab`** — Grab a time-windowed snapshot from your buffers (same as `logjack grab`). Parameters: `lastSeconds`, optional `services`, `level`, `pattern`, `format`.
- **`logjack_status`** — Check if logjack is running and list watched sources (same as `logjack status`).

```bash
logjack mcp
```

This is for MCP-compatible clients (e.g. Cursor, Claude Desktop) so the AI can query your local logs without you running the CLI yourself.

---

### Using logjack MCP in Cursor (Claude / AI)

**Manual config (Cursor / Claude Code)** — Add this to your MCP config (Cursor Settings → MCP → Edit config, or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "logjack": {
      "command": "npx",
      "args": ["logjack", "mcp"]
    }
  }
}
```

1. **Install logjack** (globally or in your project):
   ```bash
   npm install -g logjack
   # or: npx logjack (no install, use npx each time)
   ```

2. **Add the MCP server in Cursor:**
   - Open **Cursor Settings** → **MCP** (or **Features** → **MCP**).
   - Add a server entry for logjack.

   **Option A — Global config (recommended)**  
   Edit your user MCP config (e.g. **Cursor Settings → MCP → Edit config**) and add:

   ```json
   {
     "mcpServers": {
       "logjack": {
         "command": "npx",
         "args": ["-y", "logjack", "mcp"]
       }
     }
   }
   ```

   If logjack is installed globally, you can use:

   ```json
   {
     "mcpServers": {
       "logjack": {
         "command": "logjack",
         "args": ["mcp"]
       }
     }
   }
   ```

   **Option B — Project-only**  
   Create or edit `.cursor/mcp.json` in your repo:

   ```json
   {
     "mcpServers": {
       "logjack": {
         "command": "npx",
         "args": ["-y", "logjack", "mcp"]
       }
     }
   }
   ```

3. **Restart Cursor** (or reload the MCP servers) so it picks up the new server.

4. **Use in chat:** In a Cursor chat (with Claude or another model), you can ask things like “grab the last 5 minutes of logs” or “is logjack running?” — the model will call `logjack_grab` or `logjack_status` for you.

**Note:** Start logjack’s tailing first with `logjack start --pm2` or `logjack start --tail "name:/path/to/log"` so there is data to grab. The MCP server only reads from the existing buffers; it does not start the worker.
