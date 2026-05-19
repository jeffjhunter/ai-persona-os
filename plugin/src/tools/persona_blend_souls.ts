/**
 * Tool: persona_blend_souls
 *
 * Structurally merge two gallery souls into a hybrid SOUL.md. Parses each
 * soul's canonical sections (intro, Core Truths, Communication Style), then
 * synthesizes a blended document with both source intros surfaced + an
 * interleaved Core Truths list + deduped Communication Style bullets +
 * trailing sections from soul A as the base.
 *
 * Backs up the current SOUL.md before overwriting. Atomic write.
 *
 * The output is a starting point — the user is expected to edit it. The
 * tool's job is to put the pieces in front of them, not invent prose.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import { resolveTemplatesRoot } from "../lib/setup.js";
import { blendSouls, type BlendResult } from "../lib/soul-ops.js";

type Api = OpenClawPluginApi;

function render(r: BlendResult): string {
  const lines: string[] = [];
  lines.push(`🟢 persona_blend_souls`);
  lines.push(`  A: ${r.a.galleryRelPath}`);
  lines.push(`  B: ${r.b.galleryRelPath}`);
  lines.push(`Wrote: SOUL.md (${r.bytesWritten} B)`);
  if (r.hadPriorSoul && r.backupRelPath) {
    lines.push(`Backed up prior SOUL.md → ${r.backupRelPath}`);
  }
  lines.push("");
  lines.push("Blend is a structural merge — review and edit SOUL.md to taste.");
  return lines.join("\n");
}

export function registerPersonaBlendSouls(api: Api): void {
  api.registerTool({
    name: "persona_blend_souls",
    label: "Blend two souls into a hybrid SOUL.md",
    description:
      "Structurally merge two gallery souls (e.g. '03-jarvis.md' and " +
      "'09-mary-poppins.md') into a hybrid SOUL.md. Interleaves Core " +
      "Truths, dedupes Communication Style bullets, surfaces both source " +
      "intros so the user can see what they're combining. Backs up the " +
      "current SOUL.md before overwriting. Output is a starting point — " +
      "edit to taste.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["a", "b"],
      properties: {
        a: {
          type: "string",
          description: "First soul filename, e.g. '03-jarvis.md'.",
        },
        b: {
          type: "string",
          description: "Second soul filename. Must differ from a.",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: BlendResult | { ok: false; error: string };
    }> {
      const p = (params ?? {}) as { a?: unknown; b?: unknown };
      const a = typeof p.a === "string" ? p.a.trim() : "";
      const b = typeof p.b === "string" ? p.b.trim() : "";
      if (!a || !b) {
        return {
          content: [
            { type: "text", text: "persona_blend_souls: 'a' and 'b' are required." },
          ],
          details: { ok: false, error: "a and b required" },
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
        const result = await blendSouls({
          workspace: resolution.path,
          templatesRoot: resolveTemplatesRoot(api.rootDir),
          a,
          b,
        });
        return {
          content: [{ type: "text", text: render(result) }],
          details: result,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `persona_blend_souls failed: ${msg}` }],
          details: { ok: false, error: msg },
        };
      }
    },
  });
}
