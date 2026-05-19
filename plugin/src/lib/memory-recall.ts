/**
 * Memory recall — scoring + scan over the workspace's MEMORY.md and memory/*.md.
 *
 * Pure-ish: takes a workspace path and a query, walks the file system, and
 * returns the top-scoring matches. Daily-log files (memory/YYYY-MM-DD*.md)
 * within the last 7 days get a recency boost.
 *
 * Used by persona_recall. Kept here so we can unit-test scoring without
 * spinning up the plugin runtime.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";

export type RecallResult = {
  /** Workspace-relative path, e.g. "MEMORY.md" or "memory/2026-05-19.md" */
  file: string;
  /** 1-indexed line number of the match */
  line: number;
  /** Match score (higher = better). Recency boost is applied. */
  score: number;
  /** The matching line, trimmed. */
  text: string;
  /** Up to one line before + one line after, for context. */
  context: string[];
};

export type RecallSummary = {
  query: string;
  filesScanned: number;
  matchesFound: number;
  /** Top results, length ≤ limit. */
  results: RecallResult[];
};

export type RecallOptions = {
  /** Max number of results to return. Defaults to 10. Hard cap 50. */
  limit?: number;
  /** Inject a clock — files newer than (now - recencyWindowDays) get boosted. */
  now?: Date;
  /** Days back the recency boost applies. Default 7. */
  recencyWindowDays?: number;
  /** Recency boost multiplier. Default 1.5. */
  recencyBoost?: number;
  /** Skip files larger than this many bytes (avoid binary/oversized files). Default 256 KB. */
  maxFileBytes?: number;
};

const DAILY_LOG_RE = /^(\d{4}-\d{2}-\d{2})/;

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function dateForDailyLog(filename: string): Date | undefined {
  const m = DAILY_LOG_RE.exec(filename);
  if (!m) return undefined;
  const parsed = new Date(`${m[1]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function lineMatchCount(line: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const lower = line.toLowerCase();
  let hits = 0;
  for (const t of tokens) {
    if (lower.includes(t)) hits++;
  }
  return hits;
}

async function safeRead(path: string, maxBytes: number): Promise<string | undefined> {
  try {
    const stat = await fs.stat(path);
    if (stat.size > maxBytes) return undefined;
    return await fs.readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function listMemoryDir(workspace: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(join(workspace, "memory"));
    return entries
      .filter((name) => name.endsWith(".md"))
      .map((name) => `memory/${name}`);
  } catch {
    return [];
  }
}

/**
 * Scan the workspace for query matches.
 *
 * Score model:
 *   per matching line: `tokens hit on the line`
 *   if file is a recent daily log: multiply by recencyBoost (default 1.5)
 *
 * Ties broken by file recency (newer first) then line number (lower first).
 */
export async function recallMemory(
  workspace: string,
  query: string,
  opts: RecallOptions = {}
): Promise<RecallSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
  const now = opts.now ?? new Date();
  const windowMs = (opts.recencyWindowDays ?? 7) * 24 * 60 * 60 * 1000;
  const boost = opts.recencyBoost ?? 1.5;
  const maxBytes = opts.maxFileBytes ?? 256 * 1024;

  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { query, filesScanned: 0, matchesFound: 0, results: [] };
  }

  const candidates: string[] = ["MEMORY.md", ...(await listMemoryDir(workspace))];

  type ScoredMatch = RecallResult & { fileMtime: number };
  const all: ScoredMatch[] = [];
  let filesScanned = 0;

  for (const rel of candidates) {
    const abs = join(workspace, rel);
    const text = await safeRead(abs, maxBytes);
    if (text === undefined) continue;
    filesScanned++;

    let fileMtime = 0;
    try {
      fileMtime = (await fs.stat(abs)).mtimeMs;
    } catch {
      // ignore
    }

    let multiplier = 1;
    const dailyDate = rel.startsWith("memory/")
      ? dateForDailyLog(rel.slice("memory/".length))
      : undefined;
    if (dailyDate && now.getTime() - dailyDate.getTime() <= windowMs) {
      multiplier = boost;
    }

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const hits = lineMatchCount(lines[i], tokens);
      if (hits === 0) continue;
      const score = hits * multiplier;
      const context: string[] = [];
      if (i > 0) context.push(lines[i - 1]);
      if (i + 1 < lines.length) context.push(lines[i + 1]);
      all.push({
        file: rel,
        line: i + 1,
        score,
        text: lines[i].trim(),
        context,
        fileMtime,
      });
    }
  }

  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.fileMtime !== a.fileMtime) return b.fileMtime - a.fileMtime;
    return a.line - b.line;
  });

  const results = all.slice(0, limit).map(({ fileMtime: _fm, ...r }) => r);
  return {
    query,
    filesScanned,
    matchesFound: all.length,
    results,
  };
}
