/**
 * Safe doctor fixes — Phase 6 scope is intentionally narrow:
 *
 *   - workspace.missing.*  → write the missing required/recommended file
 *                            from the bundled templates
 *   - version.missing      → write VERSION.md with the plugin version
 *
 * NOT in scope here:
 *   - routing.*            → mutates openclaw.json. Needs operator.admin
 *                            scope gating per DESIGN-V3. Phase 7.
 *   - config.tools.profile → mutates openclaw.json. Same deal.
 *   - memory.size.*        → can't auto-prune curated content. User work.
 *
 * Each fixer reports `applied: true|false` + a short message so the doctor
 * tool can surface what changed vs what was skipped.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { atomicWriteFile } from "./fs-write.js";
import type { DoctorFinding } from "./doctor.js";

export type DoctorFixApplied = {
  findingId: string;
  applied: boolean;
  /** Workspace-relative path written, when applicable. */
  wrote?: string;
  /** Human-readable note for the report. */
  message: string;
};

/** Mapping from missing-file finding id → template filename + workspace target. */
const MISSING_FILE_MAP: Record<string, { template: string; target: string }> = {
  "workspace.missing.SOUL.md": { template: "SOUL-template.md", target: "SOUL.md" },
  "workspace.missing.MEMORY.md": { template: "MEMORY-template.md", target: "MEMORY.md" },
  "workspace.missing.USER.md": { template: "USER-template.md", target: "USER.md" },
  "workspace.missing.IDENTITY.md": { template: "USER-template.md", target: "IDENTITY.md" },
  "workspace.missing.AGENTS.md": { template: "AGENTS-template.md", target: "AGENTS.md" },
  "workspace.missing.HEARTBEAT.md": { template: "HEARTBEAT-template.md", target: "HEARTBEAT.md" },
  "workspace.missing.TOOLS.md": { template: "TOOLS-template.md", target: "TOOLS.md" },
};

async function readTemplate(
  templatesRoot: string,
  filename: string
): Promise<string | undefined> {
  try {
    return await fs.readFile(join(templatesRoot, filename), "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Apply safe fixes to a finding list and return per-finding outcomes.
 * Findings not covered by a safe fixer are reported as `applied: false`
 * with the reason. Never throws — failures are folded into the report.
 */
export async function applySafeFixes(
  findings: DoctorFinding[],
  ctx: {
    workspace: string;
    templatesRoot: string;
    pluginVersion: string;
  }
): Promise<DoctorFixApplied[]> {
  const results: DoctorFixApplied[] = [];

  for (const f of findings) {
    if (f.id === "version.missing") {
      try {
        const target = join(ctx.workspace, "VERSION.md");
        const content = `${ctx.pluginVersion}\n`;
        await atomicWriteFile(target, content);
        results.push({
          findingId: f.id,
          applied: true,
          wrote: "VERSION.md",
          message: `wrote VERSION.md with "${ctx.pluginVersion}"`,
        });
      } catch (e) {
        results.push({
          findingId: f.id,
          applied: false,
          message: `failed to write VERSION.md: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      continue;
    }

    const missing = MISSING_FILE_MAP[f.id];
    if (missing) {
      const content = await readTemplate(ctx.templatesRoot, missing.template);
      if (!content) {
        results.push({
          findingId: f.id,
          applied: false,
          message: `template ${missing.template} not found in bundle`,
        });
        continue;
      }
      try {
        const target = join(ctx.workspace, missing.target);
        // Defensive: never overwrite if the file appeared between
        // doctor's plan time and now.
        try {
          await fs.stat(target);
          results.push({
            findingId: f.id,
            applied: false,
            message: `${missing.target} already exists — skipping (no overwrite)`,
          });
          continue;
        } catch {
          // not present — fine, proceed
        }
        await atomicWriteFile(target, content);
        results.push({
          findingId: f.id,
          applied: true,
          wrote: missing.target,
          message: `wrote ${missing.target} from ${missing.template}`,
        });
      } catch (e) {
        results.push({
          findingId: f.id,
          applied: false,
          message: `failed to write ${missing.target}: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
      continue;
    }

    // Out-of-scope finding categories — report what we'd skip.
    if (f.category === "routing" || f.category === "config") {
      results.push({
        findingId: f.id,
        applied: false,
        message:
          "skipped — routing/config fixes mutate openclaw.json and require operator.admin (Phase 7).",
      });
      continue;
    }
    if (f.category === "memory") {
      results.push({
        findingId: f.id,
        applied: false,
        message:
          "skipped — MEMORY.md size needs human curation; persona_dream can help summarize first.",
      });
      continue;
    }

    results.push({
      findingId: f.id,
      applied: false,
      message: "skipped — no safe auto-fix for this finding category.",
    });
  }

  return results;
}

export function renderFixReport(applied: DoctorFixApplied[]): string {
  if (applied.length === 0) return "  (no findings to fix)";
  const lines: string[] = [];
  for (const a of applied) {
    const emoji = a.applied ? "✓" : "·";
    lines.push(`  ${emoji} [${a.findingId}] ${a.message}`);
  }
  return lines.join("\n");
}
