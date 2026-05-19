/**
 * Checkpoint writer — append a structured entry to `memory/YYYY-MM-DD.md`.
 *
 * Multiple checkpoints per day accumulate in the same file (append, not
 * overwrite), separated by a divider. Each entry carries an ISO timestamp
 * and the human-supplied summary + optional tag.
 *
 * Pure-ish: takes workspace + inputs explicitly so it's unit-testable
 * against fixture directories. Phase 6 ships this as `persona_checkpoint`'s
 * engine; Phase 6's optional `before_tool_call` auto-checkpoint hook
 * (deferred — not in this release) would call the same code path.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { atomicAppendFile, isoDate } from "./fs-write.js";

export type CheckpointInput = {
  /** Human-supplied summary; required for the entry to be meaningful. */
  summary: string;
  /** Optional short tag for filtering, e.g. "context-pressure" or "eod". */
  tag?: string;
  /** Inject a clock for tests. */
  now?: Date;
};

export type CheckpointResult = {
  /** Workspace-relative path of the daily log file. */
  relPath: string;
  /** Absolute path written. */
  absPath: string;
  /** ISO timestamp of the new entry. */
  timestamp: string;
  /** Whether the daily log already existed (append) vs new file. */
  appended: boolean;
  /** Bytes of the file after the write. */
  bytesAfter: number;
};

function renderEntry(input: CheckpointInput, now: Date): string {
  const ts = now.toISOString();
  const tagBit = input.tag ? ` [#${input.tag}]` : "";
  const lines: string[] = [];
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`## ${ts}${tagBit}`);
  lines.push("");
  lines.push(input.summary.trim());
  lines.push("");
  return lines.join("\n");
}

/** New-file header so freshly-created daily logs are self-describing. */
function renderDailyLogHeader(today: string): string {
  return [
    `# Daily log — ${today}`,
    "",
    "_Checkpoints recorded during today's session. The most recent is at the bottom._",
    "",
  ].join("\n");
}

/**
 * Write a checkpoint. Creates `memory/` if missing, creates the daily log
 * file if missing (with a header), appends the entry. Atomic write.
 */
export async function writeCheckpoint(
  workspace: string,
  input: CheckpointInput
): Promise<CheckpointResult> {
  if (!input.summary || !input.summary.trim()) {
    throw new Error("persona_checkpoint: summary is required and must be non-empty");
  }
  const now = input.now ?? new Date();
  const today = isoDate(now);
  const relPath = join("memory", `${today}.md`);
  const absPath = join(workspace, relPath);

  // Ensure memory/ exists (atomicAppendFile creates parent dirs but the
  // header logic below needs to know whether the file already existed).
  await fs.mkdir(join(workspace, "memory"), { recursive: true });

  let existed = false;
  try {
    await fs.stat(absPath);
    existed = true;
  } catch {
    // not present
  }

  const entry = renderEntry(input, now);
  const toAppend = existed ? entry : renderDailyLogHeader(today) + entry;

  const { bytes } = await atomicAppendFile(absPath, toAppend);

  return {
    relPath,
    absPath,
    timestamp: now.toISOString(),
    appended: existed,
    bytesAfter: bytes,
  };
}
