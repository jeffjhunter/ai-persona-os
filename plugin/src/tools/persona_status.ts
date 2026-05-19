/**
 * Tool: persona_status
 *
 * Read-only workspace health dashboard. Returns 🟢🟡🔴 indicators for core
 * AI Persona OS files, MEMORY.md size vs limit, today's activity in memory/,
 * and the version string from VERSION.md.
 *
 * Pure reads only. No writes, no side effects. Safe to call any time.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import {
  inspectWorkspace,
  overallEmoji,
  fileEmoji,
  satisfiedGroups,
  DEFAULT_MEMORY_LIMIT_BYTES,
  type WorkspaceStatusSnapshot,
} from "../lib/workspace-status.js";

type Api = OpenClawPluginApi;

type StatusParams = {
  format?: "compact" | "detailed";
};

type StatusDetails = WorkspaceStatusSnapshot & {
  source: string;
};

function renderCompact(snap: WorkspaceStatusSnapshot): string {
  const o = overallEmoji(snap.overall);
  const memPct = snap.memory.exists ? `${snap.memory.pctUsed}%` : "—";
  const ver = snap.version ? `v${snap.version}` : "v?";
  const missing =
    snap.missingRequired.length > 0
      ? ` · missing: ${snap.missingRequired.join(", ")}`
      : "";
  return `${o} AI Persona OS · MEMORY ${memPct} · today ${snap.activityToday} · ${ver}${missing}`;
}

function renderDetailed(snap: WorkspaceStatusSnapshot): string {
  const sat = satisfiedGroups(snap);
  const lines: string[] = [];
  lines.push(`${overallEmoji(snap.overall)} AI Persona OS — workspace status`);
  lines.push(`Workspace: ${snap.workspace}`);
  lines.push("");
  lines.push("Files:");
  for (const f of snap.files) {
    const e = fileEmoji(f, sat);
    const size = f.exists ? ` (${f.bytes} B)` : "";
    lines.push(`  ${e} ${f.key}${size}`);
  }
  lines.push("");
  if (snap.memory.exists) {
    const memLine = `MEMORY.md: ${snap.memory.bytes} / ${snap.memory.limitBytes} B (${snap.memory.pctUsed}%) — ${snap.memory.state}`;
    lines.push(memLine);
  } else {
    lines.push("MEMORY.md: missing");
  }
  if (snap.memoryDirEntries === undefined) {
    lines.push("memory/: directory not present");
  } else {
    lines.push(
      `memory/: ${snap.memoryDirEntries} file(s) · ${snap.activityToday} from today`
    );
  }
  lines.push(`Version: ${snap.version ?? "unknown (no VERSION.md)"}`);
  if (snap.missingRequired.length > 0) {
    lines.push("");
    lines.push(`Required missing: ${snap.missingRequired.join(", ")}`);
  }
  if (snap.missingRecommended.length > 0) {
    lines.push(`Recommended missing: ${snap.missingRecommended.join(", ")}`);
  }
  return lines.join("\n");
}

export function registerPersonaStatus(api: Api): void {
  api.registerTool({
    name: "persona_status",
    label: "Workspace health dashboard",
    description:
      "Read-only health dashboard for the AI Persona OS workspace. Returns " +
      "🟢🟡🔴 indicators for core files (SOUL.md, MEMORY.md, USER.md / " +
      "IDENTITY.md, AGENTS.md), MEMORY.md size against the 4 KB curated " +
      "limit, count of today's daily-log entries in memory/, and the version " +
      "string from VERSION.md. Safe to call any time — no writes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        format: {
          type: "string",
          enum: ["compact", "detailed"],
          description:
            "Output format. 'compact' is a single line. 'detailed' lists every file with size.",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: StatusDetails;
    }> {
      const p = (params ?? {}) as StatusParams;
      const format = p.format === "detailed" ? "detailed" : "compact";

      const pluginCfg = api.pluginConfig as
        | { workspaceOverride?: unknown; heartbeat?: { memoryLimitKB?: unknown } }
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

      const memLimitKB =
        typeof pluginCfg?.heartbeat?.memoryLimitKB === "number"
          ? pluginCfg.heartbeat.memoryLimitKB
          : undefined;
      const memoryLimitBytes =
        memLimitKB && memLimitKB > 0 ? memLimitKB * 1024 : DEFAULT_MEMORY_LIMIT_BYTES;

      const snapshot = await inspectWorkspace(resolution.path, { memoryLimitBytes });
      const text =
        format === "detailed" ? renderDetailed(snapshot) : renderCompact(snapshot);

      return {
        content: [{ type: "text", text }],
        details: { ...snapshot, source: resolution.source },
      };
    },
  });
}
