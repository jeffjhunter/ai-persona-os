/**
 * Slash command — `/persona-setup [preset|status]`.
 *
 * Bypasses the LLM. Routes to the same library code as the `persona_setup`
 * tool so chat callers and agents get identical behaviour. Three modes:
 *
 *   /persona-setup                — show preset menu
 *   /persona-setup status         — last-run summary
 *   /persona-setup <preset> [...] — run setup, optional key=value flags
 *
 * Examples:
 *   /persona-setup coding-assistant name=Jeff role="founder"
 *   /persona-setup executive-assistant soul=03-jarvis.md
 *   /persona-setup custom dryRun=true
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import {
  PRESETS,
  runSetup,
  renderSetupResult,
  resolveTemplatesRoot,
  listAvailableSouls,
  type SetupParams,
} from "../lib/setup.js";
import { PLUGIN_VERSION } from "../lib/version.js";
import {
  applySetupResult,
  getSetupProgress,
} from "../state/setup_extension.js";

type Api = OpenClawPluginApi;

const COMMAND_NAME = "persona-setup";

/**
 * Parse `key=value key2="quoted value" key3=other` style argument strings.
 * Quotes are optional and stripped. Unknown keys are returned verbatim so
 * callers can validate them.
 */
function parseKVArgs(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Match key=value where value is either "quoted" or a single bareword.
  const re = /(\w[\w-]*)=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const key = m[1];
    const val = m[2] !== undefined ? m[2].replace(/\\"/g, '"') : (m[3] ?? "");
    out[key] = val;
  }
  return out;
}

function renderPresetMenu(): string {
  const lines: string[] = [];
  lines.push("AI Persona OS — Setup wizard");
  lines.push("");
  lines.push("Pick a preset:");
  for (const spec of Object.values(PRESETS)) {
    lines.push(`  /persona-setup ${spec.id}`);
    lines.push(`      ${spec.displayName} — ${spec.description}`);
  }
  lines.push("");
  lines.push("Optional flags (any preset):");
  lines.push("  name=\"Your name\"          → written into USER.md Setup Inputs");
  lines.push("  role=\"Your role\"          → written into USER.md Setup Inputs");
  lines.push("  goal=\"Current goal\"       → written into USER.md Setup Inputs");
  lines.push("  soul=03-jarvis.md         → override SOUL.md from the gallery");
  lines.push("  dryRun=true               → preview the file plan, no writes");
  lines.push("  force=true                → overwrite existing files");
  lines.push("");
  lines.push("Inspect progress: /persona-setup status");
  return lines.join("\n");
}

function renderProgress(api: Api): string {
  const p = getSetupProgress(undefined);
  if (!p.lastPreset) {
    return "AI Persona OS — setup status\n\nNo persona_setup run recorded in this gateway session.";
  }
  const lines: string[] = [];
  lines.push("AI Persona OS — setup status");
  lines.push(`Last preset:    ${p.lastPreset}`);
  if (p.lastRunAt) lines.push(`Last run:       ${p.lastRunAt}`);
  lines.push(`Bootstrapped:   ${p.hasBootstrapped ? "yes" : "no"}`);
  if (p.lastInputs) {
    const bits = [];
    if (p.lastInputs.name) bits.push(`name=${p.lastInputs.name}`);
    if (p.lastInputs.role) bits.push(`role=${p.lastInputs.role}`);
    if (p.lastInputs.goal) bits.push(`goal=${p.lastInputs.goal}`);
    if (p.lastInputs.soul) bits.push(`soul=${p.lastInputs.soul}`);
    if (bits.length > 0) lines.push(`Inputs:         ${bits.join(", ")}`);
  }
  if (p.lastWritten && p.lastWritten.length > 0) {
    lines.push(`Wrote:          ${p.lastWritten.join(", ")}`);
  }
  if (p.lastSkipped && p.lastSkipped.length > 0) {
    lines.push(`Skipped:        ${p.lastSkipped.join(", ")}`);
  }
  // Mention api just so the linter doesn't fuss; useful for future extension.
  void api;
  return lines.join("\n");
}

export function registerPersonaSetupCommand(api: Api): void {
  api.registerCommand({
    name: COMMAND_NAME,
    description:
      "Run the AI Persona OS setup wizard. With no args: shows the preset menu. " +
      "With a preset: bootstraps the workspace. With 'status': shows last-run progress.",
    acceptsArgs: true,
    requireAuth: true,
    agentPromptGuidance: [
      "Use /persona-setup when the user wants to bootstrap or re-bootstrap their " +
        "AI Persona OS workspace. The command bypasses you and runs the wizard directly.",
    ],
    handler: async (ctx) => {
      const raw = (ctx.args ?? "").trim();

      if (raw === "" || raw === "help") {
        return { text: renderPresetMenu(), continueAgent: false };
      }
      if (raw === "status") {
        return { text: renderProgress(api), continueAgent: false };
      }
      if (raw === "souls" || raw === "gallery") {
        const templatesRoot = resolveTemplatesRoot(api.rootDir);
        const souls = await listAvailableSouls(templatesRoot);
        const lines: string[] = ["AI Persona OS — soul gallery", ""];
        lines.push(`Prebuilt souls (${souls.prebuilt.length}):`);
        for (const s of souls.prebuilt) lines.push(`  ${s}`);
        lines.push("");
        lines.push(`Iconic characters (${souls.iconic.length}):`);
        for (const s of souls.iconic) lines.push(`  ${s}`);
        lines.push("");
        lines.push("Apply with: /persona-setup <preset> soul=<filename>");
        return { text: lines.join("\n"), continueAgent: false };
      }

      // First token = preset, rest = key=value flags
      const firstSpace = raw.indexOf(" ");
      const preset = (firstSpace < 0 ? raw : raw.slice(0, firstSpace)).trim();
      const rest = firstSpace < 0 ? "" : raw.slice(firstSpace + 1);

      if (!(preset in PRESETS)) {
        const lines = [
          `Unknown preset "${preset}".`,
          "",
          renderPresetMenu(),
        ];
        return { text: lines.join("\n"), continueAgent: false };
      }

      const kv = parseKVArgs(rest);
      const setupParams: SetupParams = {
        preset: preset as SetupParams["preset"],
        name: kv.name,
        role: kv.role,
        goal: kv.goal,
        soul: kv.soul,
        force: kv.force === "true" || kv.force === "1",
        dryRun: kv.dryRun === "true" || kv.dryRun === "1",
      };

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

      try {
        const result = await runSetup(
          resolution.path,
          templatesRoot,
          PLUGIN_VERSION,
          setupParams
        );
        if (!setupParams.dryRun) applySetupResult(ctx.sessionKey, result);
        return { text: renderSetupResult(result), continueAgent: false };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          text: `persona-setup failed: ${msg}`,
          continueAgent: false,
          isError: true,
        };
      }
    },
  });
}
