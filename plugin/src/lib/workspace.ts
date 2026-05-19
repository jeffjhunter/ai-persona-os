/**
 * Workspace path resolution.
 *
 * Resolution order (highest priority first):
 *   1. Plugin config: `pluginConfig.workspaceOverride`
 *   2. Env var: `$OPENCLAW_WORKSPACE`
 *   3. Per-agent override: `agents.list[].workspace` for the active agent
 *   4. Global default: `agents.defaults.workspace`
 *   5. Fallback: `$HOME/.openclaw/workspace`
 *
 * Expands `~`, `$HOME`, and `${HOME}` to absolute paths.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";

export type WorkspaceResolutionInput = {
  /** Plugin config — `pluginConfig.workspaceOverride` if set */
  pluginOverride?: string;
  /** The active agent ID, for per-agent override lookup */
  agentId?: string;
  /** Full OpenClaw config snapshot (api.config) */
  config?: {
    agents?: {
      defaults?: { workspace?: string };
      list?: Array<{ id?: string; workspace?: string }>;
    };
  };
  /** Env vars (process.env-shaped) */
  env?: Record<string, string | undefined>;
};

export type WorkspaceResolution = {
  /** The resolved absolute path */
  path: string;
  /** Which source the path came from */
  source:
    | "pluginConfig.workspaceOverride"
    | "env.OPENCLAW_WORKSPACE"
    | "agents.list[].workspace"
    | "agents.defaults.workspace"
    | "default";
};

const DEFAULT_PATH_REL = ".openclaw/workspace";

/**
 * Expand `~`, `$HOME`, and `${HOME}` to an absolute path.
 * Returns an absolute path. Leaves already-absolute paths alone.
 */
export function expandHomeReferences(path: string, home: string = homedir()): string {
  let expanded = path;
  if (expanded.startsWith("~")) {
    // Match `~` or `~/` at the start
    expanded = home + expanded.slice(1);
  }
  expanded = expanded.replaceAll("${HOME}", home).replaceAll("$HOME", home);
  return resolve(expanded);
}

/**
 * Pure function — no I/O, no file reads. Takes all inputs explicitly so it's
 * trivially testable. Call sites are responsible for handing in
 * `api.config`, `api.pluginConfig`, `process.env`, and the active agent ID.
 */
export function resolveWorkspace(input: WorkspaceResolutionInput = {}): WorkspaceResolution {
  const { pluginOverride, agentId, config, env } = input;

  // 1. Plugin config override
  if (pluginOverride && pluginOverride.trim()) {
    return {
      path: expandHomeReferences(pluginOverride.trim()),
      source: "pluginConfig.workspaceOverride",
    };
  }

  // 2. Env var
  const envWs = env?.OPENCLAW_WORKSPACE?.trim();
  if (envWs) {
    return {
      path: expandHomeReferences(envWs),
      source: "env.OPENCLAW_WORKSPACE",
    };
  }

  // 3. Per-agent override
  if (agentId && config?.agents?.list) {
    const agentEntry = config.agents.list.find((a) => a.id === agentId);
    const perAgent = agentEntry?.workspace?.trim();
    if (perAgent) {
      return {
        path: expandHomeReferences(perAgent),
        source: "agents.list[].workspace",
      };
    }
  }

  // 4. Global default
  const globalDefault = config?.agents?.defaults?.workspace?.trim();
  if (globalDefault) {
    return {
      path: expandHomeReferences(globalDefault),
      source: "agents.defaults.workspace",
    };
  }

  // 5. Fallback
  return {
    path: resolve(homedir(), DEFAULT_PATH_REL),
    source: "default",
  };
}
