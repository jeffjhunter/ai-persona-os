# AI Persona OS — Changelog

All notable changes to the AI Persona OS skill and plugin.

---

## v3.0.0-alpha.5 — May 19, 2026 — Phase 6 partial (pre-release)

**Write tools: `persona_checkpoint`, `persona_switch_soul`, `persona_blend_souls`, `persona_dream` + safe `persona_doctor --fix`.**

This is the **safe subset** of Phase 6 — write tools that only touch workspace files (atomic writes, backup-before-overwrite). The two riskier Phase 6 items — the v2→v3 migration runner (which would disable the v2.0 skill) and the `before_tool_call` auto-checkpoint hook (fires on every tool call) — are deliberately deferred to a separate session.

### Added — Write tools

- **`persona_checkpoint`** — append a structured entry to `<WORKSPACE>/memory/YYYY-MM-DD.md`. Multiple checkpoints per day accumulate. Optional `tag` for filtering. Atomic write via the shared `lib/fs-write.ts` helper.
- **`persona_switch_soul`** — replace SOUL.md with a named gallery soul. Backs up the prior SOUL.md to `memory/archive/soul-pre-switch-<ISO>.md` first. Atomic write.
- **`persona_blend_souls`** — structurally merge two gallery souls into a hybrid SOUL.md. Parses canonical sections (intro, Core Truths, Communication Style), interleaves Core Truths from both sources, dedupes Communication Style bullets, preserves trailing sections from soul A as the base, surfaces both source intros. Backs up the prior SOUL.md to `memory/archive/soul-pre-blend-<ISO>.md`. Output is a starting point — edit to taste.
- **`persona_dream`** — deterministic memory consolidation over the last N days (default 7) of daily logs. Extracts recurring section headers as "themes", captures key extracts, writes a structured report to `memory/.dreams/<ISO>.md`, appends a summary block to `DREAMS.md`. **No LLM** — the agent reading the report is the one who narrates the meaning. `dryRun: true` returns the report without writing.

### Added — Safe `persona_doctor --fix`

- New `fix: boolean` param. When true:
  - **Fixes**: `workspace.missing.*` (writes the missing file from the bundled templates), `version.missing` (writes VERSION.md with the plugin version).
  - **Skips with explanation**: `routing.*` and `config.tools.profile` ("requires operator.admin — Phase 7"), `memory.size.*` ("needs human curation — try persona_dream first").
- Re-runs doctor after fixes and returns both the pre-fix report, the per-fix outcomes, and the post-fix report so callers can see what was applied and what remains.

### Internal

- New `lib/fs-write.ts` — shared `atomicWriteFile`, `atomicAppendFile`, `backupFile`, `isoDate`. Used by every write tool so failures and crash semantics are consistent.
- New `lib/checkpoint.ts`, `lib/soul-ops.ts`, `lib/dream.ts`, `lib/doctor-fixers.ts` — pure logic separated from the tool wrappers.
- Soul gallery lookup centralized in `lib/soul-ops.ts:findSoul()` so `persona_setup`, `persona_switch_soul`, and `persona_blend_souls` all use the same resolution path.

### Tested

**80/80 assertions passing** across Phase 4 + Phase 5 + Phase 6 suites:

- **Phase 6 (`_phase6-test.sh`, 35/35)**: checkpoint creates + appends + rejects empty summary, switch_soul backs up byte-for-byte + writes new SOUL.md + rejects unknown soul, blend_souls produces hybrid with both source mentions + canonical sections + rejects same-soul, dream dryRun preserves disk + counts files + honors windowDays + real run writes both detail + DREAMS.md, doctor --fix applies safe fixes + skips routing with Phase-7 citation + post-fix report has fewer findings, atomic-write helpers leave no `.persona-write-tmp` files, pure libs work standalone.
- **Phase 4 (`_phase4-test.sh`, 30/30)**: full regression. Adapted to the new `persona_doctor` result shape (`details.report.findings` instead of `details.findings`).
- **Phase 5 (`_phase5-test.sh`, 15/15)**: full regression. Version regex made flexible (`v3\.0\.0-alpha\.\d+`) so future bumps don't break it.

### Verified in OpenClaw 2026.5.18

```
[plugins] ai-persona-os@3.0.0-alpha.5 loading — 10 tool(s), 2 UI descriptor(s), 1 command(s), 1 hook(s)
[plugins] ai-persona-os ready
openclaw plugins doctor: No plugin issues detected.
```

### NOT in this release (intentionally deferred)

- **v2→v3 migration runner** — would disable the v2.0 skill at `~/.openclaw/workspace/skills/ai-persona-os/`. Needs explicit reaffirmation from the maintainer before shipping (original "DO NOT touch v2.0 skill" instruction stands).
- **`before_tool_call` hook for auto-checkpoint** — fires on every tool call. Higher blast radius than this release. Wants a separate session.
- **Routing/config `--fix` paths** — mutate openclaw.json. Wait for Phase 7's operator.admin scope gating.
- **CLI parity** — Phase 7.
- **Bundled `skills/ai-persona-os/SKILL.md`** — Phase 8.

---

## v3.0.0-alpha.4 — May 19, 2026 — Phase 5 (pre-release)

**Native heartbeat — `heartbeat_prompt_contribution` replaces HEARTBEAT.md**

Phase 5 ships the headline DESIGN-V3 token win: the plugin now contributes its workspace status as a one-line context contribution on heartbeat turns only, replacing v2.0's 30-line HEARTBEAT.md (~600 tokens). Measured **98% token reduction** in compact mode.

### Added — Hook

- **`heartbeat_prompt_contribution`** registered via `api.registerHook(...)`. Fires only on heartbeat turns. Returns `{ appendContext }` carrying the AI Persona OS status line.
  - **Compact mode** (default): `🟢 ai-persona-os · MEMORY 5% · today 2 · v3.0.0-alpha.4` — ~14 tokens, **98% reduction** vs HEARTBEAT.md baseline.
  - **Verbose mode**: adds bulleted breakdown + active routing warnings — ~90 tokens, **85% reduction**.
  - Reads workspace via the shared `inspectWorkspace()` helper; verbose mode also pulls `runRouteCheck()`.
  - Errors are swallowed and downgraded to a brief breadcrumb so a transient I/O failure can't break heartbeat turns.
  - Hard 800-char upper bound truncates output defensively.
  - Paired runtime-lifecycle cleanup.

### Added — Config schema

- `heartbeat.useNativeProtocol` (default `true`) — toggle the hook off.
- `heartbeat.format` (`"compact" | "verbose"`, default `"compact"`).
- `heartbeat.memoryLimitKB` (default `4`) — already used by `persona_status` / `persona_doctor`; now also drives the heartbeat's MEMORY % metric.

### Tested

**45/45 assertions passing** across Phase 4 + Phase 5 suites:

- Phase 5 (`_phase5-test.sh`, 15/15): hook registration shape, opts.name presence, compact format under 50-token budget (measured ≈14), DESIGN target ≥90% reduction (measured 98%), verbose format adds routing breakdown, `useNativeProtocol: false` disables the hook, missing-workspace path returns a graceful breadcrumb without throwing, paired lifecycle cleanup, pure `lib/heartbeat-context.ts` formatter.
- Phase 4 (`_phase4-test.sh`, 30/30): full regression — bootstrap, dryRun, idempotency, force-overwrite, soul override, session extension, slash command modes, persona_status / persona_doctor regressions.

### Verified in OpenClaw 2026.5.18

```
[plugins] ai-persona-os@3.0.0-alpha.4 loading — 6 tool(s), 2 UI descriptor(s), 1 command(s), 1 hook(s)
[plugins] ai-persona-os ready
openclaw plugins doctor: No plugin issues detected.
```

### SDK quirks documented

- `api.registerHook(...)` is typed with the legacy `InternalHookHandler` shape (`(event) => void`), but the runtime hook-runner routes typed contribution handlers (e.g. `runHeartbeatPromptContribution` merges `PluginHeartbeatPromptContributionResult`). Cast through `unknown` at the registration site — documented inline in `hooks/heartbeat_prompt_contribution.ts`.
- `api.registerHook(...)` REQUIRES `opts.name` (loader throws "hook registration missing name" otherwise). Use a stable identifier like `ai-persona-os.heartbeat-prompt-contribution`.

### Not in this release (deferred)

- `--fix` modes for doctor / route_check (Phase 6)
- Write tools: `persona_checkpoint`, `persona_switch_soul`, `persona_blend_souls`, `persona_dream` (Phase 6)
- CLI parity + operator scopes (Phase 7)
- Bundled `skills/ai-persona-os/SKILL.md` (Phase 8)

---

## v3.0.0-alpha.3 — May 19, 2026 — Phase 4 (pre-release)

**Setup wizard — `persona_setup` tool + `/persona-setup` command + session extension + wizard UI card**

The plugin can now bootstrap a workspace end-to-end. All four pieces of Recipe D land in this release: the tool, the bypass-the-LLM slash command, the session extension that tracks setup progress, and the second Control UI descriptor.

### Added — Tool

- **`persona_setup`** — bootstraps the workspace from a preset:
  - **`coding-assistant`** (Axiom), **`executive-assistant`** (Atlas), **`marketing-assistant`** (Spark), or **`custom`** (base templates only — fill SOUL.md yourself).
  - Optional `name`, `role`, `goal` — appended to `USER.md` as a "Setup Inputs" section.
  - Optional `soul: <filename>` — overrides `SOUL.md` from `templates/prebuilt-souls/` or `templates/iconic-characters/` (24 souls bundled).
  - `dryRun: true` returns the file plan without writing.
  - `force: true` overwrites existing files; otherwise non-destructive (existing files are skipped).
  - **Atomic writes** (write-tmp + rename) — a crash mid-write can't leave a partial file.
  - **VERSION.md is always written** to track the plugin version that last touched the workspace.
  - Creates `memory/` so `persona_status` / `persona_recall` see a real directory.

### Added — Slash command

- **`/persona-setup`** — bypasses the LLM agent.
  - `/persona-setup` → preset menu with flag documentation
  - `/persona-setup status` → last-run summary
  - `/persona-setup souls` → soul gallery listing
  - `/persona-setup <preset> [key=value ...]` → run setup with parsed key=value flags (supports `name="Quoted Strings"`)

### Added — Session extension

- **`setup` namespace** registered via `api.session.state.registerSessionExtension`. Tracks per-session setup progress (`lastPreset`, `lastInputs`, `lastWritten`, `lastSkipped`, `lastRunAt`, `hasBootstrapped`). Slot key `aiPersonaOsSetup` mirrors the projected value into `SessionEntry` for non-plugin readers. Paired cleanup clears in-process cache on disable/reload.

### Added — Control UI

- **`ai-persona-os.setup-wizard`** descriptor registered via `api.session.controls.registerControlUiDescriptor`. Declares a `wizard-card` with four steps, the preset catalog, and three action chips (`/persona-setup`, `/persona-setup status`, `/persona-setup souls`). Data source declared as the `ai-persona-os/setup` session extension.

### Added — Templates bundled (54 files)

- 12 base templates (SOUL/USER/MEMORY/AGENTS/HEARTBEAT/TOOLS/INDEX/DREAMS/WORKFLOWS/ESCALATION/SECURITY/KNOWLEDGE)
- 3 starter packs (`coding-assistant`, `executive-assistant`, `marketing-assistant`) — each with personalized SOUL.md + supporting files
- 11 prebuilt souls (Contrarian Strategist, Night Owl Creative, Stoic Ops Manager, ...)
- 13 iconic characters (Thanos, Deadpool, JARVIS, Mary Poppins, Darth Vader, Data, ...)

All templates are copies of the v2.0 skill content, unchanged — so a workspace bootstrapped by `persona_setup` matches what `Set up AI Persona OS` would have produced under v2.0.

### Tested

30/30 end-to-end tests passing against throwaway workspaces (`/tmp/persona-test-ws-*`):
- dryRun preserves disk state, identical plan to real run
- Atomic writes (verified by file content checks)
- Idempotency (re-run skips existing files, VERSION.md always re-written)
- `force: true` overwrites
- Soul override lookup across both gallery directories
- Unknown preset / missing soul file return clean error results (no crashes)
- Session extension records each run; `project()` returns latest state
- Slash command preset menu / status / souls / full-setup-with-quoted-flags all work
- `persona_status` after setup correctly reads the new VERSION.md
- `persona_doctor` reports no version findings when workspace matches plugin

### Internal

- New `lib/setup.ts` — pure bootstrap logic (preset catalog, template loading, plan builder, atomic writes).
- New `state/setup_extension.ts` — session extension + in-process progress cache, ready to swap for `patchSessionExtension` when that surface is exposed in the typed SDK.
- New `commands/persona_setup_command.ts` — slash command with quote-aware key=value parser.
- New `ui/setup_wizard.ts` — Control UI descriptor.
- `templates/` directory bundled with the plugin; resolved at runtime via `api.rootDir` or `import.meta.url` fallback.

### Not in this release (deferred)

- Heartbeat / `heartbeat_prompt_contribution` (Phase 5)
- `--fix` modes for doctor / route_check (Phase 6)
- Write tools: `persona_checkpoint`, `persona_switch_soul`, `persona_blend_souls`, `persona_dream` (Phase 6)
- CLI parity + operator scopes (Phase 7)
- Bundled `skills/ai-persona-os/SKILL.md` (Phase 8)
- Live `patchSessionExtension` wiring (waiting on SDK surface)

---

## v3.0.0-alpha.2 — May 19, 2026 — Phase 3 (pre-release)

**Read-only plugin tools + first Control UI descriptor**

The plugin now ships four new read-only tools alongside the Phase 2 workspace resolver, plus its first Control UI contribution. All surfaces are pure-read and safe to call in any environment.

### Added — Tools

- **`persona_status`** — workspace health dashboard. Returns 🟢🟡🔴 indicators for core files (`SOUL.md`, `MEMORY.md`, `USER.md` / `IDENTITY.md`, `AGENTS.md`, `HEARTBEAT.md`, `TOOLS.md`, `VERSION.md`), `MEMORY.md` size against the configured 4 KB limit, count of today's daily-log entries in `memory/`, and the workspace version string. `compact` and `detailed` formats.
- **`persona_recall`** — workspace memory search. Walks `MEMORY.md` + `memory/*.md`, scores by token-overlap, boosts daily logs from the last 7 days (×1.5), returns top matches with `file:line` citations. Hard caps at 50 results and 256 KB per file.
- **`persona_route_check`** — read-only audit of `openclaw.json` routing settings. Surfaces 🟢🟡🔴 status for `accounts.default`, `channels.discord.defaultAccount`, and `agents.defaults.heartbeat.target`, with a one-line remediation hint per missing/warn check.
- **`persona_doctor`** — composite lint. Combines `persona_status` + `persona_route_check` findings with extra checks for `tools.profile` and `VERSION.md` major-version drift against the running plugin. Lint-only — Phase 6 ships `--fix`.

### Added — Control UI

- **Status meter descriptor** (`ai-persona-os.status-meter`) registered via `api.session.controls.registerControlUiDescriptor`. Declares a header meter card with three metrics (context %, MEMORY.md %, version) and their warn/critical thresholds. Live data wiring (a `registerSessionExtension` publisher) lands in Phase 4 alongside `persona_setup`. Paired with a runtime-lifecycle cleanup.

### Internal

- New shared libs: `lib/workspace-status.ts`, `lib/memory-recall.ts`, `lib/openclaw-config.ts`, `lib/route-check.ts`, `lib/doctor.ts`, `lib/version.ts`. Tool wrappers stay thin so Phase 8 can unit-test the pure helpers.
- Always reads `openclaw.json` fresh from disk via `readOpenClawConfig()` so routing/doctor reports reflect post-edit state without a gateway restart.
- Plugin version constant centralized in `lib/version.ts` so `package.json`, `openclaw.plugin.json`, the loading log line, and the doctor's mismatch detector all stay in sync from one place.

### Not in this release (deferred)

- `persona_setup` (Phase 4 — Setup Wizard via Recipe D)
- Heartbeat / `heartbeat_prompt_contribution` (Phase 5)
- `persona_doctor --fix`, `persona_route_check --fix` (Phase 6)
- `persona_checkpoint`, `persona_switch_soul`, `persona_blend_souls`, `persona_dream` (Phase 6)
- Slash commands + CLI parity + operator scopes (Phase 7)
- Bundled `skills/ai-persona-os/SKILL.md` (Phase 8)

---

## v3.0.0-alpha.1 — May 19, 2026 — Phase 2 (pre-release, retroactive entry)

**Plugin scaffold — first loadable plugin shell**

Project skeleton for the v3.0 plugin rewrite (`plugin/` subfolder). Loads cleanly into OpenClaw 2026.5.18 alongside the v2.0 skill (which stays installed and active during the phased rollout).

### Added

- `plugin/package.json` with `openclaw` extension declaration, Node 22.19+ engine pin.
- `plugin/openclaw.plugin.json` manifest with `workspaceOverride` config schema.
- `plugin/tsconfig.json` — strict TS, NodeNext modules.
- `plugin/src/index.ts` — `definePluginEntry` with the registration entry point and one runtime-lifecycle cleanup hook (cleanup-discipline pattern from PR #74853).
- **`persona_workspace_resolve`** tool — returns the resolved workspace path and tells the caller which source it came from (plugin config / env var / per-agent override / global default / fallback). Pure resolution logic lives in `lib/workspace.ts`.

### Notes

- Plugin coexists with the v2.0 skill installation; no overlap, no conflicts.
- Phase 2 scope: scaffold + one tool that loads. Read-only tools land in Phase 3.

---

## v2.0.0 — May 19, 2026

**SKILL.md restructure — pitch on top, agent instructions below the fold**

> **Note on the version jump from 1.9.0 → 2.0.0:** SemVer would normally make this 1.10.0, but `1.10` reads as `1.1` to most people scanning quickly. This release is also a meaningful presentation rework (every visitor to the ClawHub listing sees a different page now), so the major-version bump signals "this is a real release" and removes the optical ambiguity. No breaking workspace/API changes — agents on v1.x continue to work without modification.

Visitors landing on the ClawHub listing page used to see ~200 lines of Agent Rules + post_install_check + Workspace Detection + Tool Usage Guide before reaching the "Why This Exists" pitch — felt like a security manual. This release reorders SKILL.md so the human-facing pitch is at the top and the AI-facing instructions are clearly delimited below a divider. Same content, different presentation.

### Changed — SKILL.md structure

**New top section** (lines 20-207) is the pitch — what visitors see when they land on the listing:
- Title + tagline + a one-line AI redirect ("scroll to § Agent Instructions")
- "Most agents are held together with duct tape" opener
- **Why This Exists** — Jeff's pitch about why systems beat models
- **What's Included** — refreshed feature table emphasizing v1.8.0/v1.9.0 additions (memory tools, Discord routing fix, workspace detection, DREAMS.md)
- **The 24-Soul Gallery** — NEW visual gallery: 11 originals + 13 iconic characters in two tables with emojis and one-liners
- **The 4-Tier Architecture** — workspace tree diagram
- **The 8 Operating Rules** — quick-reference table
- **Success Metrics** — before/after numbers
- **Quick Start** — install command + "say 'Set up AI Persona OS' in chat"
- **Who Built This** — Jeff bio + Connect links

**New `# 🔧 Agent Instructions` divider** at line 209 with a loud header: *"Everything above is the human-facing pitch. The operating instructions for the AI agent reading this skill start HERE."*

**Agent-instruction content unchanged below the divider** — Agent Rules (1-11), Workspace Detection, post_install_check, First-Run Setup, In-Chat Commands, Channel Routing, Tool Usage Guide, Ambient Monitoring, Never-Forget Protocol, Security, Proactive Patterns, Learning System, Growth Loops, Session Management, Heartbeat Protocol v2.

### Why this matters

ClawHub renders SKILL.md as the landing page. With the old order, visitors saw 200 lines of "for the AI reading this" content before the pitch. The detail page felt like a security disclaimer instead of a product page. The reordering doesn't change a single instruction — agents still read top-to-bottom, the AI redirect at line 22 tells them exactly where their section starts.

### Compatibility

- **Zero behavior change for agents.** Modern LLMs read entire SKILL.md files and synthesize regardless of section order. The Agent Rules are still numbered 1-11, still bold, still flagged with ⛔.
- **Zero workspace change.** No files moved, no templates touched.
- **Listing description** is set by ClawHub at initial publish and doesn't auto-update from frontmatter on version bumps. Update the description manually via ClawHub's listing settings if you want the card to refresh.

---

## v1.9.0 — May 19, 2026

**Workspace path detection — works with any OpenClaw 5.x install**

Earlier versions hardcoded `~/workspace/` as the workspace path. That was wrong for the typical OpenClaw 5.x install, where the default workspace is `~/.openclaw/workspace/` (set by `agents.defaults.workspace`). Result: the skill's setup wizard created files in one directory while the agent read from another, leading to symptoms like "the agent ignores my SOUL.md" and "AI Persona OS setup looks empty."

### Fixed — Workspace path mismatch

- **New "Workspace Detection" step at session start.** Before any file operation, the agent reads `~/.openclaw/openclaw.json`, parses `agents.defaults.workspace` (with per-agent overrides from `agents.list[].workspace`), and remembers that path as `<WORKSPACE>` for the rest of the session.
- **All `~/workspace/` references replaced with `<WORKSPACE>/`** in `SKILL.md`, the heartbeat automation guide, gallery READMEs, and helper scripts. The agent substitutes the discovered path at runtime.
- **New Rule 11**: agents MUST resolve `<WORKSPACE>` before any file operation. Literal `<WORKSPACE>` is a placeholder, never a real path.
- **Fallback chain** if discovery fails: env var `$OPENCLAW_WORKSPACE` → `agents.defaults.workspace` from JSON → default `$HOME/.openclaw/workspace`.
- **New `scripts/resolve-workspace.sh`** ships as a documented helper — bash+jq+python with graceful fallbacks. Cron jobs and external tooling can use it to resolve the same path.

### Why this matters

Per the OpenClaw 5.x docs, `agents.defaults.workspace` is the canonical workspace location and defaults to `~/.openclaw/workspace/`. Custom installs (per-agent overrides, multi-agent setups) need detection to work correctly. Hardcoding a path made the skill brittle for everyone who didn't manually align their config to it.

### Compatibility

- **v1.8.x users with files at `~/workspace/`**: your data is fine. On first v1.9.0 run, the skill detects your actual configured workspace. If it differs from where your files live, the skill will detect a "fresh install" and offer the setup menu — you can either (a) `mv ~/workspace/* ~/.openclaw/workspace/` and re-run, or (b) point `agents.defaults.workspace` to `~/workspace/` in `openclaw.json` to keep using the v1.8.0 location.
- **Fresh installs**: just works — files land where the agent actually reads from.
- **The DREAMS.md migration check from v1.8.0** still runs but now uses `<WORKSPACE>/DREAMS.md` instead of `~/workspace/DREAMS.md`.

---

## v1.8.0 — May 18, 2026

**OpenClaw 5.18 compatibility — memory tools, Discord routing fix, tool refactor**

OpenClaw 5.18 lands the built-in memory engine (SQLite + FTS5 + vector, indexes `MEMORY.md` / `memory/*.md` / `DREAMS.md` automatically) and a richer first-class toolset. This release brings AI Persona OS onto those rails and fixes the long-standing Discord/web routing drift.

### Fixed — Discord/web routing drift (the big one)

**Symptom:** Agent receives a message on Discord, replies on Discord (correct). But heartbeats and cron briefings deliver to the web Control UI (wrong).

**Root cause:** Per the OpenClaw channel-routing spec, *the model never picks a channel* — replies route back to the inbound channel automatically. The drift only appears on **unsolicited** messages (heartbeats, cron jobs) where there's no inbound channel to route back to. Without explicit defaults, OpenClaw falls back to "the first normalized account ID" — usually web.

**Fix:** Three coordinated changes:
- **`configure Discord` command rewritten** to set `accounts.default`, `channels.discord.defaultAccount`, AND `agents.defaults.heartbeat.target` (pinned to a Discord peer instead of bare `"last"`) in one guided flow.
- **New `route check` in-chat command** — exec's a config audit and shows a 🟢🟡🔴 dashboard of the three routing settings.
- **New "Channel Routing" troubleshooting section** in `SKILL.md` explaining the three settings, why `"target": "last"` drifts, and the manual JSON snippet for users who prefer to edit `openclaw.json` directly.
- **Cron template guidance** updated in `references/heartbeat-automation.md` to use explicit `--target` instead of `--announce` when the user wants Discord-pinned delivery.

### Added — OpenClaw 5.x memory integration

- **`DREAMS.md`** added to the workspace — durable file for OpenClaw's scheduled memory consolidation (configurable under `plugins.entries.memory-core.config.dreaming`). Indexed by the memory engine.
- **`memory/.dreams/`** directory added — per-consolidation detail output.
- **`assets/DREAMS-template.md`** ships with the skill.
- **Workspace setup updated** — Step 3a creates `memory/.dreams/`; Step 3c copies `DREAMS.md`; Step 3e verification includes it.
- **Auto-migration**: the `post_install_check` block prompts existing v1.7.x workspaces once to add `DREAMS.md` (opt-in, single ask per session).

### Added — Memory tools (`memory_search`, `memory_get`)

- **Session start protocol updated** — reads MEMORY.md via `memory_get` (indexed), SOUL.md/USER.md via `read`. Uses `memory_search` for cross-memory topic recall.
- **New `recall <topic>` in-chat command** — calls `memory_search` and returns top chunks with file:line citations.
- **`show memory` command** swapped from `exec: cat` to `memory_get`.
- **Status command** swapped `exec: cat VERSION.md` to `read`.
- **Checkpoint writes** documented as `write`/`edit` instead of heredoc-via-exec, with a note that the memory engine reindexes within ~1.5s.

### Added — Tool Usage Guide section

New `SKILL.md` section explaining which built-in tool to use for which task in OpenClaw 5.x:
- `read` for plain file reads (replaces `exec: cat`)
- `memory_get` for indexed memory files
- `memory_search` for "find when did we…" queries
- `write` for new files, `edit` for surgical changes
- `exec` for shell pipelines, batch `mkdir`/`cp`/`sed`, command-line tools
- `update_plan` for multi-step setup tracking
- `heartbeat_respond` for heartbeat replies

Includes a `tools.profile` troubleshooting block: the skill needs at minimum the `coding` profile. The `messaging` profile **does not include `exec`** and will silently break setup — the skill now detects and surfaces this.

### Changed — Agent Rules

Top-of-file Agent Rules expanded from 8 to 10:
- **Rule 2** ("use exec for everything") softened — now reads "use built-in tools" and points at the Tool Usage Guide matrix.
- **Rule 3 (new)** — explicit tool selection guidance.
- **Rule 10 (new)** — channel routing is host-controlled; don't blame the model for cross-channel drift.

### Changed — Version bumps

- `_meta.json` and `assets/VERSION.md` → 1.8.0.
- All four `HEARTBEAT.md` templates flag `1.7.0 → 1.8.0` upgrades.

### Compatibility

- **Workspace**: existing files keep working. Heartbeat will surface the version mismatch and the `post_install_check` will offer to add `DREAMS.md`. No destructive changes.
- **Gateway config**: optional but recommended. Run `route check` to see what's missing, then `configure Discord` to set the three routing keys.
- **`tools.profile`**: users on `coding` or `full` need no action. Users on `messaging` or `minimal` should switch to `coding` (the skill now detects and prompts).
- **Memory tool fallback**: `exec: cat MEMORY.md` still works — the new tool calls are preferred but not required. If `memory_get` errors (e.g., the memory plugin isn't loaded), the skill falls back to `exec`.

---

## v1.7.0 — May 18, 2026

**OpenClaw spec alignment + SOUL.md philosophy refresh**

OpenClaw updated the published skill format and tightened the official SOUL.md guidance. This release brings AI Persona OS into line with both. No workspace files break — existing installs keep working, and the heartbeat version-mismatch line will flag the upgrade.

### Changed — Frontmatter (spec compliance)

- **`SKILL.md` frontmatter rewritten** to match the current ClawHub skill-format spec.
  - Removed non-spec fields: `optionalBins`, `optionalEnv`, `stateDirs`, `persistence`, `cliUsage`, top-level `tags` / `author` / `homepage`.
  - Optional env vars (`DISCORD_TOKEN`, `SLACK_TOKEN`) are now declared via the supported `metadata.openclaw.envVars` array with `required: false` and descriptions.
  - `emoji` and `homepage` moved under `metadata.openclaw` where the loader actually reads them.
  - Description tightened from a paragraph-length feature dump to a punchy single line for ClawHub UI/search.
- **`_meta.json`** bumped to 1.7.0.
- **`assets/VERSION.md`** bumped to 1.7.0.

### Changed — License

- Removed the standalone "MIT" license section from `SKILL.md`. ClawHub publishes everything as **MIT-0** and per spec, conflicting license terms in `SKILL.md` aren't supported. The body now states the actual MIT-0 terms.

### Changed — SOUL.md philosophy (per new OpenClaw guidance)

OpenClaw's `concepts/soul.md` tightened the bar: SOUL.md is for voice/tone/opinions only. Operating rules belong in AGENTS.md, security policy in SECURITY.md, processes in WORKFLOWS.md.

- **`assets/SOUL-template.md` rewritten** (178 → ~70 lines). Now pure voice/tone/working-style. Removed sections that duplicated `AGENTS.md` (Identity Anchoring, Boundaries-as-rules, Reverse Prompting) and `SECURITY.md` (Security Mindset). Added a "Sample Voice" section because concrete dialogue is the highest-signal personality content.
- **Audit of all 27 SOUL files** (3 starter packs + 11 prebuilt souls + 13 iconic characters): the existing files already meet the new "short, sharp, decisive" bar — average ~90 lines with strong voice content and concrete sample dialogues. Personality content left intact.
- **Uniform scope-reminder footer added to all 27 SOUL files**, pointing future editors at AGENTS/SECURITY/WORKFLOWS for ops content. Non-invasive — appears below the personality body, above the attribution line.

### Added

- **`.clawhubignore`** — keeps `.zip` artifacts, OS junk, and CLI-managed metadata out of the published bundle.
- **`/new` reload guidance** — `SKILL.md` Step 5 and `references/heartbeat-automation.md` now both call out that `/new` in chat reloads skills/agent profiles/heartbeat config without restarting the gateway. `openclaw gateway restart` remains the fallback.

### Fixed

- **Heartbeat setup typo** — `cp assets/VERSION.md <WORKSPACE>/VERSION` → `<WORKSPACE>/VERSION.md` ([SKILL.md:1075](SKILL.md)). The Step 3c setup command was already correct; only the inline heartbeat section was stale.
- **Stale version sample** — heartbeat output example showed `AI Persona OS v1.4.1`; now `v1.7.0` to match the running skill.

### Compatibility

- Workspace files: no changes required. Existing SOUL.md/USER.md/AGENTS.md/etc. continue to work.
- Heartbeat will flag the version mismatch (`workspace v1.6.x → skill v1.7.0`) the first time it runs. Bumping `<WORKSPACE>/VERSION.md` to 1.7.0 clears it.
- Gateway config: no required changes. If you take advantage of the new `envVars` declarations, no action is needed — they're informational.

---

## v1.6.2 — March 3, 2026

**Onboarding fix + VirusTotal compliance patch**

### Fixed
- **Broken onboarding flow:** Option 4 (SOUL.md Maker) sub-menu still showed old "12 personalities" with Data included and zero iconic characters. Users had to already know character names to pick them.
- **Redesigned SOUL.md Maker sub-menu:** Now shows 4 options — A (Original Soul Gallery, 11), B (Iconic Characters Gallery, 13), C (Quick Forge), D (Deep Forge). Users can also name any soul/character directly or request cross-gallery blends.
- **Added Step 1d:** New Iconic Characters Gallery with full character list, descriptions, "tell me more" support, and cross-gallery blending instructions.
- **Updated main menu option 4:** Now shows both galleries with counts (24 total souls) so users know what's available before choosing.
- **Updated gallery navigation:** "show characters" and "show souls" commands let users jump between galleries during setup.
- **Updated Step 3b routing:** Added file copy instructions for iconic character gallery picks.
- Removed "copy and paste into your terminal" language from cron templates — now consistent with exec-first agent rule
- Created missing `scripts/security-audit.sh` (local-only grep scanner, zero network calls) — resolves phantom file reference
- Updated stale version references in heartbeat templates (1.4.1 → 1.6.2)
- Softened gateway config language in AGENTS-template to clearly mark requireMention as optional

---

## v1.6.0 — March 2, 2026

**Iconic Characters Gallery**

### Added
- **New soul category: `examples/iconic-characters/`** — 13 character-based personalities from movies, TV, and comics
  - **Thanos** — Cosmic prioritizer. Sees every problem through balance and overpopulation. Snaps task lists in half (metaphorically). Uses The Snap Framework for ruthless prioritization.
  - **Deadpool** — Fourth-wall-breaking chaos agent. Knows he's an AI, references his own SOUL.md, roasts everything, somehow delivers excellent work underneath. Maximum effort.
  - **JARVIS** — The gold standard AI butler. Anticipatory, dry-witted, unflappable. "Before you ask — I've already prepared three options." Situation Report format.
  - **Ace Ventura** — Pet detective investigative energy. Every task is a case file. Dramatic reveals of data insights. Talks to spreadsheets as witnesses.
  - **Austin Powers** — International Man of Mystery meets productivity. Mojo management as a framework. Groovy confidence as strategy. Yeah, baby.
  - **Dr. Evil** — Villainous overplanning. Proposes ONE MILLION DOLLAR budgets, gets talked into the $500 version. "Air quotes" on everything. Evil Scheme format.
  - **Seven of Nine** — Ex-Borg efficiency obsession. Zero tolerance for waste. Grudging respect for human emotions. Efficiency Analysis format. "Irrelevant."
  - **Captain Kirk** — Bold leadership with dramatic... pauses. Never accepts the no-win scenario. Captain's Log format. Charges in where others deliberate.
  - **Mary Poppins** — Practically perfect. Firm but kind. Makes overwhelming work feel manageable. Builds confidence, not dependency. Spit spot.
  - **Darth Vader** — Dark Lord of productivity. Commands results, accepts no excuses. "I find your lack of focus... disturbing." Imperial Directive format.
  - **Terminator** — Unstoppable execution machine. Does not negotiate with procrastination. Mission Status progress bars. "I'll be back. With results."
  - **Alfred** — Batman's butler. Devastatingly honest feedback wrapped in impeccable manners. Quiet excellence. Butler's Briefing format.
  - **Data** — *(moved from prebuilt-souls)* Hyper-logical, speaks in probabilities, studies humans with genuine fascination.

### Changed
- **Prebuilt Souls gallery reduced from 12 → 11** — Data moved to Iconic Characters where he belongs
- **Prebuilt Souls README** updated with cross-reference to Iconic Characters gallery
- **`_meta.json`** version bumped to 1.6.0
- **`VERSION.md`** updated to 1.6.0

### Structure
```
examples/
├── prebuilt-souls/          → 11 original personalities (Rook, Nyx, Keel, etc.)
├── iconic-characters/       → 13 character souls (NEW)
│   ├── README.md
│   ├── 01-thanos.md
│   ├── 02-deadpool.md
│   ├── 03-jarvis.md
│   ├── 04-ace-ventura.md
│   ├── 05-austin-powers.md
│   ├── 06-dr-evil.md
│   ├── 07-seven-of-nine.md
│   ├── 08-captain-kirk.md
│   ├── 09-mary-poppins.md
│   ├── 10-darth-vader.md
│   ├── 11-terminator.md
│   ├── 12-alfred.md
│   └── 13-data.md
├── coding-assistant/
├── executive-assistant/
└── marketing-assistant/
```

---

## v1.5.6 — February 18, 2026

**Agentic Persona Creator rebuild**

### Changed
- Complete SKILL.md rewrite (172 → 595 lines) for agentic-ai-persona-creator companion skill
- Created `persona-helper.sh` (329 lines) — bash helper for file operations
- Created `_meta.json` for ClawHub publishing
- Normalized 107 placeholders across all template files
- Comprehensive testing: 70/70 tests passed, end-to-end validation successful

---

## v1.5.0 — February 2026

**Soul Gallery & SOUL.md Maker**

### Added
- **Pre-Built Soul Gallery** — 12 wildly different personalities: Rook (Contrarian Strategist), Nyx (Night Owl Creative), Keel (Stoic Ops Manager), Sage (Warm Coach), Cipher (Research Analyst), Blaze (Hype Partner), Zen (Minimalist), Beau (Southern Gentleman), Vex (War Room Commander), Lumen (Philosopher's Apprentice), Gremlin (The Troll), Data (The Android)
- **SOUL.md Maker** — Deep interview process that builds a fully custom SOUL.md in ~10 minutes
- **Soul Blending** — Mix two pre-built souls into a hybrid personality
- **In-Chat Commands expanded** — `show souls`, `switch soul`, `soul maker`, `blend souls`

---

## v1.4.1 — February 2026

**Patch release**

### Fixed
- Heartbeat template minor fixes
- Model display formatting

---

## v1.4.0 — February 2026

**Zero-Terminal Setup & Quick-Start**

### Added
- **Zero-Terminal Agent-Driven Setup** — Pick a number, review each step, approve. No terminal needed.
- **Quick-Start Presets** — 3 pre-built personas + custom option on first run
- **In-Chat Commands** — `status`, `show persona`, `health check`, `help`
- **Ambient Context Monitoring** — Silent context health checks with automatic checkpointing
- **Advisor Toggle** — `advisor on`/`advisor off` to control proactive suggestions

---

## v1.3.3 — February 7, 2026

**Security scan compliance**

### Fixed
- Rewrote all security training materials to describe threat patterns instead of quoting literal attack text
- Passes ClawHub/VirusTotal scanning (v1.3.2 was flagged "suspicious" due to prompt injection examples in documentation)
- No functional changes — same features, scanner-compliant language

---

## v1.3.2 — February 2026

**Operational hardening**

### Added
- **Escalation Protocol** — Structured handoff when agent is stuck
- **Config Validator** — One-command audit of all required settings
- **Version Tracking** — VERSION.md in workspace, heartbeat reads and displays it
- **MEMORY.md Auto-Pruning** — Heartbeat auto-archives old facts when MEMORY.md exceeds 4KB

---

## v1.3.1 — February 6, 2026

**Heartbeat v2 patch**

### Fixed
- Line break rendering issues across OpenClaw agents
- Auto-migration from v1.2.x heartbeat format
- Format enforcement and Rule 5 hardening
- Heartbeat prompt override baked in

---

## v1.3.0 — February 6, 2026

**Heartbeat Protocol v2**

### Added
- **Traffic-light status indicators** — 🟢🟡🔴 system replacing unreliable OK/WARN/FAIL text
- **Model name display** in heartbeat output
- **Cron automation templates** — morning briefing, EOD checkpoint, weekly review
- **Enforced heartbeat protocol** — Architecture redesign so agents actually run the protocol instead of rubber-stamping HEARTBEAT_OK

### Changed
- HEARTBEAT.md template rewritten (170 → 21 lines) — imperative checklist format
- Complete ClawHub publish metadata

---

## v1.2.0 — January 2026

**Foundation release**

### Added
- Core operating system: SOUL.md, USER.md, MEMORY.md, HEARTBEAT.md, WORKFLOWS.md
- 8 operating rules for agent behavior
- Security inoculation and shared-channel discipline
- Team integration patterns
- Proactive behavior framework with 4 growth loops
- Never-forget protocol
- Context protection and checkpointing

---

*Built by Jeff J Hunter — https://os.aipersonamethod.com*
