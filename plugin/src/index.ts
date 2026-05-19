/**
 * AI Persona OS — OpenClaw plugin entry.
 *
 * v3.0.0-alpha.1 — Phase 2 (scaffold). Registers a single tool
 * (persona_workspace_resolve) and pairs every register* with a runtime
 * lifecycle cleanup entry per the host-hooks recipe doc (#18 + § Cleanup matrix).
 *
 * Future phases (per DESIGN-V3.md):
 *   - Phase 3: persona_status, persona_recall, persona_route_check (read-only)
 *   - Phase 4: persona_setup as Recipe D (session extension + commands + UI card)
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
import { registerStatusMeterUi } from "./ui/status_meter.js";

export default definePluginEntry({
  id: "ai-persona-os",
  name: "AI Persona OS",
  description:
    "The complete operating system for OpenClaw agents. 24 souls, " +
    "SOUL.md Maker, memory tools, Discord routing fix, native heartbeat, " +
    "never-forget context. By Jeff J Hunter.",
  register(api) {
    const toolCount = 5;
    const uiDescriptorCount = 1;
    api.logger.info(
      `ai-persona-os@${PLUGIN_VERSION} loading — registering ${toolCount} tool(s) + ${uiDescriptorCount} UI descriptor(s)`
    );

    // Tools
    registerPersonaWorkspaceResolve(api);
    registerPersonaStatus(api);
    registerPersonaRecall(api);
    registerPersonaRouteCheck(api);
    registerPersonaDoctor(api);

    // Control UI descriptors
    registerStatusMeterUi(api);

    // Lifecycle cleanup — paired with every register* call per the
    // host-hooks recipe doc § Cleanup matrix. For alpha.1 there's nothing
    // to clean up yet (no timers, sockets, watchers, or external clients).
    // The hook exists so future register* additions slot into the same
    // discipline pattern.
    api.lifecycle.registerRuntimeLifecycle({
      id: "ai-persona-os.lifecycle",
      cleanup: async ({ reason }) => {
        api.logger.info(`ai-persona-os cleanup reason=${reason}`);
        // No-op for alpha.1. Future cleanup:
        //   - clear any in-flight dream-consolidation jobs
        //   - close any heartbeat-emission timers
        //   - flush pending event subscriptions
      },
    });

    api.logger.info("ai-persona-os ready");
  },
});
