# AI Persona OS v3.0 — Session Checkpoint

> **For the next Claude Code session.** Read this top-to-bottom before doing anything. It captures exact paths, environment quirks, what's already working, gotchas hit, and what the next phase needs to deliver.

**Last updated:** 2026-05-19, end of Phase 6 (partial — deferred items called out)
**Author of this checkpoint:** Claude (Opus 4.7)
**Next phase:** Phase 6 finish OR Phase 7 — see § Deferred items below. The maintainer's call.

## Status snapshot

| Phase | Status | Release |
|-------|--------|---------|
| 1. Research + design | ✅ done | DESIGN-V3.md committed |
| 2. Scaffold | ✅ done | v3.0.0-alpha.1 |
| 3. Read-only tools + first UI | ✅ done | v3.0.0-alpha.2 |
| 4. Setup wizard | ✅ done | v3.0.0-alpha.3 |
| 5. Hooks + native heartbeat | ✅ done | v3.0.0-alpha.4 |
| 6. Write tools + safe `--fix` (this checkpoint) | ✅ partial | v3.0.0-alpha.5 |
| 6 deferred: migration runner + before_tool_call hook | ⏸ awaits decision | — |
| 7. CLI + operator scopes | — | — |
| 8. Tests + docs + ship | — | — |

**What's loaded in the user's gateway right now:**
```
[plugins] ai-persona-os@3.0.0-alpha.5 loading — 10 tool(s), 2 UI descriptor(s), 1 command(s), 1 hook(s)
[plugins] ai-persona-os ready
openclaw plugins doctor: No plugin issues detected.
```

**Ten tools**: `persona_workspace_resolve`, `persona_status`, `persona_recall`, `persona_route_check`, `persona_doctor` (+`--fix`), `persona_setup`, `persona_checkpoint`, `persona_switch_soul`, `persona_blend_souls`, `persona_dream`. Two UI descriptors: `ai-persona-os.status-meter`, `ai-persona-os.setup-wizard`. One slash command: `/persona-setup`. One session extension namespace: `setup`. One hook: `heartbeat_prompt_contribution` (98% token reduction vs HEARTBEAT.md).

## Test infrastructure (use these — they work)

Four test scripts at `C:\Users\heroi\Claude Code\AI Persona OS\`:

- **`_smoke-test.sh`** — registers a fake plugin API, loads the built plugin, exercises every tool against the user's real workspace. Good for "does the plugin still load?" after a change.
- **`_phase4-test.sh`** (30) — `persona_setup` against throwaway workspaces. dryRun, idempotency, force-overwrite, soul override, error paths, session extension state, slash command parsing.
- **`_phase5-test.sh`** (15) — heartbeat hook. Registration shape, compact/verbose formats, token budget (98% reduction verified), useNativeProtocol disable, missing-workspace graceful path, lifecycle cleanup, pure formatter.
- **`_phase6-test.sh`** (35) — write tools + doctor --fix. Checkpoint creates+appends, switch_soul backs up byte-for-byte, blend_souls merges canonical sections, dream walks N-day window, doctor --fix applies safe fixes + skips routing with Phase-7 citation, atomic-write helpers leave no .tmp files, pure libs work standalone.

**Combined: 80/80 passing as of alpha.5 ship.**

Tests read `PLUGIN_VERSION` dynamically — bumping `lib/version.ts` doesn't break them. Version regexes use `v3\.0\.0-alpha\.\d+` to stay flexible across bumps.

Both run via:
```bash
wsl -d Ubuntu-24.04 -- bash -lc 'cp "/mnt/c/Users/heroi/Claude Code/AI Persona OS/<script>.sh" ~/<script>.sh && chmod +x ~/<script>.sh && ~/<script>.sh'
```

Add new tests by extending `_phase4-test.sh` — its harness (fake API, kvp parser, ok()/bad() helpers) is reusable.

## Deferred items (need explicit go-ahead)

Two Phase 6 items were intentionally NOT shipped in alpha.5. They need explicit reaffirmation from the maintainer before they land:

### 1. v2→v3 migration runner

Would detect the v2.0 skill at `~/.openclaw/workspace/skills/ai-persona-os/`, prompt once, write `skills.entries.ai-persona-os.enabled = false` to disable it. Per DESIGN-V3 § Migration.

**Why deferred:** The maintainer's original session prompt said "DO NOT touch the v2.0 skill at `~/.openclaw/workspace/skills/ai-persona-os/` — leave it alone." That instruction is still load-bearing. The migration runner explicitly conflicts with it. Ship requires either lifting the instruction, scoping it to "don't modify directly, but the migration runner may prompt + disable on user consent", or deferring until Phase 8 (per DESIGN's original phasing).

### 2. `before_tool_call` hook for context-pressure auto-checkpoint

Would fire on every tool call. At ≥70% context, calls `persona_checkpoint` automatically.

**Why deferred:** Fires on every tool call across every plugin in the gateway. A bug here breaks every interaction, not just heartbeats. Higher blast radius than alpha.4's heartbeat hook (which only fires on heartbeat turns, and the maintainer's heartbeat target isn't even configured). Wants a separate, focused session.

### 3. Routing/config `--fix` paths

Doctor and route_check both have `--fix` shaped for the workspace-only case. Mutating openclaw.json is the next step but should wait for Phase 7's `operator.admin` scope gating per DESIGN-V3 § Audit Update.

## What Phase 7 needs to deliver

Per DESIGN-V3.md § Audit Update + the Phase 7 row:

1. **CLI registrar** — `api.registerCli(...)` exposing `openclaw persona <subcommand>` for every tool. JSON mode (`--json`) for scripting. Reuse the same library code paths as the tools (the libs under `lib/` already export pure functions).

2. **Operator scope gating** — `api.session.controls.registerSessionAction` for destructive paths. `requiredScopes: ["operator.admin"]` on routing/config `--fix`, `persona_switch_soul`, `persona_blend_souls`. Per the audit update at DESIGN-V3.md § "Operator scope gating".

3. **Scoped slash commands** — promote `/persona-setup` to the full `/persona <subcommand>` family. Each command has `requiredScopes`.

4. **Once scope gating is in place** — re-enable the routing/config `--fix` paths that alpha.5 deliberately skipped. Tests already verify the skip message references "Phase 7" + "operator.admin" — that wiring is ready to flip on.

### Pattern carryover from Phases 5–6

- New hooks register via `api.registerHook(name, handler, { name: "ai-persona-os.<id>" })`. The `opts.name` is REQUIRED — loader throws "hook registration missing name" otherwise.
- Cast typed contribution handlers through `unknown` to satisfy `InternalHookHandler`. See `hooks/heartbeat_prompt_contribution.ts:registerHeartbeatHook` for the documented cast.
- Every register* gets a paired `registerRuntimeLifecycle`.
- Atomic writes through `lib/fs-write.ts:atomicWriteFile` / `atomicAppendFile`. Backup-before-overwrite through `backupFile(workspace, srcAbs, prefix, now?)` — drops the prior version into `memory/archive/<prefix>-<ISO>.md`.
- Soul gallery lookup: `lib/soul-ops.ts:findSoul(templatesRoot, filename)` — tries `prebuilt-souls/` then `iconic-characters/`. Phase 7 CLI commands should reuse this.

### Things NOT to do in Phase 7

- ❌ Don't touch the v2.0 skill — same instruction as always until the maintainer lifts it.
- ❌ Don't add the `before_tool_call` auto-checkpoint hook — that's a separate, focused session.
- ❌ Don't ship the migration runner — needs explicit maintainer go-ahead.
- ❌ Don't try to wire `patchSessionExtension` from the typed SDK surface unless it's been exposed.

## Patterns established (carry forward)

- **Every `register*` paired with a `registerRuntimeLifecycle`** — see `ui/status_meter.ts`, `ui/setup_wizard.ts`, `state/setup_extension.ts`. Phase 5 hook registrations should follow the same pattern.
- **Pure libs under `lib/`, thin wrappers in `tools/` / `commands/` / `ui/` / `state/` / `hooks/`** — so unit tests don't need a plugin runtime.
- **Plugin version centralized in `lib/version.ts`** — bump it once when tagging; the value flows into the log line, doctor's mismatch detector, VERSION.md writes, and the manifest.
- **`PluginJsonValue` typing** — annotate config-shape objects with `PluginJsonValue` so TS doesn't widen them. `as const` will fail (readonly arrays don't satisfy the recursive union).
- **`sessionEntrySlotKey` must be a plain identifier** (camelCase, no dashes/dots) — gateway diag rejected `"ai-persona-os.setup"`, accepted `"aiPersonaOsSetup"`.
- **Atomic writes** = write to `.persona-setup-tmp` then `fs.rename`. See `lib/setup.ts:atomicWrite`. Any future writer (`persona_checkpoint`, etc.) should do the same.

## Files Phase 7 will likely touch

- New: `plugin/src/cli/index.ts` — `registerCli` entry, exposes `openclaw persona <subcommand>`
- New: `plugin/src/cli/persona_setup.ts`, `persona_status.ts`, `persona_recall.ts`, `persona_route_check.ts`, `persona_doctor.ts`, `persona_checkpoint.ts`, `persona_switch_soul.ts`, `persona_blend_souls.ts`, `persona_dream.ts` — thin commander/yargs wrappers around the existing `lib/` functions. Each adds `--json` mode.
- New: `plugin/src/actions/*.ts` — session-action registrations for destructive paths, with `requiredScopes: ["operator.admin"]`
- Modify: `plugin/src/commands/persona_setup_command.ts` — add `requiredScopes` to the existing slash command + register more under the `/persona <verb>` namespace
- Modify: `plugin/src/tools/persona_doctor.ts` — wire the routing fixers behind the new scope gate
- Modify: `plugin/src/tools/persona_route_check.ts` — add `fix: boolean`, gate via scope
- Modify: `plugin/src/lib/version.ts` — bump to alpha.6
- Extend: `_phase7-test.sh` — CLI invocation tests + scope-gating tests

## Files Phase 6-finish (migration + before_tool_call) will touch

Only when the maintainer says go:

- New: `plugin/src/migrations/v2_to_v3.ts` + `index.ts` (via `api.registerMigrationProvider`)
- New: `plugin/src/hooks/before_tool_call.ts` — context-threshold auto-checkpoint. Reuse `lib/checkpoint.ts:writeCheckpoint`.
- Modify: `plugin/src/index.ts` — register both

---

---

## Project context

- **GitHub repo:** https://github.com/jeffjhunter/ai-persona-os (public, MIT-0)
- **Tracking issue:** https://github.com/jeffjhunter/ai-persona-os/issues/1
- **Design doc:** [DESIGN-V3.md](./DESIGN-V3.md) — read this AND the § Audit Update section before writing any code
- **CHANGELOG:** [CHANGELOG.md](./CHANGELOG.md) — full version history
- **Latest releases:**
  - `v2.0.0` — skill (Latest, production)
  - `v3.0.0-alpha.1` — plugin scaffold (Pre-release)

## User's environment (exact paths)

| Thing | Where |
|-------|-------|
| Windows host | `C:\Users\heroi\` |
| Git repo (Windows) | `C:\Users\heroi\Claude Code\AI Persona OS\ai-persona-os-1.6.2\` |
| WSL distro | `Ubuntu-24.04` (systemd is PID 1, linger enabled) |
| WSL home | `/home/heroic/` |
| OpenClaw install | `/home/heroic/.nvm/versions/node/v24.15.0/lib/node_modules/openclaw/` |
| OpenClaw CLI | `/home/heroic/.nvm/versions/node/v24.15.0/bin/openclaw` (NOT on `$PATH` in non-login shells) |
| OpenClaw version | `2026.5.18` |
| Node version | `24.15.0` via NVM |
| Plugin staging | `/home/heroic/dev/ai-persona-os-plugin/` (rsync target, NOT a symlink) |
| User's agent workspace | `/home/heroic/.openclaw/workspace/` (NOT `~/workspace/`) |
| Gateway port | `127.0.0.1:18789` |
| Gateway service | `systemctl --user openclaw-gateway` |
| Docker | `docker.io 29.1.3` installed in WSL (NOT Docker Desktop) |
| Sandbox image | `openclaw-sandbox:bookworm-slim` (built locally from openclaw repo Dockerfile) |
| Auto-start | Windows scheduled task `OpenClaw WSL Autostart` wakes WSL at logon; systemd boots Docker + user services |

## Current state of the plugin

**Source location (the git repo):** `plugin/` subfolder
**Runtime location (installed in OpenClaw):** `~/dev/ai-persona-os-plugin/` (linked, NOT copied)

Verified working in OpenClaw 2026.5.18:

```
$ openclaw plugins inspect ai-persona-os
Status: loaded
Version: 3.0.0-alpha.1
Source: ~/dev/ai-persona-os-plugin/dist/index.js

$ openclaw plugins doctor
No plugin issues detected.

$ journalctl --user -u openclaw-gateway | grep ai-persona-os
[plugins] ai-persona-os@3.0.0-alpha.1 loading — registering 1 tool(s)
[plugins] ai-persona-os ready
[gateway] http server listening (10 plugins: ai-persona-os, ...)
```

### Files in `plugin/`

```
plugin/
├── package.json                              ← npm metadata, openclaw extension, Node 22.19+
├── package-lock.json
├── openclaw.plugin.json                      ← manifest (id, contracts.tools, configSchema)
├── tsconfig.json                             ← strict: true, NodeNext modules
├── .gitignore                                ← node_modules, dist, *.tsbuildinfo
├── README.md                                 ← brief — points at DESIGN-V3.md
└── src/
    ├── index.ts                              ← definePluginEntry + lifecycle cleanup
    ├── tools/
    │   └── persona_workspace_resolve.ts      ← the one working tool
    ├── lib/
    │   └── workspace.ts                      ← pure resolution function (testable)
    └── hooks/                                ← (empty, for Phase 5)
```

### What `persona_workspace_resolve` does

Returns `{ path, source }` where `source` is one of:
- `pluginConfig.workspaceOverride` (highest priority)
- `env.OPENCLAW_WORKSPACE`
- `agents.list[].workspace`
- `agents.defaults.workspace`
- `default` (`$HOME/.openclaw/workspace`)

The pure function lives in `lib/workspace.ts` — call this from every future persona_* tool.

## Coexistence with v2.0 skill

The v2.0.0 skill is **still installed and active** at `~/.openclaw/workspace/skills/ai-persona-os/` (patched-locally to use `~/.openclaw/workspace/` paths).

The plugin coexists with the skill — no conflicts. The skill provides setup wizard, soul gallery, in-chat command recognition; the plugin currently adds one tool. They don't overlap.

**Do NOT disable or modify the v2.0 skill during phases 3-7.** It's the user's working setup. v2.0 retirement happens in Phase 8 via the migration runner.

## Five gotchas hit in Phase 2 (don't re-discover these)

1. **`/mnt/c` is mode 777 in WSL.** OpenClaw plugin loader rejects world-writable paths. Always stage in `~/dev/` and `chmod -R u=rwX,go=rX` before `openclaw plugins install --link`.
2. **`--force` is incompatible with `--link`.** Use one or the other, never both.
3. **Symlinked `dist/` inside the plugin dir is rejected** as "extension entry escapes plugin directory." Either copy files or build in the staging dir directly.
4. **`AgentToolResult<T>` requires `details: T`.** Doc examples show `{ content: [...] }` but `pi-agent-core`'s real type requires `details`. Even `details: {}` is fine — can't omit.
5. **Tool definitions need a `label` field** for UI display. Not optional in TS.

## Environment gotchas (terminal/shell)

- **PowerShell-to-WSL quoting:** PowerShell eats `$` and backslashes. For any non-trivial bash command, write a `.sh` file in `C:\Users\heroi\Claude Code\AI Persona OS\`, copy to `~/_x.sh` via `/mnt/c/Users/heroi/`, then `bash /tmp/_x.sh` inside WSL. Sample pattern in the helper scripts (currently deleted) from this session.
- **NVM not on `$PATH` in non-login shells.** Any WSL bash script that uses `openclaw`, `node`, or `npm` must start with: `export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"`
- **The openclaw CLI shebang is `#!/usr/bin/env node`.** Without NVM in PATH, you get `env: 'node': No such file or directory`. Same fix as above.

## Build + install procedure that works

Once the source is updated in `plugin/`:

```bash
#!/usr/bin/env bash
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"

# Stage from Windows-side source into WSL-native path (no spaces, non-world-writable)
WIN=/mnt/c/Users/heroi/Claude\ Code/AI\ Persona\ OS/ai-persona-os-1.6.2/plugin
DST=$HOME/dev/ai-persona-os-plugin
rm -rf "$DST" && mkdir -p "$DST"
rsync -a \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  --exclude node_modules --exclude dist --exclude '*.tsbuildinfo' \
  "$WIN/" "$DST/"

cd "$DST"
npm install
npm run build
chmod -R u=rwX,go=rX .

# Link into the gateway (idempotent for re-runs as long as path is unchanged)
openclaw plugins install --link "$DST"
systemctl --user restart openclaw-gateway

# Verify
openclaw plugins inspect ai-persona-os
journalctl --user -u openclaw-gateway -n 20 --no-pager | grep ai-persona-os
```

## What Phase 3 needs to deliver

From `DESIGN-V3.md` § Audit Update — Phase 3 ships:

### Tools

1. **`persona_status`** — health dashboard. Reads workspace state via `persona_workspace_resolve` + memory file sizes via direct `fs.stat`. Returns 🟢🟡🔴 indicators for core files, MEMORY.md size (limit 4KB), recent activity (logs in `memory/` from today), version (read `VERSION.md`).
2. **`persona_recall`** — wraps OpenClaw's `memory_search` tool. Accepts `{ query: string, limit?: number }`. Returns top chunks with file:line citations. AI Persona OS-specific scoring (boost recent daily logs).
3. **`persona_route_check`** — read `~/.openclaw/openclaw.json`, check three routing settings (`accounts.default`, `channels.discord.defaultAccount`, `agents.defaults.heartbeat.target`). Return 🟢🟡🔴 dashboard. Read-only — no fixes in Phase 3.
4. **`persona_doctor` (lint-only)** — composite health check. Workspace files + MEMORY.md size + version mismatch + routing config + tools.profile. Returns a structured report. `--fix` mode is Phase 6, not 3.

### First Control UI descriptor

5. **Status meter card** — `api.session.controls.registerControlUiDescriptor({ kind: "meter", ... })` that pulls from a session extension to show context %, memory %, version on a permanent header card. Reference: host-hooks recipe doc #10 (data-only Control UI surfaces).

### Patterns to follow (carry from Phase 2)

- **Every `register*` call** gets a paired entry in `api.lifecycle.registerRuntimeLifecycle`. Cleanup discipline pattern.
- **All tool returns** include `content` array AND `details` field. `AgentToolResult<T>`.
- **All tools** have `label` field for UI display.
- **All file I/O** uses workspace path from `resolveWorkspace()` in `lib/workspace.ts`, never hardcoded.
- **No symlinks** inside the staged plugin dir.

### Testing approach

OpenClaw provides:
- `createTestPluginApi()` from `openclaw/plugin-sdk/plugin-test-api` for unit tests
- `describePluginRegistrationContract` from `openclaw/plugin-sdk/plugin-test-contracts` for contract tests

Phase 3 doesn't need full test coverage yet — but a smoke test for each tool's happy path is worth writing. Use `vitest` (already in package.json devDeps via npm install).

### Ship target for Phase 3

When Phase 3 is done:
- All 4 tools loaded in OpenClaw, visible in `openclaw plugins inspect ai-persona-os`
- Control UI status meter card registered (won't render in TUI but `openclaw plugins inspect` should show it as a registered descriptor)
- Tag `v3.0.0-alpha.2` and ship pre-release
- Update issue #1 with Phase 3 status

## What NOT to do in Phase 3

- ❌ Don't touch the v2.0 skill at `~/.openclaw/workspace/skills/ai-persona-os/` — leave it alone
- ❌ Don't write any `persona_setup` logic — that's Phase 4 (Recipe D, needs session extension + UI card + scoped command composition)
- ❌ Don't try to replace HEARTBEAT.md yet — that's Phase 5 (`heartbeat_prompt_contribution`)
- ❌ Don't write the bundled SKILL.md inside `plugin/skills/` — wait until Phase 8 when all tools exist
- ❌ Don't add `--fix` modes to doctor or route_check — write tools, not config — that's Phase 6
- ❌ Don't change `persona_workspace_resolve` substantially — it works, keep it

## Open decisions still to confirm

From DESIGN-V3.md § Open Decisions (still defaulted, not formally confirmed):
1. npm package name `@jeffjhunter/openclaw-ai-persona-os` ✅ in package.json
2. Same repo, plugin/ subfolder ✅ done
3. ClawHub + npm distribution — defer to Phase 8
4. v2.0 skill stays as legacy ClawHub listing — defer to Phase 8

## How to start the next session

The user will give you a Phase 3 prompt. Your first actions should be:

1. **Read [DESIGN-V3.md](./DESIGN-V3.md)** — full design, especially § Audit Update
2. **Read this CHECKPOINT.md** — environment + Phase 2 state
3. **Read [plugin/src/index.ts](./plugin/src/index.ts) + [plugin/src/tools/persona_workspace_resolve.ts](./plugin/src/tools/persona_workspace_resolve.ts) + [plugin/src/lib/workspace.ts](./plugin/src/lib/workspace.ts)** — the pattern to follow
4. **Check installed state:** confirm v3.0.0-alpha.1 is still loaded:
   ```bash
   export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"
   openclaw plugins inspect ai-persona-os
   ```
5. **Confirm git state is clean** in the Windows-side repo at `C:\Users\heroi\Claude Code\AI Persona OS\ai-persona-os-1.6.2\`. If the user committed/pushed anything new since this checkpoint, sync up.
6. **Start writing Phase 3 tools.** Begin with `persona_status` (smallest scope), then `persona_recall`, then `persona_route_check`, then `persona_doctor`, then the UI descriptor.

Use the build+install procedure above after each significant change to verify the plugin still loads. Don't accumulate untested work.

---

*End of checkpoint. Good luck.*
