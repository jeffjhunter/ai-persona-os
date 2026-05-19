# AI Persona OS v3.0 — Session Checkpoint

> **For the next Claude Code session.** Read this top-to-bottom before doing anything. It captures exact paths, environment quirks, what's already working, gotchas hit, and what Phase 3 needs to deliver.

**Last updated:** 2026-05-19, end of Phase 2
**Author of this checkpoint:** Claude (Sonnet 4.5)
**Next phase:** Phase 3 — read-only tools + first Control UI descriptor

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
