/**
 * Tool: persona_route_check
 *
 * Read-only audit of openclaw.json routing settings:
 *  - accounts.default
 *  - channels.discord.defaultAccount
 *  - agents.defaults.heartbeat.target
 *
 * Returns a 🟢🟡🔴 dashboard with one-line remediation hints. Does NOT write
 * — config-fixing lands in Phase 6 as `persona_route_check --fix`.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  runRouteCheck,
  overallRouteEmoji,
  severityEmoji,
  type RouteCheckReport,
} from "../lib/route-check.js";

type Api = OpenClawPluginApi;

function render(report: RouteCheckReport): string {
  if (!report.configReadable) {
    return `🔴 Route check failed: ${report.configError ?? "unknown error"} (path: ${report.configPath})`;
  }
  const lines: string[] = [];
  lines.push(`${overallRouteEmoji(report.overall)} Routing audit — ${report.configPath}`);
  lines.push("");
  for (const c of report.checks) {
    lines.push(`${severityEmoji(c.status)} ${c.label} (${c.key})`);
    lines.push(`   ${c.message}`);
    if (c.hint) lines.push(`   hint: ${c.hint}`);
  }
  return lines.join("\n");
}

export function registerPersonaRouteCheck(api: Api): void {
  api.registerTool({
    name: "persona_route_check",
    label: "Discord/heartbeat routing audit",
    description:
      "Audit openclaw.json for the three routing-critical settings that " +
      "AI Persona OS depends on: accounts.default, " +
      "channels.discord.defaultAccount, and agents.defaults.heartbeat.target. " +
      "Returns 🟢🟡🔴 status + one-line remediation hint per check. " +
      "Read-only. Use persona_route_check --fix (Phase 6) to apply fixes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute(
      _toolCallId,
      _params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: RouteCheckReport;
    }> {
      const report = await runRouteCheck(process.env);
      return {
        content: [{ type: "text", text: render(report) }],
        details: report,
      };
    },
  });
}
