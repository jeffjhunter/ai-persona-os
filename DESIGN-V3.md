# AI Persona OS v3.0 — Plugin Rewrite Design

> **Status:** Draft for review
> **Author:** Jeff J Hunter (planning with Claude)
> **Created:** 2026-05-19
> **Supersedes:** v2.x skill-only architecture
> **Target release:** v3.0.0 (rolling — phased delivery, see § Phases)

---

## TL;DR

AI Persona OS becomes an **OpenClaw plugin** that bundles a thin skill and a templates directory. Hot paths (workspace detection, heartbeat, recall, route check) move from "agent parses SKILL.md instructions every session" to "first-class tools registered by plugin code." Same product, native execution, fewer tokens per turn, deterministic behavior, real moat.

---

## Why move from skill to plugin

### What hurts in v2.x (skill-only)

| Pain | Cause | Symptom |
|------|-------|---------|
| Per-session token tax | The 70KB SKILL.md is read into the agent's context every turn | Cost + latency on every interaction |
| Non-deterministic command recognition | "status" / "recall" / "route check" matched by model NLU | Model occasionally misses or misroutes commands |
| Hardcoded paths broke on different installs | `~/workspace/` assumption + agent doing JSON parsing | The "agent ignores my SOUL.md" report from real users |
| Windows zip extractor corruption | Skill ships as a zip, end-user extraction varies | One user got `SECURITY_NOTE.md` content in their SKILL.md |
| No real install-time logic | Skill can only *instruct* the agent at runtime | Migration prompts must be re-prompted each session |
| Heartbeat tax | The 30-line HEARTBEAT.md runs through the model every 30 min | Tokens × 48 fires/day for what could be deterministic code |
| ClawHub listing presentation locked to SKILL.md | Visitor lands on the agent-rules wall | Restructured in v2.0 but still fundamentally a single markdown file |

### What plugin code unlocks

- **`gateway_start` hook** runs ONCE per gateway boot — perfect for workspace detection, config validation, migration prompts
- **`registerTool`** makes `persona_status`, `persona_recall`, `persona_route_check`, `persona_setup` first-class tools — deterministic, fast, no NLU guesswork
- **`registerCli`** exposes `openclaw persona setup` / `openclaw persona doctor` / `openclaw persona route check` — works without the TUI, perfect for cron and CI
- **`registerCommand`** for `/persona setup`-style commands that bypass the LLM entirely
- **Heartbeat as native code** — emit the 🟢🟡🔴 format directly, no model turn required
- **Plugin owns its install** — npm package, `openclaw plugins install clawhub:jeffjhunter/ai-persona-os`, no manual unzip
- **Bundled skill still ships** for the prompt-level personality content (24 souls, AGENTS rules) — but only ~5KB instead of 70KB

---

## Target architecture

```
@jeffjhunter/openclaw-ai-persona-os/                     ← npm package
├── package.json                                          ← Node 22.19+, openclaw extension
├── openclaw.plugin.json                                  ← manifest (id, contracts, skills, schema)
├── src/
│   ├── index.ts                                          ← definePluginEntry — main registration
│   ├── tools/
│   │   ├── persona_status.ts                             ← health dashboard
│   │   ├── persona_setup.ts                              ← run the 5-preset wizard (deterministic)
│   │   ├── persona_recall.ts                             ← wraps memory_search w/ AI Persona OS schema
│   │   ├── persona_route_check.ts                        ← Discord routing audit
│   │   ├── persona_workspace_resolve.ts                  ← canonical workspace path resolution
│   │   ├── persona_switch_soul.ts                        ← swap SOUL.md from gallery
│   │   ├── persona_blend_souls.ts                        ← generate hybrid soul
│   │   ├── persona_dream.ts                              ← trigger memory consolidation
│   │   ├── persona_checkpoint.ts                         ← write a context checkpoint NOW
│   │   └── persona_doctor.ts                             ← lint workspace + config
│   ├── hooks/
│   │   ├── gateway_start.ts                              ← workspace detect, version check, migration prompt
│   │   ├── before_tool_call.ts                           ← context-guard checkpoint trigger
│   │   ├── heartbeat.ts                                  ← native 🟢🟡🔴 emitter (replaces HEARTBEAT.md)
│   │   └── message_received.ts                           ← detect natural-language commands ("status", "recall X")
│   ├── lib/
│   │   ├── workspace.ts                                  ← resolveWorkspace() — used by every tool
│   │   ├── memory.ts                                     ← typed helpers over memory_get/memory_search
│   │   ├── checkpoint.ts                                 ← checkpoint write logic (shared by tool + hook)
│   │   ├── soul-gallery.ts                               ← reads & enumerates the bundled soul files
│   │   └── config.ts                                     ← reads openclaw.json (typed)
│   ├── migrations/
│   │   ├── v1_to_v2.ts                                   ← legacy: workspace path
│   │   ├── v2_to_v3.ts                                   ← skill removal, plugin install
│   │   └── index.ts                                      ← migration runner
│   └── cli/
│       ├── setup.ts                                      ← `openclaw persona setup`
│       ├── doctor.ts                                     ← `openclaw persona doctor`
│       └── index.ts                                      ← CLI registration
├── skills/
│   └── ai-persona-os/
│       ├── SKILL.md                                      ← ~5KB — purely "use the persona_* tools"
│       └── README.md                                     ← ClawHub-facing pitch (the marketing)
├── templates/                                            ← bundled markdown templates
│   ├── SOUL-template.md
│   ├── USER-template.md
│   ├── MEMORY-template.md
│   ├── DREAMS-template.md
│   ├── AGENTS-template.md
│   ├── SECURITY-template.md
│   ├── HEARTBEAT-template.md
│   ├── WORKFLOWS-template.md
│   ├── ESCALATION-template.md
│   ├── TOOLS-template.md
│   ├── INDEX-template.md
│   ├── KNOWLEDGE-template.md
│   ├── starter-packs/
│   │   ├── coding-assistant/                             ← Axiom — SOUL + HEARTBEAT + KNOWLEDGE
│   │   ├── executive-assistant/                          ← Atlas
│   │   └── marketing-assistant/                          ← Spark
│   ├── prebuilt-souls/                                   ← 11 originals (Rook, Nyx, Keel, ...)
│   └── iconic-characters/                                ← 13 characters (Thanos, JARVIS, ...)
├── test/
│   ├── tools.test.ts
│   ├── hooks.test.ts
│   ├── workspace.test.ts
│   └── migrations.test.ts
├── tsconfig.json
└── README.md                                              ← repo readme (different from skills/ai-persona-os/README.md)
```

---

## Plugin manifest (`openclaw.plugin.json`)

```json
{
  "id": "ai-persona-os",
  "name": "AI Persona OS",
  "description": "The complete operating system for OpenClaw agents — 24 souls, memory tools, Discord routing fix, heartbeat protocol, never-forget context.",
  "version": "3.0.0",
  "activation": {
    "onStartup": true
  },
  "skills": ["./skills/ai-persona-os"],
  "contracts": {
    "tools": [
      "persona_status",
      "persona_setup",
      "persona_recall",
      "persona_route_check",
      "persona_workspace_resolve",
      "persona_switch_soul",
      "persona_blend_souls",
      "persona_dream",
      "persona_checkpoint",
      "persona_doctor"
    ]
  },
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "workspaceOverride": {
        "type": "string",
        "description": "Optional override for the workspace path. Defaults to agents.defaults.workspace from openclaw.json."
      },
      "advisor": {
        "type": "object",
        "properties": {
          "enabled": { "type": "boolean", "default": true },
          "maxSuggestionsPerSession": { "type": "number", "default": 1 }
        }
      },
      "heartbeat": {
        "type": "object",
        "properties": {
          "useNativeProtocol": { "type": "boolean", "default": true, "description": "Use plugin-emitted 🟢🟡🔴 format instead of HEARTBEAT.md. Saves tokens." },
          "memoryLimitKB": { "type": "number", "default": 4 },
          "autoPrune": { "type": "boolean", "default": true }
        }
      }
    }
  },
  "uiHints": {
    "workspaceOverride": {
      "label": "Workspace path override",
      "placeholder": "/home/user/.openclaw/workspace",
      "sensitive": false
    }
  }
}
```

---

## Tool surface

Each tool registered via `api.registerTool(...)` with TypeBox parameter schemas. Return shape per OpenClaw convention: `{ content: [{ type: "text", text: "..." }] }`.

| Tool | Parameters | What it does | Replaces |
|------|-----------|--------------|----------|
| `persona_workspace_resolve` | `{}` | Returns the resolved workspace path. Reads `agents.defaults.workspace`, agent-specific overrides, plugin config `workspaceOverride`, env `$OPENCLAW_WORKSPACE`, falls back to `~/.openclaw/workspace`. | The SKILL.md "Workspace Detection" section + `scripts/resolve-workspace.sh` |
| `persona_setup` | `{ preset: "coding-assistant" \| "executive-assistant" \| "marketing-assistant" \| "soul-md-maker" \| "custom", name?: string, role?: string, goal?: string, soul?: string }` | Bootstraps the workspace with the chosen preset. Copies templates, personalizes via JSON (no sed quoting), writes files atomically. | The entire "First-Run Setup" Step 1-3 wizard in SKILL.md |
| `persona_status` | `{ format?: "compact" \| "detailed" }` | Returns 🟢🟡🔴 dashboard: core files, MEMORY.md size, recent activity, version. Deterministic. | `status` in-chat command |
| `persona_recall` | `{ query: string, limit?: number }` | Wraps `memory_search` with the AI Persona OS-specific scoring (boost recent daily logs, dedupe MEMORY.md hits). Returns top chunks with file:line. | `recall <topic>` in-chat command |
| `persona_route_check` | `{}` | Reads `openclaw.json`, returns 🟢🟡🔴 dashboard of `accounts.default`, `channels.discord.defaultAccount`, heartbeat target, `requireMention` per guild. Surfaces JSON snippets for any missing key. | `route check` in-chat command |
| `persona_switch_soul` | `{ soul: string }` | Swaps `<WORKSPACE>/SOUL.md` to the named gallery soul (e.g. `"rook"`, `"jarvis"`). Backs up the current SOUL.md to `memory/archive/soul-pre-switch-<ts>.md`. | `switch soul` in-chat command + Step 1c/d soul gallery |
| `persona_blend_souls` | `{ a: string, b: string }` | Generates a hybrid SOUL.md by structurally merging two gallery souls. Outputs to `<WORKSPACE>/SOUL.md` (after backup). | `blend souls` in-chat command |
| `persona_dream` | `{ window_days?: number }` | Triggers a memory consolidation pass over the last N days of daily logs. Appends to `<WORKSPACE>/DREAMS.md` and writes detail to `memory/.dreams/<ts>.md`. | The "dreaming" concept from v1.8.0 |
| `persona_checkpoint` | `{ summary?: string }` | Writes a checkpoint to `memory/YYYY-MM-DD.md` NOW. Used by both the `before_tool_call` hook (at 70%+ context) and the explicit `checkpoint` command. | `checkpoint` in-chat command + the threshold-based protection logic |
| `persona_doctor` | `{ fix?: boolean }` | Lints workspace (missing files, MEMORY.md size, version mismatch) AND config (routing, sandbox, tools.profile). If `fix: true`, applies safe repairs with per-step approval. | `health check`, `security audit`, `config-validator.sh`, `route check` (combined) |

---

## Hooks

| Hook | When | What we do |
|------|------|------------|
| `gateway_start` | Once at gateway boot | Resolve workspace, validate `tools.profile`, check for missing core files, queue migration prompts, log version/release-notes URL |
| `message_received` | Every inbound message | Detect natural-language commands ("how's my system?" → invoke `persona_status`). LLM is bypassed for known phrases. Falls through to normal agent turn otherwise. |
| `before_tool_call` | Before any agent tool call | Read context %, if ≥70% schedule a `persona_checkpoint` via the hook context, log telemetry |
| `cron_changed` | When cron jobs change | Validate that AI Persona OS cron templates still align with the user's config |

The current ambient context monitoring (every-10-exchange checks) becomes a hook that fires on `before_tool_call` with a counter.

---

## Bundled skill (drastically slimmed)

The `skills/ai-persona-os/SKILL.md` shipped INSIDE the plugin shrinks from 70KB → ~5KB. It exists only to teach agents about the tool surface — the heavy lifting is done by the plugin code.

Sketch:
```markdown
---
name: ai-persona-os
description: ...
version: 3.0.0
---

# AI Persona OS

You're operating with the **AI Persona OS plugin** loaded. Use these tools instead of generic file ops:

| When the user… | Use this tool |
|----------------|---------------|
| Asks "set up AI Persona OS" or this is a fresh install | `persona_setup` (show the preset menu first if they didn't pick one) |
| Asks "status", "how's my system", "system health" | `persona_status` |
| Asks "recall X", "find when I…", "what did I decide about X" | `persona_recall` |
| Asks "route check", reports agent replying on wrong channel | `persona_route_check` |
| Asks "switch soul", "change personality" | `persona_switch_soul` |
| Asks "blend souls" | `persona_blend_souls` |
| Asks "checkpoint", "save where we are" | `persona_checkpoint` |
| Asks "health check", "doctor" | `persona_doctor` |

For workspace file paths, ALWAYS call `persona_workspace_resolve` first (or read `ctx.workspace` from a tool's input — every persona_* tool sets it). Never hardcode paths.

Operating rules (carried from v2.x):
1-11. [Trimmed list]

That's it. Use the tools. They handle the details.
```

This SKILL.md is bundled with the plugin and auto-loaded when the plugin loads. ClawHub-facing marketing copy moves to `skills/ai-persona-os/README.md` (still bundled, rendered on the listing page) — the same v2.0 pitch content.

---

## CLI surface

Registered via `api.registerCli(...)`. Standalone use (cron jobs, CI, headless ops):

```
openclaw persona setup --preset coding-assistant --name "Jeff" --role "Founder"
openclaw persona status [--json]
openclaw persona recall "pricing decisions Q1"
openclaw persona route check [--json] [--fix]
openclaw persona doctor [--json] [--fix]
openclaw persona dream [--window-days 7]
openclaw persona checkpoint --summary "End of day"
openclaw persona switch-soul jarvis
openclaw persona workspace            # prints resolved workspace path
```

All commands JSON-mode for scripting. Replaces the bash `scripts/*.sh` helpers.

---

## Migration: v2.x skill → v3.0 plugin

### User-facing flow

1. Run `openclaw plugins install clawhub:jeffjhunter/ai-persona-os` (or the npm equivalent)
2. The plugin's `gateway_start` hook detects the old skill at `~/.openclaw/skills/ai-persona-os/` (or workspace-level)
3. Plugin prompts ONCE: *"Detected v2.x skill installation. v3.0 supersedes it — the plugin provides the same features as native tools. Disable the old skill? (yes/no)"*
4. On approval, disables the skill via config write to `skills.entries.ai-persona-os.enabled = false`
5. Migration runner upgrades workspace VERSION.md to 3.0.0
6. Existing workspace files (SOUL.md, MEMORY.md, etc.) untouched — they continue to work
7. Future sessions use the plugin tools exclusively

### Compat shim

For users who *don't* migrate, the v2.x skill keeps working as-is. They miss the plugin features but don't break.

### Removal of v2.x ClawHub listing

Not removed — kept as a "legacy skill version" so users can pin to v2.x if they prefer the markdown-only approach.

---

## Phases & estimated effort

| Phase | Deliverable | Estimate | Session |
|-------|-------------|----------|---------|
| **1. Research + Design** ✅ | This document | 1h | Done |
| **2. Scaffold** | Repo skeleton, `package.json`, `openclaw.plugin.json`, minimal `index.ts` registering a no-op `persona_workspace_resolve` tool. Loads cleanly into the user's gateway. | 2-3h | Next |
| **3. Core tools (read-only)** | `persona_workspace_resolve`, `persona_status`, `persona_recall`, `persona_route_check`, `persona_doctor` (lint-only mode). No write paths. Safe to try. | 4-6h | Session 3 |
| **4. Setup wizard** | `persona_setup` end-to-end — the big preset wizard + soul gallery picker, replacing the SKILL.md Steps 1-3. | 4-6h | Session 4 |
| **5. Hooks + heartbeat** | `gateway_start`, `before_tool_call`, native heartbeat protocol. The 🟢🟡🔴 format emitted by plugin code (zero model tokens for HEARTBEAT_OK case). | 3-5h | Session 5 |
| **6. Write tools + migrations** | `persona_checkpoint`, `persona_switch_soul`, `persona_blend_souls`, `persona_dream`, `persona_doctor --fix`, v2→v3 migration runner. | 4-6h | Session 6 |
| **7. CLI** | All `openclaw persona <subcommand>` entries registered. JSON output mode. | 2-3h | Session 7 |
| **8. Tests + docs + ship** | Unit tests, contract tests, README, CHANGELOG, npm publish (or ClawHub publish), v3.0.0 GitHub release. | 4-6h | Session 8 |

**Total: ~25-40 hours.** Realistic ship date: 2-4 weeks of focused part-time work.

Phase 2 (scaffold) is the next session. From there, each subsequent session is one phase, ending in a working partial-functionality plugin that compiles and loads.

---

## Open decisions

| # | Question | Default proposal |
|--|----------|------------------|
| 1 | npm package name | `@jeffjhunter/openclaw-ai-persona-os` (scoped) |
| 2 | Repo location | Same repo (`jeffjhunter/ai-persona-os` on GitHub). Plugin source lives in `src/`. v2.x skill files stay in `skill/` subdirectory as the bundled skill content. |
| 3 | Distribution | Publish to BOTH ClawHub (`clawhub package publish`) and npm. Users can install either way. |
| 4 | TypeScript strictness | `strict: true`, ESLint, Prettier. Standard. |
| 5 | Compat target | `pluginApi: ">=2026.5.18"` — matches user's installed version. |
| 6 | Test framework | Vitest (lighter than Jest, aligned with what OpenClaw bundled plugins use per docs). |
| 7 | Should we keep the v2.x skill ClawHub listing live? | Yes — pin it as "v2.x legacy markdown-only release." Some users will prefer it. |
| 8 | Should plugin auto-disable the v2.x skill if both are installed? | Prompt on first run, don't auto-disable. |
| 9 | Naming: `persona_*` prefix vs `apos_*` or none? | `persona_*` — collision-safe with other plugins, clearly namespaced. |
| 10 | Native heartbeat: replace HEARTBEAT.md entirely, or augment? | Plugin emits the protocol natively; HEARTBEAT.md becomes optional documentation. Config knob `heartbeat.useNativeProtocol` (default true) decides. |

---

## What stays from v2.x

- All 24 soul files (templates, unchanged)
- All starter pack files (coding-assistant, executive-assistant, marketing-assistant — unchanged)
- The 8 Operating Rules philosophy (lives in AGENTS-template.md, unchanged)
- The 4-Tier Architecture (workspace shape unchanged)
- The CHANGELOG (continuous history)
- The MIT-0 license

---

## What stops existing

- The 70KB SKILL.md with 1500 lines of instructions — replaced by ~5KB shim
- The 11 Agent Rules at the top of SKILL.md — replaced by tool contracts (the tool either does the thing correctly or it errors)
- The `scripts/security-audit.sh`, `scripts/resolve-workspace.sh` bash helpers — replaced by `persona_doctor` and `persona_workspace_resolve`
- The "agent reads JSON, parses workspace path mentally" pattern — replaced by typed config reads at plugin load
- The cron template `.sh` files — replaced by `openclaw persona setup --cron morning-briefing` CLI subcommand

---

## Acceptance criteria for v3.0 ship

- [ ] Plugin loads cleanly on OpenClaw 2026.5.18+
- [ ] All 10 `persona_*` tools registered and pass smoke tests
- [ ] `persona_setup` end-to-end creates a working workspace matching v2.x output, byte-for-byte for template content
- [ ] v2.x → v3.0 migration tested on the maintainer's local install (this user)
- [ ] Native heartbeat saves ≥90% of the per-fire token cost vs v2.x HEARTBEAT.md
- [ ] All 24 souls + 3 starter packs render correctly from `templates/`
- [ ] `openclaw persona doctor` passes 🟢 on a fresh install
- [ ] ClawHub plugin listing published, v3.0.0 GitHub release with installable artifact
- [ ] CHANGELOG.md has migration notes for v2.x users
- [ ] At least one external test user (besides Jeff) confirms install works

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| OpenClaw plugin SDK changes between now and v3.0 ship | Medium (OpenClaw is on a fast release cadence) | Pin `pluginApi` compat range. Test against multiple OpenClaw versions before publishing. |
| Plugin install requires more privileges than skill | Low | OpenClaw plugins have controlled install permissions. Document required permissions in the listing. |
| Existing v2.x users don't migrate | High | Plugin auto-detects skill install, prompts once. Migration is non-destructive. Keep v2.x skill on ClawHub indefinitely. |
| Native heartbeat misbehaves and floods Discord | Medium | Config knob `heartbeat.useNativeProtocol` defaults to true but is easily disabled. Plugin obeys `ackMaxChars` and `activeHours`. |
| Soul gallery files diverge between plugin templates and ClawHub listing | Low | Single source of truth: `templates/` folder in the plugin repo. Bundled skill imports them by reference. |
| Plugin bundle size bloat | Low | Plugin is mostly markdown templates + small TS. Estimate <500KB published. |

---

## Next session (Phase 2)

Scaffold the repo:
1. Create `src/`, `templates/`, `skills/` subdirectories
2. Write minimal `package.json` (with `openclaw` extension), `openclaw.plugin.json`, `tsconfig.json`
3. Write `src/index.ts` that registers a single no-op tool: `persona_workspace_resolve` returning a hardcoded string
4. Build: `pnpm install`, `pnpm build`
5. Local install on user's gateway: `npm install -g .` or `openclaw plugins install --local /path/to/plugin`
6. Verify it appears in `openclaw plugins list` and the tool shows in `openclaw doctor --lint`
7. Commit, push, tag `v3.0.0-alpha.1`

Output: a working but empty plugin shell. Next session implements real tool logic.

---

*This is a living design doc. Updates committed to main with notes in this section.*
