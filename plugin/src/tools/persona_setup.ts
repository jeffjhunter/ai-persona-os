/**
 * Tool: persona_setup
 *
 * Bootstrap the AI Persona OS workspace from a preset.
 *
 * Non-destructive by default — existing files are left in place unless
 * `force: true` is passed. Atomic writes (write-tmp + rename) so a crash
 * mid-write can't leave a partial file. `dryRun: true` returns the plan
 * without touching disk.
 *
 * VERSION.md is the one exception to non-destructive — it's always (re-)written
 * to track which plugin version last touched the workspace. Same as Phase 6's
 * migration runner will use.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import {
  runSetup,
  renderSetupResult,
  resolveTemplatesRoot,
  PRESETS,
  type SetupResult,
  type SetupParams,
} from "../lib/setup.js";
import { PLUGIN_VERSION } from "../lib/version.js";
import { applySetupResult } from "../state/setup_extension.js";

type Api = OpenClawPluginApi;

type ToolParams = {
  preset?: unknown;
  name?: unknown;
  role?: unknown;
  goal?: unknown;
  soul?: unknown;
  force?: unknown;
  dryRun?: unknown;
};

function coerceString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export function registerPersonaSetup(api: Api): void {
  api.registerTool({
    name: "persona_setup",
    label: "Bootstrap AI Persona OS workspace",
    description:
      "Bootstrap the workspace from a preset (coding-assistant, " +
      "executive-assistant, marketing-assistant, custom). Copies templates " +
      "atomically and never overwrites existing files unless force:true. " +
      "VERSION.md is always (re-)written to track the plugin version. " +
      "Pass dryRun:true to preview the file plan without touching disk. " +
      "Optional `soul` selects a specific personality from " +
      "templates/prebuilt-souls/ or templates/iconic-characters/.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["preset"],
      properties: {
        preset: {
          type: "string",
          enum: Object.keys(PRESETS),
          description:
            "Which preset to bootstrap. 'custom' copies only base templates and leaves SOUL.md as a fill-in.",
        },
        name: {
          type: "string",
          description: "Optional human name — written into USER.md's Setup Inputs section.",
        },
        role: {
          type: "string",
          description: "Optional human role — written into USER.md's Setup Inputs section.",
        },
        goal: {
          type: "string",
          description: "Optional human goal — written into USER.md's Setup Inputs section.",
        },
        soul: {
          type: "string",
          description:
            "Optional soul filename to override SOUL.md (e.g. '03-jarvis.md'). " +
            "Looked up under templates/prebuilt-souls/ then templates/iconic-characters/.",
        },
        force: {
          type: "boolean",
          description:
            "Overwrite existing workspace files. Default false — established workspaces stay safe.",
        },
        dryRun: {
          type: "boolean",
          description: "Compute the plan but don't write any files. Default false.",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: SetupResult | { ok: false; error: string };
    }> {
      const p = (params ?? {}) as ToolParams;
      const preset = coerceString(p.preset);
      if (!preset) {
        return {
          content: [{ type: "text", text: "persona_setup: preset is required." }],
          details: { ok: false, error: "preset is required" },
        };
      }
      if (!(preset in PRESETS)) {
        return {
          content: [
            {
              type: "text",
              text: `persona_setup: unknown preset "${preset}". Known: ${Object.keys(PRESETS).join(", ")}`,
            },
          ],
          details: {
            ok: false,
            error: `unknown preset: ${preset}`,
          },
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

      const templatesRoot = resolveTemplatesRoot(api.rootDir);

      const setupParams: SetupParams = {
        preset: preset as SetupParams["preset"],
        name: coerceString(p.name),
        role: coerceString(p.role),
        goal: coerceString(p.goal),
        soul: coerceString(p.soul),
        force: p.force === true,
        dryRun: p.dryRun === true,
      };

      try {
        const result = await runSetup(
          resolution.path,
          templatesRoot,
          PLUGIN_VERSION,
          setupParams
        );
        // Surface the result to the session extension cache so the wizard
        // UI descriptor and /persona-setup status command can see it.
        // Tool calls don't carry a sessionKey today — the cache falls back
        // to "__global__", which the extension's project() reducer reads.
        if (!setupParams.dryRun) applySetupResult(undefined, result);
        return {
          content: [{ type: "text", text: renderSetupResult(result) }],
          details: result,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `persona_setup failed: ${msg}` }],
          details: { ok: false, error: msg },
        };
      }
    },
  });
}
