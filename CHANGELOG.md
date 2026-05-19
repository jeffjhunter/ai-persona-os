# AI Persona OS — Changelog

All notable changes to the AI Persona OS skill.

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

- **Heartbeat setup typo** — `cp assets/VERSION.md ~/workspace/VERSION` → `~/workspace/VERSION.md` ([SKILL.md:1075](SKILL.md)). The Step 3c setup command was already correct; only the inline heartbeat section was stale.
- **Stale version sample** — heartbeat output example showed `AI Persona OS v1.4.1`; now `v1.7.0` to match the running skill.

### Compatibility

- Workspace files: no changes required. Existing SOUL.md/USER.md/AGENTS.md/etc. continue to work.
- Heartbeat will flag the version mismatch (`workspace v1.6.x → skill v1.7.0`) the first time it runs. Bumping `~/workspace/VERSION.md` to 1.7.0 clears it.
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
