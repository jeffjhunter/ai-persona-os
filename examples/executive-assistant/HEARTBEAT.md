# HEARTBEAT.md - RETIRED by OpenClaw (2026.8.1)

OpenClaw no longer reads workspace HEARTBEAT.md files. The heartbeat layer is now native:

- Cadence lives in config: `agents.defaults.heartbeat.every` (e.g. "30m"; "0m" disables).
- Checklist content lives in the heartbeat monitor's scratch: `openclaw cron list --all` to find the `Heartbeat (agent-id)` job, then `openclaw cron scratch <jobId> --set "..."`.
- Status: `openclaw system heartbeat last`.

If your workspace still has a HEARTBEAT.md, run `openclaw doctor --fix` once - it imports the checklist into the monitor scratch and archives the file.
