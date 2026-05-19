/**
 * Routing audit — reads openclaw.json and reports the state of the three
 * routing-critical settings that AI Persona OS users hit:
 *
 *   1. accounts.default            — which Discord identity is "us" by default
 *   2. channels.discord.defaultAccount  — same value, per-channel form the gateway uses
 *   3. agents.defaults.heartbeat.target — where heartbeat messages go (channel id)
 *
 * Each check returns an "ok" | "warn" | "missing" status and a one-line
 * remediation hint. No writes — Phase 3 is read-only. Fix paths land in
 * Phase 6 (`persona_route_check --fix`).
 */

import {
  readOpenClawConfig,
  getPath,
  type OpenClawConfigSnapshot,
} from "./openclaw-config.js";

export type RouteCheckSeverity = "ok" | "warn" | "missing" | "error";

export type RouteCheckEntry = {
  /** Stable id for programmatic consumers (e.g. persona_doctor). */
  id: string;
  /** Human-readable label */
  label: string;
  /** Dotted path inside openclaw.json this check looks at. */
  key: string;
  status: RouteCheckSeverity;
  /** Current value at the key, if present. */
  value?: unknown;
  /** Short one-line message explaining the state. */
  message: string;
  /** Optional remediation hint — what to add/edit. */
  hint?: string;
};

export type RouteCheckReport = {
  /** Absolute path of the openclaw.json that was read. */
  configPath: string;
  /** Did the file exist + parse? */
  configReadable: boolean;
  /** If reading or parsing failed, the reason. */
  configError?: string;
  /** Overall traffic light: critical = any missing required key. */
  overall: "ok" | "warn" | "critical";
  checks: RouteCheckEntry[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function checkAccountsDefault(cfg: OpenClawConfigSnapshot): RouteCheckEntry {
  const value = getPath(cfg.data, ["accounts", "default"]);
  if (isNonEmptyString(value)) {
    return {
      id: "accounts.default",
      label: "Default account",
      key: "accounts.default",
      status: "ok",
      value,
      message: `Default account set: ${value}`,
    };
  }
  return {
    id: "accounts.default",
    label: "Default account",
    key: "accounts.default",
    status: "missing",
    message: "No accounts.default configured.",
    hint:
      'Add `"accounts": { "default": "<account-id>" }` so the agent knows ' +
      "which identity to use when no per-channel override matches.",
  };
}

function checkDiscordDefaultAccount(cfg: OpenClawConfigSnapshot): RouteCheckEntry {
  const discord = getPath(cfg.data, ["channels", "discord"]);
  if (discord === undefined) {
    return {
      id: "channels.discord.defaultAccount",
      label: "Discord default account",
      key: "channels.discord.defaultAccount",
      status: "warn",
      message: "Discord channel not configured — defaultAccount not applicable.",
      hint:
        "Add a `channels.discord` block first, then set `defaultAccount` so " +
        "incoming Discord traffic is attributed to the right identity.",
    };
  }
  const value = getPath(cfg.data, ["channels", "discord", "defaultAccount"]);
  if (isNonEmptyString(value)) {
    return {
      id: "channels.discord.defaultAccount",
      label: "Discord default account",
      key: "channels.discord.defaultAccount",
      status: "ok",
      value,
      message: `Discord defaultAccount set: ${value}`,
    };
  }
  return {
    id: "channels.discord.defaultAccount",
    label: "Discord default account",
    key: "channels.discord.defaultAccount",
    status: "warn",
    message: "Discord channel is enabled but has no defaultAccount.",
    hint:
      'Add `"channels": { "discord": { "defaultAccount": "<account-id>" } }`. ' +
      "Without this, the agent may reply on the wrong identity when multiple are connected.",
  };
}

function checkHeartbeatTarget(cfg: OpenClawConfigSnapshot): RouteCheckEntry {
  const value = getPath(cfg.data, ["agents", "defaults", "heartbeat", "target"]);
  if (isNonEmptyString(value)) {
    return {
      id: "agents.defaults.heartbeat.target",
      label: "Heartbeat target",
      key: "agents.defaults.heartbeat.target",
      status: "ok",
      value,
      message: `Heartbeat target set: ${value}`,
    };
  }
  return {
    id: "agents.defaults.heartbeat.target",
    label: "Heartbeat target",
    key: "agents.defaults.heartbeat.target",
    status: "warn",
    message: "No heartbeat target configured — heartbeats have nowhere to land.",
    hint:
      'Add `"agents": { "defaults": { "heartbeat": { "target": "<channel-id>" } } }` ' +
      "so the heartbeat protocol has a destination.",
  };
}

export async function runRouteCheck(
  env: Record<string, string | undefined> = process.env
): Promise<RouteCheckReport> {
  const cfg = await readOpenClawConfig(env);

  if (!cfg.exists) {
    return {
      configPath: cfg.path,
      configReadable: false,
      configError: "openclaw.json not found",
      overall: "critical",
      checks: [],
    };
  }
  if (cfg.parseError) {
    return {
      configPath: cfg.path,
      configReadable: false,
      configError: cfg.parseError,
      overall: "critical",
      checks: [],
    };
  }

  const checks: RouteCheckEntry[] = [
    checkAccountsDefault(cfg),
    checkDiscordDefaultAccount(cfg),
    checkHeartbeatTarget(cfg),
  ];

  let overall: RouteCheckReport["overall"] = "ok";
  for (const c of checks) {
    if (c.status === "missing" || c.status === "error") {
      overall = "critical";
      break;
    }
    if (c.status === "warn" && overall === "ok") overall = "warn";
  }

  return {
    configPath: cfg.path,
    configReadable: true,
    overall,
    checks,
  };
}

export function severityEmoji(s: RouteCheckSeverity): string {
  if (s === "ok") return "🟢";
  if (s === "warn") return "🟡";
  return "🔴";
}

export function overallRouteEmoji(o: RouteCheckReport["overall"]): string {
  return o === "ok" ? "🟢" : o === "warn" ? "🟡" : "🔴";
}
