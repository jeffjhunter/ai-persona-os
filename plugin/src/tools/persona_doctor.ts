/**
 * Tool: persona_doctor
 *
 * Composite health check across the AI Persona OS workspace and openclaw.json.
 *
 * Default mode (read-only): same as before — returns findings.
 *
 * `fix: true` mode (Phase 6 — safe scope only):
 *   - workspace.missing.*   → write the missing file from the bundled templates
 *   - version.missing       → write VERSION.md with the plugin version
 *
 * Out-of-scope here, deferred to Phase 7's operator.admin gating:
 *   - routing.*             → mutates openclaw.json
 *   - config.tools.profile  → mutates openclaw.json
 *   - memory.size.*         → needs human curation (try persona_dream first)
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
import { resolveTemplatesRoot } from "../lib/setup.js";
import {
  applySafeFixes,
  renderFixReport,
  type DoctorFixApplied,
} from "../lib/doctor-fixers.js";

type Api = OpenClawPluginApi;

type Params = {
  fix?: unknown;
};

export type DoctorToolResult = {
  report: DoctorReport;
  /** Present when fix:true was requested. */
  fixes?: DoctorFixApplied[];
  /** Post-fix re-run report, when fix:true. Lets callers see what's left. */
  postFixReport?: DoctorReport;
};

export function registerPersonaDoctor(api: Api): void {
  api.registerTool({
    name: "persona_doctor",
    label: "Workspace + config health lint",
    description:
      "Composite health check across the AI Persona OS workspace and " +
      "openclaw.json: required/recommended files, MEMORY.md size, routing " +
      "settings, tools.profile, and VERSION.md drift. " +
      "Pass fix:true to apply safe filesystem fixes (missing template files, " +
      "VERSION.md). Routing/config mutations are NOT applied here — they " +
      "require operator.admin scope (Phase 7).",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        fix: {
          type: "boolean",
          description:
            "When true, apply safe filesystem fixes (workspace.missing.*, version.missing). " +
            "Routing/config fixes are deferred to Phase 7. Default false.",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: DoctorToolResult;
    }> {
      const p = (params ?? {}) as Params;
      const wantFix = p.fix === true;

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

      if (!wantFix) {
        return {
          content: [{ type: "text", text: renderDoctorReport(report) }],
          details: { report },
        };
      }

      const templatesRoot = resolveTemplatesRoot(api.rootDir);
      const fixes = await applySafeFixes(report.findings, {
        workspace: resolution.path,
        templatesRoot,
        pluginVersion: PLUGIN_VERSION,
      });

      // Re-run after fixes so the caller sees the up-to-date picture.
      const postFixReport = await runDoctor(resolution.path, {
        pluginVersion: PLUGIN_VERSION,
        memoryLimitBytes,
      });

      const text = [
        renderDoctorReport(report),
        "",
        "── persona_doctor --fix ──",
        renderFixReport(fixes),
        "",
        "── after fixes ──",
        renderDoctorReport(postFixReport),
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: { report, fixes, postFixReport },
      };
    },
  });
}
