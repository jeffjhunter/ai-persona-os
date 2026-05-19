/**
 * Tool: persona_recall
 *
 * Search the AI Persona OS workspace memory for a query. Walks MEMORY.md and
 * memory/*.md, scores lines by token-overlap, boosts recent daily logs, and
 * returns the top matches with file:line citations.
 *
 * Read-only. Safe to call repeatedly. Intentionally a simple in-process
 * scan — when a richer memory engine ships in Phase 6 the same surface can
 * delegate to it without callers changing.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  resolveWorkspace,
  type WorkspaceResolutionInput,
} from "../lib/workspace.js";
import { recallMemory, type RecallSummary } from "../lib/memory-recall.js";

type Api = OpenClawPluginApi;

type RecallParams = {
  query?: unknown;
  limit?: unknown;
};

function renderResults(summary: RecallSummary): string {
  if (summary.results.length === 0) {
    return `No matches for "${summary.query}" in ${summary.filesScanned} file(s).`;
  }
  const lines: string[] = [];
  lines.push(
    `Recall "${summary.query}" — ${summary.matchesFound} match(es) across ${summary.filesScanned} file(s). Top ${summary.results.length}:`
  );
  for (const r of summary.results) {
    lines.push("");
    lines.push(`${r.file}:${r.line} (score ${r.score.toFixed(1)})`);
    lines.push(`  ${r.text}`);
    for (const c of r.context) {
      const trimmed = c.trim();
      if (trimmed.length > 0) lines.push(`  ${trimmed}`);
    }
  }
  return lines.join("\n");
}

export function registerPersonaRecall(api: Api): void {
  api.registerTool({
    name: "persona_recall",
    label: "Recall from workspace memory",
    description:
      "Search the AI Persona OS workspace memory (MEMORY.md + memory/*.md) " +
      "for a free-text query. Returns the top-scoring matches with " +
      "file:line citations. Recent daily logs (memory/YYYY-MM-DD*.md within " +
      "the last 7 days) are scored higher. Read-only — no writes.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          minLength: 2,
          description: "Free-text query. Tokens of length ≥ 2 are matched case-insensitively.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "Max number of results to return (default 10, max 50).",
        },
      },
    },
    async execute(
      _toolCallId,
      params
    ): Promise<{
      content: Array<{ type: "text"; text: string }>;
      details: RecallSummary;
    }> {
      const p = (params ?? {}) as RecallParams;
      const query = typeof p.query === "string" ? p.query.trim() : "";
      if (query.length === 0) {
        const empty: RecallSummary = {
          query: "",
          filesScanned: 0,
          matchesFound: 0,
          results: [],
        };
        return {
          content: [{ type: "text", text: "persona_recall: query is required." }],
          details: empty,
        };
      }
      const limit =
        typeof p.limit === "number" && Number.isFinite(p.limit)
          ? Math.floor(p.limit)
          : undefined;

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

      const summary = await recallMemory(resolution.path, query, { limit });
      return {
        content: [{ type: "text", text: renderResults(summary) }],
        details: summary,
      };
    },
  });
}
