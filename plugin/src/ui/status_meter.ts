/**
 * First Control UI descriptor — the persistent "AI Persona OS — Status" meter.
 *
 * Phase 3 contribution per DESIGN-V3.md § Audit Update (Recipe #10, data-only
 * Control UI surfaces). The descriptor declares the shape of a meter card
 * that a future host renderer can paint. The actual data source — a session
 * extension that publishes `{ contextPct, memoryPct, version }` — lands in
 * Phase 4 alongside persona_setup, when the plugin starts owning session
 * state. For Phase 3 the descriptor is registered so:
 *
 *   1. `openclaw plugins inspect ai-persona-os` shows it as a registered
 *      Control UI contribution.
 *   2. Phase 4 work can wire it to live state without touching this file.
 *
 * Paired with a runtime-lifecycle cleanup so the host clears the descriptor
 * on plugin disable/uninstall.
 */

import type {
  OpenClawPluginApi,
  PluginJsonValue,
} from "openclaw/plugin-sdk/plugin-entry";
import { PLUGIN_VERSION } from "../lib/version.js";

type Api = OpenClawPluginApi;

export const STATUS_METER_DESCRIPTOR_ID = "ai-persona-os.status-meter";

/**
 * Schema published with the descriptor. Hosts that don't understand "meter"
 * can ignore it; hosts that do can render the three metrics with the warn /
 * critical thresholds baked in. Source is declared abstractly so Phase 4 can
 * wire the live session extension without breaking the descriptor contract.
 */
const METER_SCHEMA: PluginJsonValue = {
  kind: "meter",
  pluginVersion: PLUGIN_VERSION,
  placement: "header",
  refreshHint: "on-session-state-change",
  metrics: [
    {
      id: "context",
      label: "Context",
      unit: "%",
      min: 0,
      max: 100,
      thresholds: { warn: 70, critical: 85 },
      summary: "Approximate context-window usage for the active run.",
    },
    {
      id: "memory",
      label: "MEMORY.md",
      unit: "%",
      min: 0,
      max: 100,
      thresholds: { warn: 75, critical: 95 },
      summary:
        "Size of the curated MEMORY.md file vs the configured limit (default 4 KB).",
    },
    {
      id: "version",
      label: "Version",
      unit: "",
      summary: "Plugin version + workspace VERSION.md mismatch indicator.",
    },
  ],
  source: {
    kind: "sessionExtension",
    pluginId: "ai-persona-os",
    namespace: "status",
    /**
     * Expected JSON shape Phase 4's registerSessionExtension will publish.
     * Documented here so the descriptor + extension can be wired
     * without coordination round-trips.
     */
    shape: {
      contextPct: "number | null",
      memoryPct: "number | null",
      memoryBytes: "number | null",
      memoryLimitBytes: "number | null",
      version: "string | null",
      workspaceVersion: "string | null",
      overall: '"ok" | "warn" | "critical"',
    },
  },
};

export function registerStatusMeterUi(api: Api): void {
  api.session.controls.registerControlUiDescriptor({
    id: STATUS_METER_DESCRIPTOR_ID,
    surface: "session",
    label: "AI Persona OS — Status",
    description:
      "Persistent header meter for the AI Persona OS workspace: context " +
      "usage, MEMORY.md size, version. Live data is published by the " +
      "ai-persona-os/status session extension (Phase 4).",
    placement: "header",
    schema: METER_SCHEMA,
  });

  api.lifecycle.registerRuntimeLifecycle({
    id: `${STATUS_METER_DESCRIPTOR_ID}.lifecycle`,
    description: "Cleanup for the AI Persona OS status-meter UI descriptor.",
    cleanup: async ({ reason }) => {
      api.logger.info(
        `ai-persona-os status-meter UI cleanup reason=${reason}`
      );
      // No mutable state to release — descriptors are declarative.
      // The hook exists so Phase 4 can attach a session-extension teardown
      // without changing this file's registration shape.
    },
  });
}
