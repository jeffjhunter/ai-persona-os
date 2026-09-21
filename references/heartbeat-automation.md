# Heartbeat Automation Guide

> **⚠️ OPT-IN ONLY:** Nothing in this guide runs automatically when the skill is installed.
> Heartbeat configuration and cron jobs described here are **manual setup steps** that the
> user must explicitly choose to perform. The core skill works fully without any cron jobs.
> All cron jobs run in **isolated sessions** — they read/write only local workspace files
> and make **no network calls, no API requests, and require no credentials**.

**Purpose:** Configure heartbeats and cron jobs for reliable, enforced protocol execution.  
**Added in:** v1.3.0

---

## How It Works

AI Persona OS splits operations into two layers:

| Layer | Mechanism | Frequency | Cost | Purpose |
|-------|-----------|-----------|------|---------|
| **Pulse** | Native heartbeat + monitor scratch | Every 30min | Low | Context guard + memory health |
| **Briefing** | Cron job (isolated) | 1-2x daily | Medium | Full 4-step protocol + channel scan |

**Why two layers?** Heartbeats run full agent turns, so keep the heartbeat checklist tiny; move heavy ops to cron. The checklist now lives in the heartbeat monitor's scratch, not a workspace file - OpenClaw retired workspace HEARTBEAT.md in 2026.8.1 and the runtime no longer reads it.

---

## Layer 1: Heartbeat (Every 30 Minutes)

### What the heartbeat monitor scratch does

Heartbeat is a native, system-owned OpenClaw automation. The cadence lives in config (`agents.defaults.heartbeat.every`, default 30m; "0m" disables), and the tiny checklist lives in the heartbeat monitor's scratch - not in a workspace file.

Set the checklist once:

```bash
openclaw cron list --all          # find the "Heartbeat (<agent-id>)" job
openclaw cron scratch <jobId> --set "- Context guard: if context >=70%, write a checkpoint to memory/YYYY-MM-DD.md NOW and skip everything else.
- Memory: MEMORY.md exists and stays under 4KB; archive entries older than 30 days to memory/archive/.
- VERSION.md matches the installed skill version; flag upgrades.
- Report with the traffic-light format below; if all green and no action taken, reply only HEARTBEAT_OK."
```

Keep the scratch short: it is read on every heartbeat turn.

> **Migrating?** If your workspace still has a HEARTBEAT.md, run `openclaw doctor --fix` once. It imports the checklist into the monitor scratch and archives the file. The old template file is retained in this repo only as a migration pointer (assets/HEARTBEAT-template.md).

### Output Format

The agent uses traffic light indicators for instant readability:

**All clear (suppressed — user never sees this):**
```
HEARTBEAT_OK
```

**Checkpoint written:**
```
🫀 Feb 5, 2:30 PM PT | anthropic/claude-haiku-4-5 | AI Persona OS v2.0.0

🟢 Context: 31% — Healthy
🟡 Memory: Stale — last checkpoint 47m ago
🟢 Workspace: Clean
🟢 Tasks: None pending

→ Checkpoint written to memory/2026-02-05.md
  Captured: 2 decisions, 1 action item
```

**Context emergency:**
```
🚨 HEARTBEAT — Feb 5, 2:30 PM PT

🔴 Context: 84% — EMERGENCY
🔴 Memory: At risk — last checkpoint 2h ago
🟢 Workspace: Clean
🟡 Tasks: 1 blocked — PR review overdue

→ Emergency checkpoint written
  Flushed: 3 decisions, 2 action items, 1 blocker
  ⚠️ Recommend starting a fresh session
```

**Maintenance needed:**
```
🫀 HEARTBEAT — Feb 5, 2:30 PM PT

🟢 Context: 22% — Healthy
🟡 Memory: MEMORY.md at 3.8KB (limit 4KB)
🟡 Workspace: 4 logs older than 90 days
🟢 Tasks: None pending

→ Maintenance needed
  MEMORY.md approaching limit — pruning recommended
  4 session logs ready to archive
  Say "clean up" to run both
```

**Overdue items surfaced:**
```
🫀 HEARTBEAT — Feb 5, 8:00 AM PT

🟢 Context: 12% — Healthy
🟢 Memory: Synced — checkpoint 8m ago
🟢 Workspace: Clean
🟡 Tasks: 3 uncompleted from yesterday

→ Carried over from Feb 4:
  ☐ Review Q1 budget proposal
  ☐ Reply to Sarah re: onboarding
  ☐ Update WORKFLOWS.md with new deploy process
```

### Indicator Reference

| Indicator | Context | Memory | Workspace | Tasks |
|-----------|---------|--------|-----------|-------|
| 🟢 | <50% | Checkpoint <30m old | All files OK | 0 pending |
| 🟡 | 50-69% | Checkpoint 30-60m old | Minor issues | 1-3 items |
| 🔴 | ≥70% | Checkpoint >60m old | Files inaccessible | Blocked items |

### Custom Heartbeat Prompt (RECOMMENDED)

Override the default OpenClaw heartbeat prompt. This is **strongly recommended** — without it, agents may revert to old formats or ignore the template structure.

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "target": "last",
        "prompt": "Follow the heartbeat monitor scratch checklist and execute every instruction. On the first line show: 🫀 [current date/time] | [your model name] | AI Persona OS v[VERSION from workspace VERSION.md file]. Then report using 🟢🟡🔴 indicators — one per line with a blank line between each: Context, Memory, Workspace, Tasks. If you took action, state what with → prefix. Only reply HEARTBEAT_OK if all 🟢 and no action taken. Do NOT use Step 0/1/2/3/4 format. Do NOT use markdown tables. Do NOT use headers. On the first line show: 🫀 [current date/time] | [your model name] | AI Persona OS v[VERSION from workspace VERSION.md file]. Then report using 🟢🟡🔴 indicators — one per line with a blank line between each: Context, Memory, Workspace, Tasks. If you took action, state what with → prefix. Only reply HEARTBEAT_OK if all 🟢 and no action taken. Do NOT use Step 0/1/2/3/4 format. Do NOT use markdown tables. Do NOT use headers."
      }
    }
  }
}
```

This replaces the default prompt with one that:
- Shows model name and OS version on the first line (instant visibility)
- Explicitly requires 🟢🟡🔴 indicators
- Forces line breaks between indicators (blank line between each)
- Blocks the old Step format that v1.2.0 agents may have learned
- Blocks markdown tables (garbled on WhatsApp/Telegram)
- Replies HEARTBEAT_OK when all green - OpenClaw suppresses a bare HEARTBEAT_OK acknowledgment automatically (fixed 300-char budget), and NO_REPLY is also accepted, so your phone stays silent when all green

---

## Layer 2: Daily Briefing (Cron Job)

For the full 4-step Session Management protocol (context → load state → system status → priority scan → assessment), use an isolated cron job that runs 1-2x daily.

### Morning Briefing

```bash
openclaw cron add \
  --name "ai-persona-morning-briefing" \
  --cron "0 8 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Run the AI Persona OS daily protocol:

Step 1: Load previous context — Read memory/$(date +%Y-%m-%d).md and yesterday's log. Summarize key state.

Step 2: System status — Run health-check.sh if available. Check MEMORY.md size, workspace structure, stale logs.

Step 3: Priority scan — Check channels in priority order (P1 critical → P4 background). Surface anything requiring attention.

Step 4: Assessment — System health summary, blocking issues, time-sensitive items, recommended first action.

Format as a daily briefing with 🟢🟡🔴 indicators for each section." \
  --announce
```

### End-of-Day Checkpoint

```bash
openclaw cron add \
  --name "ai-persona-eod-checkpoint" \
  --cron "0 18 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "End-of-day checkpoint:

1. Write a full checkpoint to memory/$(date +%Y-%m-%d).md with all decisions, action items, and open threads from today.

2. Review MEMORY.md — promote any repeated learnings from today's log. Prune anything stale.

3. Check .learnings/ — any pending items that should be promoted after 3+ repetitions?

4. Brief summary: what was accomplished, what carries over to tomorrow." \
  --announce
```

### Weekly Review

```bash
openclaw cron add \
  --name "ai-persona-weekly-review" \
  --cron "0 9 * * 1" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --model opus \
  --message "Weekly review protocol:

1. Scan memory/ for the past 7 days. Summarize key themes, decisions, and outcomes.

2. Review .learnings/LEARNINGS.md — promote items with 3+ repetitions to MEMORY.md or AGENTS.md.

3. Archive logs older than 90 days to memory/archive/.

4. Check MEMORY.md size — prune if >3.5KB.

5. Review WORKFLOWS.md — any new patterns worth documenting?

Deliver a weekly summary with wins, issues, and focus areas for the coming week." \
  --announce
```

---

## Configuration Examples

### Minimal Setup (Heartbeat Only)

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "target": "last"
      }
    }
  }
}
```

Uses the monitor scratch checklist as-is. Good starting point for single-channel users.

> **Multi-channel users:** `"target": "last"` will drift to whichever channel you most recently messaged from. If you want heartbeats pinned to Discord, see the [Channel Routing](#channel-routing--keeping-heartbeats-on-discord) section above and set `"target": "discord"` plus `"to": "<your-discord-user-id>"` (target accepts `owner`, `last`, `none`, or a channel ID; the recipient goes in `to`).

### Recommended Setup (Heartbeat + Cron)

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "30m",
        "target": "last",
        "prompt": "Follow the heartbeat monitor scratch checklist and execute every instruction. On the first line show: 🫀 [current date/time] | [your model name] | AI Persona OS v[VERSION from workspace VERSION.md file]. Then report using 🟢🟡🔴 indicators — one per line with a blank line between each: Context, Memory, Workspace, Tasks. If you took action, state what with → prefix. Only reply HEARTBEAT_OK if all 🟢 and no action taken. Do NOT use Step 0/1/2/3/4 format. Do NOT use markdown tables. Do NOT use headers. On the first line show: 🫀 [current date/time] | [your model name] | AI Persona OS v[VERSION from workspace VERSION.md file]. Then report using 🟢🟡🔴 indicators — one per line with a blank line between each: Context, Memory, Workspace, Tasks. If you took action, state what with → prefix. Only reply HEARTBEAT_OK if all 🟢 and no action taken. Do NOT use Step 0/1/2/3/4 format. Do NOT use markdown tables. Do NOT use headers.",
        "activeHours": {
          "start": "07:00",
          "end": "23:00"
        }
      }
    }
  }
}
```

Plus the cron jobs from Layer 2 above.

### Cost-Conscious Setup

```json
{
  "agents": {
    "defaults": {
      "heartbeat": {
        "every": "1h",
        "target": "last",
        "activeHours": {
          "start": "08:00",
          "end": "20:00"
        }
      }
    }
  }
}
```

Hourly heartbeats during work hours only. Use a single daily cron job for the briefing.

---

## Migrating from older versions

### From the HEARTBEAT.md era (any install before OpenClaw 2026.8.1)

Run `openclaw doctor --fix` once. It imports your workspace HEARTBEAT.md checklist into the heartbeat monitor's scratch and archives the file. Then set the current prompt override below if you want the 🟢🟡🔴 format.

### From v1.2.0 or v1.2.1

**The prompt override prevents agents from reverting to the old Step 0/1/2/3/4 format.** Agents that ran v1.2.0 for a while have the old format in their learned behavior. The prompt override forces the new format at the OpenClaw level.

Tell your agent:

> "Update your openclaw.json heartbeat to: `{ "every": "30m", "target": "last", "prompt": "Follow the heartbeat monitor scratch checklist and execute every instruction. On the first line show: 🫀 [current date/time] | [your model name] | AI Persona OS v[VERSION from workspace VERSION.md file]. Then report using 🟢🟡🔴 indicators — one per line with a blank line between each: Context, Memory, Workspace, Tasks. If you took action, state what with → prefix. Only reply HEARTBEAT_OK if all 🟢 and no action taken. Do NOT use Step 0/1/2/3/4 format. Do NOT use markdown tables. Do NOT use headers." }`"

**After editing openclaw.json:** run `/new` in chat (or `openclaw gateway restart`) to pick up the change. Skills, agent profiles, and heartbeat config are loaded at session start - `/new` is the fastest path to apply them without bouncing the whole gateway.

### Shared Channel Fix

If your agent responds in Discord/Slack channels when not mentioned, tell it:

> "List ALL Discord guilds in your config. Set requireMention: true for EVERY guild. Show me the full list when done."

This enforces Rule 5 (Selective Engagement) at the gateway level.

---

## Channel Routing — Keeping Heartbeats on Discord

The #1 OpenClaw 2026.x routing complaint: heartbeats and cron briefings deliver to the web Control UI instead of Discord. Per the [channel-routing spec](https://docs.openclaw.ai/channels/channel-routing.md), the model never picks a channel — but **unsolicited** messages (no inbound to route back to) fall through to defaults that may not be what you want.

### The Three Settings

1. **`accounts.default`** — required in multi-account setups. Without it, fallback picks "the first normalized account ID" which is often the web account.

   ```json
   "accounts": { "default": "discord-<account-id>" }
   ```

2. **`channels.discord.defaultAccount`** — sets a per-channel anchor so Discord-originated sessions never get re-homed to web.

   ```json
   "channels": { "discord": { "defaultAccount": "discord-<account-id>" } }
   ```

3. **`agents.defaults.heartbeat.target`** — `"last"` drifts. Pin to a Discord peer:

   ```json
   "target": { "kind": "discordUser", "id": "<your-discord-user-id>" }
   ```

### Verifying

Inside the AI Persona OS agent, run `route check` in chat. It exec's a config audit and surfaces missing keys with a 🟢🟡🔴 dashboard.

### After Editing openclaw.json

Run `/new` in chat to reload — or `openclaw gateway restart` as fallback.

### Cron Job Targeting

The cron templates in `assets/cron-templates/` use `--announce` which delivers to the user's last interaction channel. For Discord-pinned delivery, replace `--announce` with explicit `--target`:

```bash
openclaw cron add \
  --name "ai-persona-morning-briefing" \
  --cron "0 8 * * *" \
  --tz "America/Los_Angeles" \
  --target '{"kind":"discordUser","id":"<your-discord-user-id>"}' \
  --session isolated \
  --message "..."
```

### What's Preserved

Your existing memory files, SOUL.md, USER.md, AGENTS.md, WORKFLOWS.md, and all workspace content are untouched. This only changes how heartbeats execute and how the agent behaves in shared channels.

---

## Troubleshooting

**Agent still uses Step 0/1/2/3/4 format:**
- Add the custom heartbeat.prompt override (see RECOMMENDED section above)
- The old format is learned behavior — the prompt override forces the new format at the OpenClaw level
- If it persists, clear the agent's session history: start a fresh session

**Heartbeat indicators render on one line (no line breaks):**
- Discord and some chat platforms collapse single newlines
- The v1.3.1 template instructs blank lines between indicators
- If still compressed: add the heartbeat prompt override which explicitly requests "blank line between each"

**Agent still replies HEARTBEAT_OK without checking:**
- Verify the monitor scratch is set: `openclaw cron list --all`, then `openclaw cron scratch <jobId>` to view it
- Add the custom heartbeat.prompt override - it forces structured output
- Check the scratch isn't empty

**HEARTBEAT_OK is showing up in chat (not being suppressed):**
- Verify the agent is replying with just `HEARTBEAT_OK` and no extra text - suppression only applies when the reply, minus the acknowledgment, is at most 300 characters
- `ackMaxChars` no longer exists in current OpenClaw; the suppression budget is fixed. Reply `NO_REPLY` also suppresses delivery

**Agent responds in Discord when not mentioned:**
- Set `requireMention: true` for ALL Discord guilds in your gateway config
- This is a gateway-level setting, not a skill setting
- Tell the agent: "List ALL Discord guilds in your config. Set requireMention: true for EVERY guild."

**Heartbeat messages are too noisy:**
- Increase interval: `"every": "1h"`
- Add activeHours to limit to work hours
- The 🟢-all-clear case already suppresses delivery

**Heartbeats not firing:**
- Run `openclaw system heartbeat last` to check status
- Verify `agents.defaults.heartbeat.every` isn't "0m"
- Check that `every` and `target` exist in your heartbeat config — without them, heartbeats don't auto-fire
- Check activeHours timezone

**MEMORY.md too large (burning tokens):**
- v1.3.2 heartbeat auto-prunes MEMORY.md when it exceeds 4KB
- If auto-pruning hasn't triggered: manually tell your agent to prune
- Facts older than 30 days should be archived to memory/archive/
- MEMORY.md should stay under 4KB — it's read every session start

**Don't know what config settings are missing:**
- Check heartbeat config: `every`, `target`, `prompt` under `agents.defaults.heartbeat`
- Check the monitor scratch is set (see Layer 1)
- Check Discord `requireMention` per guild, workspace files (SOUL.md, USER.md, MEMORY.md size), VERSION.md, ESCALATION.md

**Agent's config file is clawdbot-mac.json or clawdbot.json (not openclaw.json):**
- Older installs may use the pre-rename config file
- All heartbeat and guild settings work the same regardless of filename
- Tell the agent to check its actual config file name: "What config file are you using?"

---

*Part of AI Persona OS by Jeff J Hunter — https://os.aipersonamethod.com*
