/**
 * Tool: persona_doctor
 *
 * Composite, read-only lint of the AI Persona OS install:
 *   - workspace files (required + recommended)
 *   - MEMORY.md size vs limit
 *   - openclaw.json routing settings (via route-check)
 *   - tools.profile presence
 *   - VERSION.md presence + major-version match against the running plugin
 *
 * No --fix mode in Phase 3 — Phase 6 adds remediation.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import {
  runDoctor,
  renderDoctorReport,
  type DoctorReport,
} from "../lib/doctor.js";
import { DEFAULT_MEMORY_LIMIT_BYTES } from "../lib/workspace-status.js";
import { PLUGIN_VERSION } from "../lib/version.js";

type Api = OpenClawPluginApi;

export function registerPersonaDoctor(api: Api): void {
  api.registerTool({
    name: "persona_doctor",
    label: "Workspace + config health lint",
    description:
      "Composite health check across the AI Persona OS workspace and " +
      "openclaw.json: required/recommended files, MEMORY.md size, routing " +
      "settings, tools.profile, and VERSION.md drift. Lint-only — Phase 3 " +
      "is read-only; the --fix mode lands in Phase 6.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute(
      _toolCallId,
      _params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: DoctorReport;
    }> {
      const pluginCfg = api.pluginConfig as
        | { workspaceOverride?: unknown; heartbeat?: { memoryLimitKB?: unknown } }
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

      const memLimitKB =
        typeof pluginCfg?.heartbeat?.memoryLimitKB === "number"
          ? pluginCfg.heartbeat.memoryLimitKB
          : undefined;
      const memoryLimitBytes =
        memLimitKB && memLimitKB > 0 ? memLimitKB * 1024 : DEFAULT_MEMORY_LIMIT_BYTES;

      const report = await runDoctor(resolution.path, {
        pluginVersion: PLUGIN_VERSION,
        memoryLimitBytes,
      });

      return {
        content: [{ type: "text", text: renderDoctorReport(report) }],
        details: report,
      };
    },
  });
}
