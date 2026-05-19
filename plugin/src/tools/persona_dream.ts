/**
 * Tool: persona_dream
 *
 * Consolidate the last N days of daily logs (`memory/YYYY-MM-DD*.md`) into a
 * structured report. Deterministic — no LLM. Output:
 *
 *   - Appends a short summary block to `<WORKSPACE>/DREAMS.md`
 *   - Writes the full report to `<WORKSPACE>/memory/.dreams/<ISO>.md`
 *
 * The agent reading the report is the one who narrates / refines what the
 * consolidation actually means. This tool's job is to put the structured
 * pieces in front of them.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import { dream, renderDreamSummary, type DreamReport } from "../lib/dream.js";

type Api = OpenClawPluginApi;

type Params = {
  windowDays?: unknown;
  dryRun?: unknown;
};

export function registerPersonaDream(api: Api): void {
  api.registerTool({
    name: "persona_dream",
    label: "Consolidate memory over a window",
    description:
      "Walk `<WORKSPACE>/memory/YYYY-MM-DD*.md` over the last N days " +
      "(default 7) and produce a deterministic consolidation report: file " +
      "list, recurring section headers ('themes'), key extracts. Appends a " +
      "summary to DREAMS.md and writes the full report to " +
      "memory/.dreams/<ISO>.md. dryRun:true returns the report without writing.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        windowDays: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Days back to include (default 7, max 365).",
        },
        dryRun: {
          type: "boolean",
          description: "Compute the report without writing to DREAMS.md or memory/.dreams/.",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: DreamReport | { ok: false; error: string };
    }> {
      const p = (params ?? {}) as Params;
      const windowDays =
        typeof p.windowDays === "number" && Number.isFinite(p.windowDays)
          ? Math.floor(p.windowDays)
          : undefined;
      const dryRun = p.dryRun === true;

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

      try {
        const report = await dream({
          workspace: resolution.path,
          windowDays,
          dryRun,
        });
        return {
          content: [{ type: "text", text: renderDreamSummary(report) }],
          details: report,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `persona_dream failed: ${msg}` }],
          details: { ok: false, error: msg },
        };
      }
    },
  });
}
