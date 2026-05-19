/**
 * Tool: persona_workspace_resolve
 *
 * Returns the resolved workspace path the AI Persona OS plugin is using.
 * Tells the caller WHERE the path came from (plugin config, env var,
 * per-agent override, global default, or fallback).
 *
 * This is the canonical workspace-resolver for the whole plugin — every
 * other persona_* tool should read its workspace path by calling this.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolution,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";

type Api = OpenClawPluginApi;

export function registerPersonaWorkspaceResolve(api: Api): void {
  api.registerTool({
    name: "persona_workspace_resolve",
    label: "Resolve workspace path",
    description:
      "Resolve the active workspace path. Reads agents.defaults.workspace " +
      "(with per-agent override support), the OPENCLAW_WORKSPACE env var, " +
      "and the plugin config workspaceOverride. Falls back to " +
      "$HOME/.openclaw/workspace. Returns both the path and which source it came from.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute(_toolCallId, _params): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: WorkspaceResolution;
    }> {
      const pluginCfg = api.pluginConfig as { workspaceOverride?: unknown } | undefined;
      const result = resolveWorkspace({
        pluginOverride:
          typeof pluginCfg?.workspaceOverride === "string"
            ? pluginCfg.workspaceOverride
            : undefined,
        // The plugin SDK doesn't expose "the agent who made this tool call"
        // directly on api — in production we'd thread it through tool-call
        // context. For alpha.1, we resolve against agents.defaults only.
        agentId: undefined,
        config: api.config as unknown as WorkspaceResolutionInput["config"],
        env: process.env,
      });

      const text = `Workspace: ${result.path}\nSource: ${result.source}`;

      return {
        content: [{ type: "text", text }],
        details: result,
      };
    },
  });
}
