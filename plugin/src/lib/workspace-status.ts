/**
 * Read-only workspace inspection.
 *
 * Walks the resolved workspace path and reports which of the canonical AI
 * Persona OS files exist, their sizes, MEMORY.md size against the configured
 * limit, today's activity count under memory/, and any version string from
 * VERSION.md.
 *
 * Pure function: hands back a structured snapshot. Rendering (text +
 * emoji) lives in the tools that consume it. Used by persona_status AND
 * persona_doctor — keep it free of presentation.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";

/** Files persona_status checks for. Required vs recommended drives severity. */
export type CoreFileKey =
  | "SOUL.md"
  | "MEMORY.md"
  | "USER.md"
  | "IDENTITY.md"
  | "AGENTS.md"
  | "HEARTBEAT.md"
  | "TOOLS.md"
  | "VERSION.md";

export type CoreFileTier = "required" | "recommended" | "optional";

export type CoreFileSpec = {
  key: CoreFileKey;
  tier: CoreFileTier;
  /** When set, missing this file is OK if any sibling key in the group exists. */
  group?: string;
};

/**
 * Canonical AI Persona OS file set. SOUL.md and MEMORY.md are non-negotiable.
 * The user-identity group accepts either USER.md or IDENTITY.md (v2.0 ships
 * IDENTITY.md, v3.0 templates ship USER.md — accept both).
 */
export const CORE_FILES: readonly CoreFileSpec[] = [
  { key: "SOUL.md", tier: "required" },
  { key: "MEMORY.md", tier: "required" },
  { key: "USER.md", tier: "recommended", group: "user-identity" },
  { key: "IDENTITY.md", tier: "recommended", group: "user-identity" },
  { key: "AGENTS.md", tier: "recommended" },
  { key: "HEARTBEAT.md", tier: "optional" },
  { key: "TOOLS.md", tier: "optional" },
  { key: "VERSION.md", tier: "optional" },
];

/** Default MEMORY.md size limit in bytes (4 KB). */
export const DEFAULT_MEMORY_LIMIT_BYTES = 4096;

export type FileStatus = {
  key: CoreFileKey;
  tier: CoreFileTier;
  group?: string;
  exists: boolean;
  /** Size in bytes when exists is true. */
  bytes?: number;
};

export type WorkspaceStatusSnapshot = {
  workspace: string;
  /** Per-file status, in declaration order. */
  files: FileStatus[];
  /** Number of distinct required/recommended files missing without a satisfied group member. */
  missingCount: number;
  /** Specifically lists names of missing required files. */
  missingRequired: string[];
  /** Specifically lists names of missing recommended files (after group resolution). */
  missingRecommended: string[];
  memory: {
    exists: boolean;
    bytes: number;
    limitBytes: number;
    pctUsed: number;
    /** "ok" | "warn" (≥75%) | "critical" (≥95%) | "missing" */
    state: "ok" | "warn" | "critical" | "missing";
  };
  /** Count of files in memory/ whose name matches today's YYYY-MM-DD prefix. */
  activityToday: number;
  /** Total file count in memory/ (any name). undefined if memory/ doesn't exist. */
  memoryDirEntries?: number;
  /** First non-empty line of VERSION.md, trimmed. undefined if not present. */
  version?: string;
  /** Overall traffic-light verdict. */
  overall: "ok" | "warn" | "critical";
};

export type WorkspaceStatusOptions = {
  /** Override the default 4 KB MEMORY.md limit. */
  memoryLimitBytes?: number;
  /** Inject a clock for testability. Defaults to new Date(). */
  now?: Date;
};

async function safeStat(path: string): Promise<{ size: number } | undefined> {
  try {
    const s = await fs.stat(path);
    return { size: s.size };
  } catch {
    return undefined;
  }
}

function todayPrefix(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Inspect a workspace directory and return a structured snapshot. Never
 * throws on missing files — missing things are reflected in the snapshot.
 * Throws only on truly unexpected I/O errors (permission denied, etc.).
 */
export async function inspectWorkspace(
  workspace: string,
  opts: WorkspaceStatusOptions = {}
): Promise<WorkspaceStatusSnapshot> {
  const limitBytes = opts.memoryLimitBytes ?? DEFAULT_MEMORY_LIMIT_BYTES;
  const now = opts.now ?? new Date();

  const files: FileStatus[] = [];
  for (const spec of CORE_FILES) {
    const stat = await safeStat(join(workspace, spec.key));
    files.push({
      key: spec.key,
      tier: spec.tier,
      group: spec.group,
      exists: stat !== undefined,
      bytes: stat?.size,
    });
  }

  const groupSatisfied = new Set<string>();
  for (const f of files) {
    if (f.exists && f.group) groupSatisfied.add(f.group);
  }

  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  for (const f of files) {
    if (f.exists) continue;
    if (f.group && groupSatisfied.has(f.group)) continue;
    if (f.tier === "required") missingRequired.push(f.key);
    else if (f.tier === "recommended") missingRecommended.push(f.key);
  }
  const missingCount = missingRequired.length + missingRecommended.length;

  const memoryFile = files.find((f) => f.key === "MEMORY.md");
  const memBytes = memoryFile?.bytes ?? 0;
  const pctUsed = limitBytes > 0 ? Math.round((memBytes / limitBytes) * 100) : 0;
  let memState: WorkspaceStatusSnapshot["memory"]["state"];
  if (!memoryFile?.exists) memState = "missing";
  else if (pctUsed >= 95) memState = "critical";
  else if (pctUsed >= 75) memState = "warn";
  else memState = "ok";

  let activityToday = 0;
  let memoryDirEntries: number | undefined;
  try {
    const entries = await fs.readdir(join(workspace, "memory"));
    memoryDirEntries = entries.length;
    const prefix = todayPrefix(now);
    activityToday = entries.filter((name) => name.startsWith(prefix)).length;
  } catch {
    memoryDirEntries = undefined;
  }

  let version: string | undefined;
  const versionFile = files.find((f) => f.key === "VERSION.md");
  if (versionFile?.exists) {
    try {
      const text = await fs.readFile(join(workspace, "VERSION.md"), "utf8");
      const firstLine = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      if (firstLine) version = firstLine.replace(/^#\s*/, "").trim();
    } catch {
      // ignore
    }
  }

  let overall: WorkspaceStatusSnapshot["overall"] = "ok";
  if (missingRequired.length > 0 || memState === "critical") overall = "critical";
  else if (missingRecommended.length > 0 || memState === "warn") overall = "warn";

  return {
    workspace,
    files,
    missingCount,
    missingRequired,
    missingRecommended,
    memory: {
      exists: memoryFile?.exists ?? false,
      bytes: memBytes,
      limitBytes,
      pctUsed,
      state: memState,
    },
    activityToday,
    memoryDirEntries,
    version,
    overall,
  };
}

/** Map an overall verdict to a single emoji. */
export function overallEmoji(o: WorkspaceStatusSnapshot["overall"]): string {
  return o === "ok" ? "🟢" : o === "warn" ? "🟡" : "🔴";
}

/** Map per-file existence to an emoji given its tier. */
export function fileEmoji(f: FileStatus, groupSatisfied: Set<string>): string {
  if (f.exists) return "🟢";
  if (f.group && groupSatisfied.has(f.group)) return "⚪";
  if (f.tier === "required") return "🔴";
  if (f.tier === "recommended") return "🟡";
  return "⚪";
}

/** Compute the satisfied-group set from a snapshot — shared by renderers. */
export function satisfiedGroups(snapshot: WorkspaceStatusSnapshot): Set<string> {
  const out = new Set<string>();
  for (const f of snapshot.files) {
    if (f.exists && f.group) out.add(f.group);
  }
  return out;
}
