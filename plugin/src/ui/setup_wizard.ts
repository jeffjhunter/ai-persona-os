/**
 * Second Control UI descriptor — the setup-wizard card.
 *
 * Phase 4 contribution per DESIGN-V3.md § Audit Update (Recipe D: Setup
 * Wizard). The descriptor declares a persistent card a host can render in the
 * session shell:
 *
 *   - "preset chooser" surface when no setup has run yet
 *   - "progress" surface when a setup has run, summarizing the last result
 *   - links to /persona-setup, /persona-setup status, /persona-setup souls
 *
 * Data source is the `ai-persona-os/setup` session extension (registered in
 * `state/setup_extension.ts`). Host renderers that don't understand
 * `kind: "wizard-card"` can ignore this descriptor; the slash command + tool
 * remain fully usable on their own.
 *
 * Paired with a runtime-lifecycle cleanup.
 */

import type {
  OpenClawPluginApi,
  PluginJsonValue,
} from "openclaw/plugin-sdk/plugin-entry";
import { PLUGIN_VERSION } from "../lib/version.js";
import { PRESETS } from "../lib/setup.js";
import { SETUP_NAMESPACE } from "../state/setup_extension.js";

type Api = OpenClawPluginApi;

export const SETUP_WIZARD_DESCRIPTOR_ID = "ai-persona-os.setup-wizard";

const WIZARD_SCHEMA: PluginJsonValue = {
  kind: "wizard-card",
  pluginVersion: PLUGIN_VERSION,
  placement: "session-panel",
  refreshHint: "on-session-state-change",
  steps: [
    { id: "choose-preset", label: "Choose a preset", required: true },
    { id: "personalize", label: "Add name / role / goal", required: false },
    { id: "soul-override", label: "Pick a soul (optional)", required: false },
    { id: "run-setup", label: "Run persona_setup", required: true },
  ],
  presets: Object.values(PRESETS).map((p) => ({
    id: p.id,
    label: p.displayName,
    description: p.description,
    defaultSoul: p.defaultSoul,
    defaultUser: p.defaultUser,
  })),
  actions: [
    {
      id: "open-menu",
      label: "Open setup menu",
      kind: "command",
      command: "/persona-setup",
    },
    {
      id: "show-status",
      label: "Show last setup status",
      kind: "command",
      command: "/persona-setup status",
    },
    {
      id: "browse-souls",
      label: "Browse soul gallery",
      kind: "command",
      command: "/persona-setup souls",
    },
  ],
  source: {
    kind: "sessionExtension",
    pluginId: "ai-persona-os",
    namespace: SETUP_NAMESPACE,
    shape: {
      lastPreset: "string | null",
      lastRunAt: "string | null",
      hasBootstrapped: "boolean",
      lastInputs: "{ name|role|goal|soul: string | null } | null",
      lastWritten: "string[]",
      lastSkipped: "string[]",
    },
  },
};

export function registerSetupWizardUi(api: Api): void {
  api.session.controls.registerControlUiDescriptor({
    id: SETUP_WIZARD_DESCRIPTOR_ID,
    surface: "session",
    label: "AI Persona OS — Setup",
    description:
      "Persistent setup wizard card. Shows preset chooser when the workspace " +
      "hasn't been bootstrapped yet; switches to progress view once a setup " +
      "run has been recorded. Backed by the ai-persona-os/setup session extension.",
    placement: "session-panel",
    schema: WIZARD_SCHEMA,
  });

  api.lifecycle.registerRuntimeLifecycle({
    id: `${SETUP_WIZARD_DESCRIPTOR_ID}.lifecycle`,
    description: "Cleanup for the AI Persona OS setup-wizard UI descriptor.",
    cleanup: async ({ reason }) => {
      api.logger.info(
        `ai-persona-os setup-wizard UI cleanup reason=${reason}`
      );
    },
  });
}
