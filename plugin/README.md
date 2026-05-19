# AI Persona OS — Plugin (v3.0)

OpenClaw plugin source for AI Persona OS v3.0. Replaces the v2.x markdown-only skill with native tools, hooks, scheduler jobs, Control UI descriptors, and a thin bundled skill.

**Status:** v3.0.0-alpha.1 — Phase 2 (scaffold). Registers one tool (`persona_workspace_resolve`). Future phases add the full surface.

**Full design:** [`../DESIGN-V3.md`](../DESIGN-V3.md)
**Tracking:** [issue #1](https://github.com/jeffjhunter/ai-persona-os/issues/1)

## Build

```bash
cd plugin
npm install
npm run build
```

Output: `dist/index.js` + `dist/index.d.ts` plus per-source-file `.js` and `.d.ts`.

## Local install (for development)

```bash
# Build once
cd plugin && npm run build

# Tell OpenClaw to load it from the filesystem
openclaw plugins install --local /absolute/path/to/plugin
```

Then in any TUI session: `/new` to reload, then `persona_workspace_resolve` should appear in tool listings.

## Layout

```
plugin/
├── package.json                  ← npm metadata + openclaw extension
├── openclaw.plugin.json          ← plugin manifest (id, contracts, schema)
├── tsconfig.json
├── src/
│   ├── index.ts                  ← definePluginEntry — main registration
│   ├── tools/
│   │   └── persona_workspace_resolve.ts
│   └── lib/
│       └── workspace.ts          ← pure function, unit-testable
└── dist/                         ← compiled output (gitignored)
```

## Roadmap

See [`../DESIGN-V3.md`](../DESIGN-V3.md) § Phases for the full plan. Next session: Phase 3 — read-only tools (`persona_status`, `persona_recall`, `persona_route_check`, `persona_doctor` lint-only) + first Control UI descriptor.

## License

MIT-0 — same as the rest of the repo.
