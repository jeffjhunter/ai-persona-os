/**
 * Tool: persona_switch_soul
 *
 * Swap `<WORKSPACE>/SOUL.md` to a named gallery soul (e.g. "03-jarvis.md").
 * Backs up the existing SOUL.md to `memory/archive/soul-pre-switch-<ts>.md`
 * before overwriting. Atomic write.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import { resolveTemplatesRoot } from "../lib/setup.js";
import { switchSoul, type SwitchSoulResult } from "../lib/soul-ops.js";

type Api = OpenClawPluginApi;

function render(r: SwitchSoulResult): string {
  const lines: string[] = [];
  lines.push(`🟢 persona_switch_soul → ${r.newSoul.galleryRelPath}`);
  lines.push(`Wrote: SOUL.md (${r.bytesWritten} B)`);
  if (r.hadPriorSoul && r.backupRelPath) {
    lines.push(`Backed up prior SOUL.md → ${r.backupRelPath}`);
  } else {
    lines.push("No prior SOUL.md — nothing to back up.");
  }
  return lines.join("\n");
}

export function registerPersonaSwitchSoul(api: Api): void {
  api.registerTool({
    name: "persona_switch_soul",
    label: "Swap SOUL.md from the gallery",
    description:
      "Replace SOUL.md with a named soul from the bundled gallery " +
      "(templates/prebuilt-souls/ or templates/iconic-characters/). Backs " +
      "up the current SOUL.md to memory/archive/soul-pre-switch-<ts>.md " +
      "before overwriting. Atomic write.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["soul"],
      properties: {
        soul: {
          type: "string",
          description:
            "Soul filename, e.g. '03-jarvis.md'. Looked up in " +
            "prebuilt-souls/ first, then iconic-characters/.",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: SwitchSoulResult | { ok: false; error: string };
    }> {
      const soul =
        params && typeof (params as { soul?: unknown }).soul === "string"
          ? (params as { soul: string }).soul.trim()
          : "";
      if (!soul) {
        return {
          content: [{ type: "text", text: "persona_switch_soul: 'soul' is required." }],
          details: { ok: false, error: "soul required" },
        };
      }

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
        const result = await switchSoul({
          workspace: resolution.path,
          templatesRoot: resolveTemplatesRoot(api.rootDir),
          soul,
        });
        return {
          content: [{ type: "text", text: render(result) }],
          details: result,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `persona_switch_soul failed: ${msg}` }],
          details: { ok: false, error: msg },
        };
      }
    },
  });
}
