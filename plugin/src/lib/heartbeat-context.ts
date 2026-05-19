/**
 * Heartbeat prompt contribution formatter.
 *
 * Phase 5: replaces the v2.0 30-line HEARTBEAT.md with a few-token
 * deterministic context string the plugin emits ONLY on heartbeat turns.
 *
 * Two formats:
 *   - "compact"  — one line: "🟢 ai-persona-os · MEMORY 5% · today 2 · v3.0.0-alpha.4"
 *                  ~25-35 tokens, ≥95% reduction vs HEARTBEAT.md.
 *   - "verbose"  — adds a short bulleted breakdown + active routing warnings.
 *                  ~80-130 tokens, still 80%+ reduction vs HEARTBEAT.md.
 *
 * Pure function: takes structured snapshots, returns a string. Hook handler
 * (hooks/heartbeat_prompt_contribution.ts) is responsible for collecting the
 * snapshots and wrapping the output in `{ appendContext }`.
 */

import {
  overallEmoji,
  type WorkspaceStatusSnapshot,
} from "./workspace-status.js";
import type { RouteCheckReport } from "./route-check.js";

export type HeartbeatFormat = "compact" | "verbose";

export type HeartbeatContextInput = {
  snapshot: WorkspaceStatusSnapshot;
  /** Optional — verbose mode surfaces routing issues. Compact mode ignores. */
  routes?: RouteCheckReport;
  /** Plugin version, displayed in compact line. */
  pluginVersion: string;
  /** Format. Default "compact". */
  format?: HeartbeatFormat;
  /** Inject a clock for testability. */
  now?: Date;
};

/** Compact one-liner — the default. */
function renderCompact(input: HeartbeatContextInput): string {
  const s = input.snapshot;
  const emoji = overallEmoji(s.overall);
  const memPct = s.memory.exists ? `${s.memory.pctUsed}%` : "—";
  const version = s.version ? `v${s.version}` : `v${input.pluginVersion}`;
  const missing =
    s.missingRequired.length > 0
      ? ` · missing ${s.missingRequired.join("/")}`
      : "";
  return `${emoji} ai-persona-os · MEMORY ${memPct} · today ${s.activityToday} · ${version}${missing}`;
}

/** Verbose — compact line + short bullets + routing warnings if any. */
function renderVerbose(input: HeartbeatContextInput): string {
  const s = input.snapshot;
  const lines: string[] = [renderCompact(input)];

  if (s.memory.state === "warn" || s.memory.state === "critical") {
    lines.push(
      `  · MEMORY.md at ${s.memory.pctUsed}% of ${s.memory.limitBytes} B (${s.memory.state}) — prune soon`
    );
  }
  if (s.missingRecommended.length > 0) {
    lines.push(`  · recommended files missing: ${s.missingRecommended.join(", ")}`);
  }
  if (s.activityToday === 0 && s.memoryDirEntries !== undefined) {
    lines.push("  · no daily log entries today — consider a checkpoint");
  }

  if (input.routes && input.routes.configReadable) {
    const warns = input.routes.checks.filter((c) => c.status !== "ok");
    if (warns.length > 0) {
      lines.push("  · routing:");
      for (const w of warns) {
        const tag = w.status === "missing" || w.status === "error" ? "🔴" : "🟡";
        lines.push(`    ${tag} ${w.label} — ${w.message}`);
      }
    }
  }

  return lines.join("\n");
}

/** Main entry — pick format, render. */
export function renderHeartbeatContext(input: HeartbeatContextInput): string {
  const fmt: HeartbeatFormat = input.format === "verbose" ? "verbose" : "compact";
  return fmt === "verbose" ? renderVerbose(input) : renderCompact(input);
}

/**
 * Rough token estimate (no model dependency). Useful for verifying the
 * "≥90% reduction vs HEARTBEAT.md" claim in tests without bringing in a
 * tokenizer. ~4 chars/token is the conservative side of GPT-style tokenizers
 * for prose with emojis; we round up.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The v2.0 HEARTBEAT.md baseline for reduction-percentage assertions. */
export const HEARTBEAT_MD_V2_BASELINE_TOKENS = 600;

/** Whether a string fits the compact token budget. */
export function fitsCompactBudget(text: string, maxTokens = 50): boolean {
  return approxTokens(text) <= maxTokens;
}
