/**
 * Reading the user's openclaw.json from disk.
 *
 * `api.config` holds whatever the gateway loaded at boot. Tools that need a
 * fresh picture (route-check, doctor) must re-read the file so users see
 * post-edit state without restarting the gateway.
 *
 * Resolution order for the config path:
 *   1. $OPENCLAW_CONFIG (explicit override)
 *   2. $OPENCLAW_HOME/openclaw.json (when OPENCLAW_HOME is set)
 *   3. $HOME/.openclaw/openclaw.json (default)
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type OpenClawConfigSnapshot = {
  /** Resolved absolute path that was read */
  path: string;
  /** True when the file exists and parsed as JSON */
  exists: boolean;
  /** Parsed JSON content. `undefined` when missing or unreadable. */
  data?: Record<string, unknown>;
  /** Set when the file existed but failed to parse */
  parseError?: string;
};

export function resolveOpenClawConfigPath(
  env: Record<string, string | undefined> = process.env
): string {
  const explicit = env.OPENCLAW_CONFIG?.trim();
  if (explicit) return resolve(explicit);
  const home = env.OPENCLAW_HOME?.trim();
  if (home) return resolve(join(home, "openclaw.json"));
  return resolve(join(homedir(), ".openclaw", "openclaw.json"));
}

export async function readOpenClawConfig(
  env: Record<string, string | undefined> = process.env
): Promise<OpenClawConfigSnapshot> {
  const path = resolveOpenClawConfigPath(env);
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch {
    return { path, exists: false };
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return { path, exists: true, data };
  } catch (e) {
    return {
      path,
      exists: true,
      parseError: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Safe nested-key lookup. Returns `undefined` if any path segment is missing. */
export function getPath(obj: unknown, segments: ReadonlyArray<string>): unknown {
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}
