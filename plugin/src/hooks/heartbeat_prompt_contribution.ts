/**
 * Hook: heartbeat_prompt_contribution
 *
 * Fires only on heartbeat turns. Returns `{ appendContext }` so the AI
 * Persona OS status (workspace files, MEMORY.md usage, routing health) is
 * always present on heartbeats without inflating user-initiated turns.
 *
 * Replaces v2.0's HEARTBEAT.md (30 lines, ~600 tokens) with a deterministic
 * one-line string the plugin emits natively. DESIGN-V3.md target: ≥90%
 * reduction in per-fire token cost. Compact mode: ~25-35 tokens (95%+
 * reduction). Verbose mode: ~80-130 tokens (80%+ reduction).
 *
 * Behaviour:
 *   - Reads workspace via the shared `inspectWorkspace()` helper.
 *   - When `heartbeat.format === "verbose"` (plugin config), also reads
 *     openclaw.json and folds in routing warnings.
 *   - Errors are swallowed and downgraded to a brief `appendContext` so a
 *     transient I/O failure can't break heartbeat turns.
 *
 * Registered via `api.registerHook("heartbeat_prompt_contribution", ...)`
 * in `index.ts`. Paired with a runtime-lifecycle cleanup.
 */

import type {
  OpenClawPluginApi,
  PluginHeartbeatPromptContributionEvent,
  PluginHeartbeatPromptContributionResult,
} from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import {
  inspectWorkspace,
  DEFAULT_MEMORY_LIMIT_BYTES,
} from "../lib/workspace-status.js";
import { runRouteCheck } from "../lib/route-check.js";
import {
  renderHeartbeatContext,
  type HeartbeatFormat,
} from "../lib/heartbeat-context.js";
import { PLUGIN_VERSION } from "../lib/version.js";

type Api = OpenClawPluginApi;

/**
 * Hard upper bound — if our render somehow blows past this many characters
 * (way beyond the verbose budget), truncate so a misconfigured workspace
 * can't dump an unbounded blob into every heartbeat prompt.
 */
const MAX_CONTRIBUTION_CHARS = 800;

function readFormat(pluginConfig: unknown): HeartbeatFormat {
  const cfg = pluginConfig as
    | { heartbeat?: { format?: unknown } }
    | undefined;
  return cfg?.heartbeat?.format === "verbose" ? "verbose" : "compact";
}

function readMemoryLimitBytes(pluginConfig: unknown): number {
  const cfg = pluginConfig as
    | { heartbeat?: { memoryLimitKB?: unknown } }
    | undefined;
  const kb = cfg?.heartbeat?.memoryLimitKB;
  return typeof kb === "number" && kb > 0
    ? kb * 1024
    : DEFAULT_MEMORY_LIMIT_BYTES;
}

function readEnabled(pluginConfig: unknown): boolean {
  const cfg = pluginConfig as
    | { heartbeat?: { useNativeProtocol?: unknown } }
    | undefined;
  // Default true per DESIGN-V3.md configSchema. Operator can flip off.
  return cfg?.heartbeat?.useNativeProtocol !== false;
}

/** Build the handler — exported so tests can call it without a hook bus. */
export function buildHeartbeatHandler(api: Api) {
  return async (
    _event: PluginHeartbeatPromptContributionEvent
  ): Promise<PluginHeartbeatPromptContributionResult | void> => {
    if (!readEnabled(api.pluginConfig)) return;

    try {
      const pluginCfg = api.pluginConfig as
        | { workspaceOverride?: unknown }
        | undefined;
      const resolution = resolveWorkspace({
        pluginOverride:
          typeof pluginCfg?.workspaceOverride === "string"
            ? pluginCfg.workspaceOverride
            : undefined,
        agentId: undefined,
        config: api.config as unknown as WorkspaceResolutionInput["config"],
        env: process.env,
      });

      const memoryLimitBytes = readMemoryLimitBytes(api.pluginConfig);
      const format = readFormat(api.pluginConfig);

      const snapshot = await inspectWorkspace(resolution.path, {
        memoryLimitBytes,
      });

      // Verbose mode pulls routing — compact skips it for token economy.
      const routes = format === "verbose" ? await runRouteCheck(process.env) : undefined;

      let text = renderHeartbeatContext({
        snapshot,
        routes,
        pluginVersion: PLUGIN_VERSION,
        format,
      });

      if (text.length > MAX_CONTRIBUTION_CHARS) {
        text =
          text.slice(0, MAX_CONTRIBUTION_CHARS - 1) +
          "…\n[ai-persona-os heartbeat contribution truncated]";
      }

      return { appendContext: text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Don't throw — heartbeat turns shouldn't break because our hook
      // hit a transient I/O error. Surface a tiny breadcrumb instead.
      api.logger.warn(`ai-persona-os heartbeat hook error: ${msg}`);
      return {
        appendContext: `🟡 ai-persona-os heartbeat: ${msg.slice(0, 120)}`,
      };
    }
  };
}

export function registerHeartbeatHook(api: Api): void {
  const handler = buildHeartbeatHandler(api);
  // `api.registerHook` is typed with the legacy `InternalHookHandler`
  // shape `(event) => void | Promise<void>`, but the runtime hook-runner
  // routes typed contribution handlers (see openclaw dist
  // hook-runner-global... `runModifyingHook("heartbeat_prompt_contribution", ...)`
  // which merges PluginHeartbeatPromptContributionResult). Cast through
  // unknown so our typed handler's return value is honored by the runtime
  // without TypeScript flagging the contract mismatch.
  api.registerHook(
    "heartbeat_prompt_contribution",
    handler as unknown as Parameters<Api["registerHook"]>[1],
    {
      // Loader requires a name to register the hook; falls back to
      // opts.name.trim() when no entry-level hook.name is present.
      // See openclaw dist/loader: "hook registration missing name".
      name: "ai-persona-os.heartbeat-prompt-contribution",
      description:
        "AI Persona OS workspace status as a heartbeat-only context contribution.",
    }
  );

  api.lifecycle.registerRuntimeLifecycle({
    id: "ai-persona-os.heartbeat-hook.lifecycle",
    description:
      "Cleanup for the AI Persona OS heartbeat_prompt_contribution hook.",
    cleanup: async ({ reason }) => {
      api.logger.info(`ai-persona-os heartbeat hook cleanup reason=${reason}`);
      // No per-handler state to clear — the closure is GC'd with the plugin.
    },
  });
}
