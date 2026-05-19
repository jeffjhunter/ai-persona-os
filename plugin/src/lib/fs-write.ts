/**
 * Shared filesystem write helpers — atomic write + safe backup.
 *
 * Lifted out of `lib/setup.ts` so every write tool (persona_checkpoint,
 * persona_switch_soul, persona_blend_souls, persona_dream) goes through
 * one well-tested code path. A crash mid-write can't leave a partial file
 * in place; a switch_soul that fails can't lose the previous SOUL.md.
 */

import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Atomic write — write to `<path>.persona-write-tmp`, then rename.
 * Parent directories are created if needed. Returns bytes written.
 */
export async function atomicWriteFile(
  absPath: string,
  content: string
): Promise<number> {
  await fs.mkdir(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.persona-write-tmp`;
  await fs.writeFile(tmp, content, { encoding: "utf8" });
  await fs.rename(tmp, absPath);
  return Buffer.byteLength(content, "utf8");
}

/**
 * Atomic append — read existing content (if any), append the new content,
 * write atomically. Used by persona_checkpoint for daily-log append.
 */
export async function atomicAppendFile(
  absPath: string,
  appended: string
): Promise<{ bytes: number; existed: boolean }> {
  let prior = "";
  let existed = false;
  try {
    prior = await fs.readFile(absPath, "utf8");
    existed = true;
  } catch {
    // file doesn't exist — that's fine
  }
  const next = existed
    ? prior + (prior.endsWith("\n") ? "" : "\n") + appended
    : appended;
  const bytes = await atomicWriteFile(absPath, next);
  return { bytes, existed };
}

/**
 * Copy `srcAbs` to a backup path under `<workspace>/memory/archive/`.
 * The backup filename is `<prefix>-<isoTimestamp>.md`. Returns the
 * backup path. If the source file doesn't exist, returns undefined.
 *
 * Used by switch_soul / blend_souls before overwriting SOUL.md.
 */
export async function backupFile(
  workspace: string,
  srcAbs: string,
  prefix: string,
  now: Date = new Date()
): Promise<string | undefined> {
  let content: string;
  try {
    content = await fs.readFile(srcAbs, "utf8");
  } catch {
    return undefined;
  }
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const archiveDir = join(workspace, "memory", "archive");
  await fs.mkdir(archiveDir, { recursive: true });
  const dst = join(archiveDir, `${prefix}-${stamp}.md`);
  await atomicWriteFile(dst, content);
  return dst;
}

/** Convenience: `today()` in YYYY-MM-DD form for daily-log filenames. */
export function isoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
