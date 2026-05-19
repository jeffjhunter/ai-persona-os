/**
 * Composite lint — assemble a single health picture by reusing the building
 * blocks from `workspace-status` and `route-check`, plus a couple of
 * config-level checks (tools.profile, VERSION.md mismatch) that don't fit
 * either of those single-purpose modules.
 *
 * Lint-only. No fixes — `persona_doctor --fix` is Phase 6 work.
 */

import {
  inspectWorkspace,
  type WorkspaceStatusSnapshot,
  type WorkspaceStatusOptions,
  DEFAULT_MEMORY_LIMIT_BYTES,
} from "./workspace-status.js";
import {
  runRouteCheck,
  type RouteCheckReport,
} from "./route-check.js";
import {
  readOpenClawConfig,
  getPath,
  type OpenClawConfigSnapshot,
} from "./openclaw-config.js";

export type DoctorSeverity = "ok" | "warn" | "critical";

export type DoctorFinding = {
  /** Stable id so future --fix can target a specific finding. */
  id: string;
  category: "workspace" | "memory" | "routing" | "config" | "version";
  severity: DoctorSeverity;
  title: string;
  detail: string;
  /** A free-text remediation hint, when applicable. */
  hint?: string;
};

export type DoctorReport = {
  /** Resolved workspace path that was inspected. */
  workspace: string;
  /** Resolved openclaw.json path that was read. */
  configPath: string;
  /** Plugin's own runtime version (from src/index.ts) for VERSION.md mismatch reporting. */
  pluginVersion: string;
  /** Version string from VERSION.md if present, else undefined. */
  workspaceVersion?: string;
  /** Worst severity across all findings. */
  overall: DoctorSeverity;
  findings: DoctorFinding[];
  /** Underlying snapshots, for callers that want the structured data. */
  workspaceSnapshot: WorkspaceStatusSnapshot;
  routeReport: RouteCheckReport;
};

function emojiFor(sev: DoctorSeverity): string {
  return sev === "ok" ? "🟢" : sev === "warn" ? "🟡" : "🔴";
}

function workspaceFindings(snap: WorkspaceStatusSnapshot): DoctorFinding[] {
  const out: DoctorFinding[] = [];
  for (const name of snap.missingRequired) {
    out.push({
      id: `workspace.missing.${name}`,
      category: "workspace",
      severity: "critical",
      title: `Required file missing: ${name}`,
      detail: `${name} is not present in ${snap.workspace}.`,
      hint:
        "Run persona_setup (Phase 4) to bootstrap the workspace, or create " +
        `the file manually from the AI Persona OS template.`,
    });
  }
  for (const name of snap.missingRecommended) {
    out.push({
      id: `workspace.missing.${name}`,
      category: "workspace",
      severity: "warn",
      title: `Recommended file missing: ${name}`,
      detail: `${name} is not present. Some features expect it.`,
      hint:
        name === "USER.md" || name === "IDENTITY.md"
          ? "Create a user identity file so the agent knows who you are."
          : `Add a ${name} from the AI Persona OS templates.`,
    });
  }
  if (snap.memory.state === "critical") {
    out.push({
      id: "memory.size.critical",
      category: "memory",
      severity: "critical",
      title: `MEMORY.md at ${snap.memory.pctUsed}% of limit`,
      detail: `${snap.memory.bytes} / ${snap.memory.limitBytes} bytes used. Above the 95% threshold.`,
      hint:
        "Prune MEMORY.md to its essence and offload older detail to memory/<topic>.md files.",
    });
  } else if (snap.memory.state === "warn") {
    out.push({
      id: "memory.size.warn",
      category: "memory",
      severity: "warn",
      title: `MEMORY.md at ${snap.memory.pctUsed}% of limit`,
      detail: `${snap.memory.bytes} / ${snap.memory.limitBytes} bytes used. Above the 75% threshold.`,
      hint:
        "Consider pruning MEMORY.md soon — it's curated memory, not a log.",
    });
  }
  return out;
}

function routeFindings(report: RouteCheckReport): DoctorFinding[] {
  if (!report.configReadable) {
    return [
      {
        id: "config.unreadable",
        category: "config",
        severity: "critical",
        title: "Could not read openclaw.json",
        detail: report.configError ?? "Unknown error.",
        hint: `Check that ${report.configPath} exists and is valid JSON.`,
      },
    ];
  }
  const out: DoctorFinding[] = [];
  for (const c of report.checks) {
    if (c.status === "ok") continue;
    const sev: DoctorSeverity =
      c.status === "missing" || c.status === "error" ? "critical" : "warn";
    out.push({
      id: `routing.${c.id}`,
      category: "routing",
      severity: sev,
      title: c.label,
      detail: c.message,
      hint: c.hint,
    });
  }
  return out;
}

function toolsProfileFinding(cfg: OpenClawConfigSnapshot): DoctorFinding | undefined {
  if (!cfg.exists || cfg.parseError) return undefined;
  const profile = getPath(cfg.data, ["tools", "profile"]);
  if (typeof profile === "string" && profile.trim().length > 0) return undefined;
  return {
    id: "config.tools.profile",
    category: "config",
    severity: "warn",
    title: "tools.profile not set",
    detail:
      "openclaw.json has no tools.profile — the agent falls back to a generic tool set.",
    hint:
      'Set `"tools": { "profile": "coding" }` (or another profile) in openclaw.json.',
  };
}

function versionFinding(
  workspaceVersion: string | undefined,
  pluginVersion: string
): DoctorFinding | undefined {
  if (!workspaceVersion) {
    return {
      id: "version.missing",
      category: "version",
      severity: "warn",
      title: "Workspace has no VERSION.md",
      detail:
        "Without VERSION.md, persona_doctor can't tell whether the workspace " +
        "was bootstrapped by a known AI Persona OS release.",
      hint:
        `Create VERSION.md with a single line like \`${pluginVersion}\` so future ` +
        "checks can compare. (Auto-creation lands in persona_setup, Phase 4.)",
    };
  }
  const wsMajor = workspaceVersion.split(".")[0];
  const plMajor = pluginVersion.split(".")[0];
  if (wsMajor !== plMajor) {
    return {
      id: "version.mismatch",
      category: "version",
      severity: "warn",
      title: `Workspace VERSION.md (${workspaceVersion}) does not match plugin (${pluginVersion})`,
      detail:
        "Major-version drift between the workspace and the running plugin. " +
        "Some templates may be out of date.",
      hint:
        "Run the migration runner (Phase 6) when available, or manually compare " +
        "against the latest templates in the plugin's templates/ folder.",
    };
  }
  return undefined;
}

function worstSeverity(findings: DoctorFinding[]): DoctorSeverity {
  let worst: DoctorSeverity = "ok";
  for (const f of findings) {
    if (f.severity === "critical") return "critical";
    if (f.severity === "warn") worst = "warn";
  }
  return worst;
}

export type DoctorOptions = WorkspaceStatusOptions & {
  /** Plugin runtime version, e.g. "3.0.0-alpha.2" — used for version mismatch detection. */
  pluginVersion: string;
  /** Override the env hash for reading openclaw.json. */
  env?: Record<string, string | undefined>;
};

/**
 * Walk every check and assemble the consolidated report.
 *
 * Lint-only: no writes, no auto-fixes. Future `--fix` work (Phase 6) will
 * read the findings and apply remediation per category.
 */
export async function runDoctor(
  workspace: string,
  opts: DoctorOptions
): Promise<DoctorReport> {
  const env = opts.env ?? process.env;
  const limitBytes = opts.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES;

  const [snapshot, routeReport, cfgRaw] = await Promise.all([
    inspectWorkspace(workspace, { memoryLimitBytes: limitBytes, now: opts.now }),
    runRouteCheck(env),
    readOpenClawConfig(env),
  ]);

  const findings: DoctorFinding[] = [
    ...workspaceFindings(snapshot),
    ...routeFindings(routeReport),
  ];
  const toolsFinding = toolsProfileFinding(cfgRaw);
  if (toolsFinding) findings.push(toolsFinding);
  const verFinding = versionFinding(snapshot.version, opts.pluginVersion);
  if (verFinding) findings.push(verFinding);

  return {
    workspace,
    configPath: routeReport.configPath,
    pluginVersion: opts.pluginVersion,
    workspaceVersion: snapshot.version,
    overall: worstSeverity(findings),
    findings,
    workspaceSnapshot: snapshot,
    routeReport,
  };
}

export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`${emojiFor(report.overall)} AI Persona OS — doctor (lint-only)`);
  lines.push(`Workspace: ${report.workspace}`);
  lines.push(`Config:    ${report.configPath}`);
  lines.push(
    `Plugin:    ${report.pluginVersion}` +
      (report.workspaceVersion ? ` · workspace VERSION.md: ${report.workspaceVersion}` : "")
  );
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("🟢 No issues detected.");
    return lines.join("\n");
  }
  lines.push(`${report.findings.length} finding(s):`);
  for (const f of report.findings) {
    lines.push("");
    lines.push(`${emojiFor(f.severity)} [${f.category}] ${f.title}`);
    lines.push(`   ${f.detail}`);
    if (f.hint) lines.push(`   hint: ${f.hint}`);
  }
  return lines.join("\n");
}
