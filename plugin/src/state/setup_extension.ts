/**
 * Session extension — namespace `setup`.
 *
 * Declares the schema for setup-wizard progress state per session. Phase 4
 * registers the namespace and a `project()` reducer so the host knows the
 * shape; live writes (patchSessionExtension) are routed through the
 * `persona_setup` tool / `/persona-setup` command, both of which call back
 * into this module's `applySetupResult()` helper to persist the latest run.
 *
 * For Phase 4 we keep a minimal in-process cache keyed by sessionKey so the
 * wizard UI descriptor + `/persona-setup status` command can read the last
 * known progress without round-tripping through the host's session-extension
 * write API (which isn't on the typed registration surface yet). When Phase 5
 * lifts the SDK lid on patchSessionExtension we'll swap the cache for that.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { SetupResult } from "../lib/setup.js";

export const SETUP_NAMESPACE = "setup";

export type SetupProgress = {
  /** Last preset the user/agent ran setup with. */
  lastPreset?: string;
  /** Inputs from the last run. */
  lastInputs?: SetupResult["inputs"];
  /** Files written on the last run (workspace-relative). */
  lastWritten?: string[];
  /** Files skipped on the last run. */
  lastSkipped?: string[];
  /** ISO timestamp of the last run. */
  lastRunAt?: string;
  /** Whether the last run had any non-VERSION.md files written (i.e. it actually bootstrapped something). */
  hasBootstrapped?: boolean;
};

const cache = new Map<string, SetupProgress>();

/**
 * Read the latest known progress for a session, falling back to the
 * "__global__" entry when no session-keyed value has been recorded. Tools
 * called outside any session (e.g. from the in-process smoke test) write to
 * "__global__", which the project() reducer surfaces to every session that
 * doesn't have its own dedicated entry yet.
 */
export function getSetupProgress(sessionKey?: string): SetupProgress {
  if (sessionKey && cache.has(sessionKey)) return cache.get(sessionKey)!;
  return cache.get("__global__") ?? {};
}

/** Record a setup result so subsequent reads + the UI card can see it. */
export function applySetupResult(
  sessionKey: string | undefined,
  result: SetupResult
): SetupProgress {
  const wroteWorkspaceFiles = result.written.some((w) => w.relPath !== "VERSION.md");
  const progress: SetupProgress = {
    lastPreset: result.preset,
    lastInputs: result.inputs,
    lastWritten: result.written.map((w) => w.relPath),
    lastSkipped: result.skipped.map((s) => s.relPath),
    lastRunAt: new Date().toISOString(),
    hasBootstrapped:
      (getSetupProgress(sessionKey).hasBootstrapped ?? false) || wroteWorkspaceFiles,
  };
  cache.set(sessionKey ?? "__global__", progress);
  return progress;
}

/** Clear cached state — exposed for tests + the lifecycle cleanup. */
export function clearSetupProgress(sessionKey?: string): void {
  if (sessionKey) cache.delete(sessionKey);
  else cache.clear();
}

/**
 * Register the setup-progress session extension.
 *
 * Phase 4: registers the schema + a project() that returns the cached progress
 * snapshot for this session. Phase 5+ can replace the cache with real
 * patchSessionExtension writes once that surface is exposed in the typed SDK.
 */
export function registerSetupExtension(api: OpenClawPluginApi): void {
  api.session.state.registerSessionExtension({
    namespace: SETUP_NAMESPACE,
    description:
      "AI Persona OS setup-wizard progress. Tracks the last persona_setup " +
      "run per session: preset, inputs, files written/skipped, timestamp.",
    // Must be an identifier-style field name (no dashes/dots) — gateway diag
    // rejects "ai-persona-os.setup". Prefix with our plugin id in camelCase
    // so non-plugin readers can disambiguate from other plugins' slots.
    sessionEntrySlotKey: "aiPersonaOsSetup",
    sessionEntrySlotSchema: {
      type: "object",
      properties: {
        lastPreset: { type: "string" },
        lastRunAt: { type: "string", format: "date-time" },
        hasBootstrapped: { type: "boolean" },
        lastInputs: { type: "object" },
        lastWritten: { type: "array", items: { type: "string" } },
        lastSkipped: { type: "array", items: { type: "string" } },
      },
    },
    project: (ctx) => {
      const progress = getSetupProgress(ctx.sessionKey);
      // PluginJsonValue requires arrays/objects that recurse into the union;
      // mapping by hand keeps the JSON shape correct.
      return {
        lastPreset: progress.lastPreset ?? null,
        lastRunAt: progress.lastRunAt ?? null,
        hasBootstrapped: progress.hasBootstrapped ?? false,
        lastInputs: progress.lastInputs
          ? {
              name: progress.lastInputs.name ?? null,
              role: progress.lastInputs.role ?? null,
              goal: progress.lastInputs.goal ?? null,
              soul: progress.lastInputs.soul ?? null,
            }
          : null,
        lastWritten: progress.lastWritten ?? [],
        lastSkipped: progress.lastSkipped ?? [],
      };
    },
    cleanup: async ({ sessionKey }) => {
      if (sessionKey) cache.delete(sessionKey);
    },
  });

  api.lifecycle.registerRuntimeLifecycle({
    id: "ai-persona-os.setup-extension.lifecycle",
    description: "Clears cached setup-progress state on plugin disable/reload.",
    cleanup: async () => {
      cache.clear();
    },
  });
}
