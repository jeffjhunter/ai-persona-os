/**
 * AI Persona OS — OpenClaw plugin entry.
 *
 * v3.0.0-alpha.3 — Phase 4 (setup wizard). Registers six tools, two Control
 * UI descriptors, a session extension for setup progress, and the
 * `/persona-setup` slash command. Every register* is paired with a runtime
 * lifecycle cleanup per the host-hooks recipe doc § Cleanup matrix.
 *
 * Phase history (per DESIGN-V3.md):
 *   - Phase 2: scaffold + persona_workspace_resolve
 *   - Phase 3: persona_status, persona_recall, persona_route_check,
 *              persona_doctor + status-meter UI descriptor
 *   - Phase 4: persona_setup + setup-wizard UI descriptor + setup session
 *              extension + /persona-setup command (this release)
 *   - Phase 5: heartbeat_prompt_contribution replaces HEARTBEAT.md
 *   - Phase 6: persona_checkpoint, switch_soul, blend_souls, dream
 *   - Phase 7: scoped slash commands + CLI parity
 *   - Phase 8: tests + ship
 */

import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { PLUGIN_VERSION } from "./lib/version.js";
import { registerPersonaWorkspaceResolve } from "./tools/persona_workspace_resolve.js";
import { registerPersonaStatus } from "./tools/persona_status.js";
import { registerPersonaRecall } from "./tools/persona_recall.js";
import { registerPersonaRouteCheck } from "./tools/persona_route_check.js";
import { registerPersonaDoctor } from "./tools/persona_doctor.js";
import { registerPersonaSetup } from "./tools/persona_setup.js";
import { registerStatusMeterUi } from "./ui/status_meter.js";
import { registerSetupWizardUi } from "./ui/setup_wizard.js";
import { registerSetupExtension } from "./state/setup_extension.js";
import { registerPersonaSetupCommand } from "./commands/persona_setup_command.js";
import { registerHeartbeatHook } from "./hooks/heartbeat_prompt_contribution.js";

export default definePluginEntry({
  id: "ai-persona-os",
  name: "AI Persona OS",
  description:
    "The complete operating system for OpenClaw agents. 24 souls, " +
    "SOUL.md Maker, memory tools, Discord routing fix, native heartbeat, " +
    "never-forget context. By Jeff J Hunter.",
  register(api) {
    const toolCount = 6;
    const uiDescriptorCount = 2;
    const commandCount = 1;
    const hookCount = 1;
    api.logger.info(
      `ai-persona-os@${PLUGIN_VERSION} loading — ${toolCount} tool(s), ${uiDescriptorCount} UI descriptor(s), ${commandCount} command(s), ${hookCount} hook(s)`
    );

    // Tools
    registerPersonaWorkspaceResolve(api);
    registerPersonaStatus(api);
    registerPersonaRecall(api);
    registerPersonaRouteCheck(api);
    registerPersonaDoctor(api);
    registerPersonaSetup(api);

    // Session state extensions
    registerSetupExtension(api);

    // Slash commands (bypass the LLM agent)
    registerPersonaSetupCommand(api);

    // Hook handlers (fire on host-emitted events; heartbeat_prompt_contribution
    // is on a heartbeat turn only — no token cost on user-initiated turns).
    registerHeartbeatHook(api);

    // Control UI descriptors
    registerStatusMeterUi(api);
    registerSetupWizardUi(api);

    // Catch-all lifecycle for the plugin-level "tear down anything that
    // doesn't belong to a more specific register*" path. Per-feature
    // cleanups live alongside their register* calls.
    api.lifecycle.registerRuntimeLifecycle({
      id: "ai-persona-os.lifecycle",
      description: "Catch-all cleanup for the AI Persona OS plugin.",
      cleanup: async ({ reason }) => {
        api.logger.info(`ai-persona-os cleanup reason=${reason}`);
        // Per-feature teardown lives next to each register*:
        //   - state/setup_extension.ts (cache clear)
        //   - ui/status_meter.ts (descriptor cleanup)
        //   - ui/setup_wizard.ts (descriptor cleanup)
      },
    });

    api.logger.info("ai-persona-os ready");
  },
});
