/**
 * Tool: persona_checkpoint
 *
 * Append a structured entry to `<WORKSPACE>/memory/YYYY-MM-DD.md`. Used both
 * by humans/agents who want to mark a moment, and (in a future phase) by an
 * automated context-pressure hook that wants to preserve state before
 * running out of context window.
 *
 * Atomic append: existing daily logs accumulate; new entries land at the
 * bottom with an ISO timestamp + optional tag. Atomic write semantics
 * preserve the file across crashes.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import {
  writeCheckpoint,
  type CheckpointResult,
} from "../lib/checkpoint.js";

type Api = OpenClawPluginApi;

type Params = {
  summary?: unknown;
  tag?: unknown;
};

function coerceString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function render(r: CheckpointResult): string {
  const verb = r.appended ? "appended to" : "created";
  return `🟢 persona_checkpoint ${verb} ${r.relPath}\n  timestamp: ${r.timestamp}\n  size: ${r.bytesAfter} B`;
}

export function registerPersonaCheckpoint(api: Api): void {
  api.registerTool({
    name: "persona_checkpoint",
    label: "Save a context checkpoint",
    description:
      "Append a checkpoint entry to today's daily log " +
      "(memory/YYYY-MM-DD.md). Use to mark a meaningful state — end of " +
      "session, before context fills, when you finished a milestone. " +
      "Atomic write; multiple checkpoints per day accumulate.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: {
        summary: {
          type: "string",
          minLength: 1,
          description:
            "What you want to remember. One paragraph is fine. Markdown supported.",
        },
        tag: {
          type: "string",
          maxLength: 40,
          description:
            "Optional short tag like 'eod' or 'context-pressure' for later filtering.",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: CheckpointResult | { ok: false; error: string };
    }> {
      const p = (params ?? {}) as Params;
      const summary = coerceString(p.summary);
      if (!summary) {
        return {
          content: [
            {
              type: "text",
              text: "persona_checkpoint: summary is required and must be non-empty.",
            },
          ],
          details: { ok: false, error: "summary required" },
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
        const result = await writeCheckpoint(resolution.path, {
          summary,
          tag: coerceString(p.tag),
        });
        return {
          content: [{ type: "text", text: render(result) }],
          details: result,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `persona_checkpoint failed: ${msg}` }],
          details: { ok: false, error: msg },
        };
      }
    },
  });
}
