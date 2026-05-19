/**
 * Workspace bootstrap — the engine behind `persona_setup`.
 *
 * Takes a preset choice, plans the files it would create, and (unless dryRun)
 * writes them atomically. Refuses to overwrite existing files unless
 * `force: true` so re-running on an established workspace is non-destructive
 * by default.
 *
 * All file writes go through a write-temp + rename pattern so a crash
 * mid-write can't leave a partial file in place.
 *
 * Pure-ish: takes a templates root + workspace path explicitly so unit tests
 * can run against fixture directories without spinning up the plugin runtime.
 */

import { promises as fs } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type SetupPreset =
  | "coding-assistant"
  | "executive-assistant"
  | "marketing-assistant"
  | "custom";

/** Stable description of every preset for UI / agent prompts. */
export type PresetSpec = {
  id: SetupPreset;
  displayName: string;
  /** AI persona name baked into the starter-pack SOUL.md */
  defaultSoul: string;
  /** Human placeholder name in the starter-pack files */
  defaultUser: string;
  /** One-line product description */
  description: string;
  /** Which starter-pack subdirectory under templates/starter-packs to overlay */
  starterPack?: "coding-assistant" | "executive-assistant" | "marketing-assistant";
};

export const PRESETS: Readonly<Record<SetupPreset, PresetSpec>> = {
  "coding-assistant": {
    id: "coding-assistant",
    displayName: "Coding Assistant (Axiom)",
    defaultSoul: "Axiom",
    defaultUser: "Alex",
    description: "Pair-programming partner — debug, design, ship.",
    starterPack: "coding-assistant",
  },
  "executive-assistant": {
    id: "executive-assistant",
    displayName: "Executive Assistant (Atlas)",
    defaultSoul: "Atlas",
    defaultUser: "Jordan",
    description: "Manages time, anticipates needs, surfaces what matters.",
    starterPack: "executive-assistant",
  },
  "marketing-assistant": {
    id: "marketing-assistant",
    displayName: "Marketing Assistant (Spark)",
    defaultSoul: "Spark",
    defaultUser: "Morgan",
    description: "Content, brand voice, engagement — earns attention.",
    starterPack: "marketing-assistant",
  },
  custom: {
    id: "custom",
    displayName: "Custom (templates only — no preset SOUL)",
    defaultSoul: "[YOUR PERSONA NAME]",
    defaultUser: "[YOUR NAME]",
    description:
      "Bootstrap the base templates without a starter SOUL.md. Fill in SOUL.md yourself.",
  },
};

/** Base templates that every preset writes. Names match plugin/templates/<key>.md. */
const BASE_TEMPLATES: Array<{ template: string; target: string }> = [
  { template: "SOUL-template.md", target: "SOUL.md" },
  { template: "USER-template.md", target: "USER.md" },
  { template: "MEMORY-template.md", target: "MEMORY.md" },
  { template: "AGENTS-template.md", target: "AGENTS.md" },
  { template: "HEARTBEAT-template.md", target: "HEARTBEAT.md" },
  { template: "TOOLS-template.md", target: "TOOLS.md" },
  { template: "INDEX-template.md", target: "INDEX.md" },
  { template: "DREAMS-template.md", target: "DREAMS.md" },
  { template: "WORKFLOWS-template.md", target: "WORKFLOWS.md" },
  { template: "ESCALATION-template.md", target: "ESCALATION.md" },
  { template: "SECURITY-template.md", target: "SECURITY.md" },
  { template: "KNOWLEDGE-template.md", target: "KNOWLEDGE.md" },
];

/** Starter-pack overrides — these REPLACE the base template for files they own. */
const STARTER_PACK_FILES: ReadonlyArray<string> = [
  "SOUL.md",
  "HEARTBEAT.md",
  "KNOWLEDGE.md",
];

export type SetupParams = {
  preset: SetupPreset;
  name?: string;
  role?: string;
  goal?: string;
  /** Soul filename under prebuilt-souls/ or iconic-characters/ (e.g. "03-jarvis.md"). */
  soul?: string;
  /** Overwrite existing files. Default false — established workspaces stay safe. */
  force?: boolean;
  /** Compute the plan but don't write. Default false. */
  dryRun?: boolean;
};

export type FilePlanEntry = {
  target: string;
  /** Workspace-relative path, e.g. "SOUL.md" */
  relPath: string;
  /** Source: which template ("base", "starter-pack:<name>", "soul:<file>", "synthesized:VERSION.md", etc.). */
  source: string;
  /** True when the target file already exists on disk at plan time. */
  exists: boolean;
};

export type WrittenFile = {
  relPath: string;
  bytes: number;
  source: string;
};

export type SkippedFile = {
  relPath: string;
  reason: "already-exists";
  source: string;
};

export type SetupResult = {
  preset: SetupPreset;
  workspace: string;
  templatesRoot: string;
  /** Resolved inputs after defaults — useful for the UI card. */
  inputs: { name?: string; role?: string; goal?: string; soul?: string };
  /** All file actions the plan would take. */
  plan: FilePlanEntry[];
  written: WrittenFile[];
  skipped: SkippedFile[];
  /** True if some files were skipped because they already existed (suggest --force). */
  hadConflicts: boolean;
  dryRun: boolean;
};

/**
 * Resolve the path to the bundled templates directory.
 *
 * At runtime, the plugin lives at `<root>/dist/index.js` and templates are at
 * `<root>/templates/`. import.meta.url points at the compiled file under
 * dist/lib/setup.js, so walk up two levels.
 *
 * Callers can pass `explicitRoot` (e.g. `api.rootDir`) to skip the resolution.
 */
export function resolveTemplatesRoot(explicitRoot?: string): string {
  if (explicitRoot && explicitRoot.trim()) {
    return join(explicitRoot, "templates");
  }
  // dist/lib/setup.js -> dist -> root -> templates
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "templates");
}

export function listPresets(): PresetSpec[] {
  return Object.values(PRESETS);
}

async function safeExists(path: string): Promise<boolean> {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readTemplate(templatesRoot: string, relPath: string): Promise<string> {
  return fs.readFile(join(templatesRoot, relPath), "utf8");
}

/** Locate a soul template by trying prebuilt-souls/ then iconic-characters/. */
async function findSoulTemplate(
  templatesRoot: string,
  filename: string
): Promise<{ relPath: string; content: string } | undefined> {
  const candidates = [
    join("prebuilt-souls", filename),
    join("iconic-characters", filename),
  ];
  for (const c of candidates) {
    try {
      const content = await fs.readFile(join(templatesRoot, c), "utf8");
      return { relPath: c, content };
    } catch {
      // keep searching
    }
  }
  return undefined;
}

/** Decorate USER.md content with a "Setup Inputs" header capturing user-supplied fields. */
function decorateUserMd(
  baseContent: string,
  inputs: { name?: string; role?: string; goal?: string }
): string {
  if (!inputs.name && !inputs.role && !inputs.goal) return baseContent;
  const lines: string[] = ["<!-- persona_setup inputs (auto-generated) -->"];
  lines.push("## Setup Inputs");
  lines.push("");
  lines.push("These values were supplied at `persona_setup` time. Edit USER.md ");
  lines.push("freely — these notes are just a starting point.");
  lines.push("");
  if (inputs.name) lines.push(`- **Name:** ${inputs.name}`);
  if (inputs.role) lines.push(`- **Role:** ${inputs.role}`);
  if (inputs.goal) lines.push(`- **Current goal:** ${inputs.goal}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n") + baseContent;
}

/** Render the VERSION.md content. Single line, no trailing newline weirdness. */
function renderVersionFile(pluginVersion: string): string {
  return `${pluginVersion}\n`;
}

/** Build the planned list of writes without touching disk for existence. */
type PlannedWrite = {
  relPath: string;
  source: string;
  content: string;
};

async function buildPlan(
  templatesRoot: string,
  params: SetupParams,
  pluginVersion: string
): Promise<PlannedWrite[]> {
  const planned: PlannedWrite[] = [];
  const spec = PRESETS[params.preset];
  const starter = spec.starterPack;

  // 1. Base templates (skip the ones the starter pack will override)
  const overrideSet = new Set(starter ? STARTER_PACK_FILES : []);
  for (const { template, target } of BASE_TEMPLATES) {
    if (overrideSet.has(target)) continue;
    const content = await readTemplate(templatesRoot, template);
    const finalContent =
      target === "USER.md"
        ? decorateUserMd(content, {
            name: params.name,
            role: params.role,
            goal: params.goal,
          })
        : content;
    planned.push({
      relPath: target,
      source: `base:${template}`,
      content: finalContent,
    });
  }

  // 2. Starter-pack overrides
  if (starter) {
    for (const fname of STARTER_PACK_FILES) {
      try {
        const content = await readTemplate(
          templatesRoot,
          join("starter-packs", starter, fname)
        );
        planned.push({
          relPath: fname,
          source: `starter-pack:${starter}/${fname}`,
          content,
        });
      } catch {
        // Not every starter pack has every file (e.g. executive-assistant has no KNOWLEDGE.md).
        // Fall back to the matching base template if there is one.
        const base = BASE_TEMPLATES.find((b) => b.target === fname);
        if (base) {
          const content = await readTemplate(templatesRoot, base.template);
          planned.push({
            relPath: fname,
            source: `base:${base.template} (fallback for starter-pack:${starter})`,
            content,
          });
        }
      }
    }
  }

  // 3. Soul override (highest priority — replaces SOUL.md if given)
  if (params.soul) {
    const found = await findSoulTemplate(templatesRoot, params.soul);
    if (!found) {
      throw new Error(
        `Soul "${params.soul}" not found under templates/prebuilt-souls/ or templates/iconic-characters/.`
      );
    }
    const idx = planned.findIndex((p) => p.relPath === "SOUL.md");
    const entry: PlannedWrite = {
      relPath: "SOUL.md",
      source: `soul:${found.relPath}`,
      content: found.content,
    };
    if (idx >= 0) planned[idx] = entry;
    else planned.push(entry);
  }

  // 4. VERSION.md — always written, always rewritten
  planned.push({
    relPath: "VERSION.md",
    source: "synthesized:VERSION.md",
    content: renderVersionFile(pluginVersion),
  });

  return planned;
}

/** Atomic write — write to .tmp, then rename. Creates parent dirs as needed. */
async function atomicWrite(absPath: string, content: string): Promise<number> {
  await fs.mkdir(dirname(absPath), { recursive: true });
  const tmp = `${absPath}.persona-setup-tmp`;
  await fs.writeFile(tmp, content, { encoding: "utf8" });
  await fs.rename(tmp, absPath);
  return Buffer.byteLength(content, "utf8");
}

/**
 * Plan + (optionally) execute the workspace bootstrap.
 *
 * Always returns a structured result describing what was done. Throws only on
 * truly exceptional conditions (unknown preset, soul file not found,
 * permission denied during write).
 */
export async function runSetup(
  workspace: string,
  templatesRoot: string,
  pluginVersion: string,
  params: SetupParams
): Promise<SetupResult> {
  if (!(params.preset in PRESETS)) {
    throw new Error(
      `Unknown preset "${params.preset}". Known: ${Object.keys(PRESETS).join(", ")}`
    );
  }
  const force = !!params.force;
  const dryRun = !!params.dryRun;

  await fs.mkdir(workspace, { recursive: true });

  const planned = await buildPlan(templatesRoot, params, pluginVersion);

  const plan: FilePlanEntry[] = [];
  const written: WrittenFile[] = [];
  const skipped: SkippedFile[] = [];

  for (const p of planned) {
    const abs = join(workspace, p.relPath);
    const exists = await safeExists(abs);
    plan.push({
      target: abs,
      relPath: p.relPath,
      source: p.source,
      exists,
    });

    // VERSION.md is always rewritten — it's the plugin's responsibility to keep accurate.
    const alwaysWrite = p.relPath === "VERSION.md";

    if (exists && !force && !alwaysWrite) {
      skipped.push({
        relPath: p.relPath,
        reason: "already-exists",
        source: p.source,
      });
      continue;
    }
    if (dryRun) continue;

    const bytes = await atomicWrite(abs, p.content);
    written.push({
      relPath: p.relPath,
      bytes,
      source: p.source,
    });
  }

  // Ensure memory/ exists so persona_status / persona_recall don't get "directory not present".
  if (!dryRun) {
    await fs.mkdir(join(workspace, "memory"), { recursive: true });
  }

  return {
    preset: params.preset,
    workspace,
    templatesRoot,
    inputs: {
      name: params.name,
      role: params.role,
      goal: params.goal,
      soul: params.soul,
    },
    plan,
    written,
    skipped,
    hadConflicts: skipped.length > 0,
    dryRun,
  };
}

/** List soul files available under templates/. */
export async function listAvailableSouls(
  templatesRoot: string
): Promise<{ prebuilt: string[]; iconic: string[] }> {
  async function lsMd(rel: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(join(templatesRoot, rel));
      return entries
        .filter((n) => n.endsWith(".md") && n !== "README.md")
        .sort();
    } catch {
      return [];
    }
  }
  return {
    prebuilt: await lsMd("prebuilt-souls"),
    iconic: await lsMd("iconic-characters"),
  };
}

/** Render a setup result as a human-friendly text block. */
export function renderSetupResult(r: SetupResult): string {
  const lines: string[] = [];
  const emoji = r.hadConflicts ? "🟡" : "🟢";
  const mode = r.dryRun ? " (dry-run)" : "";
  lines.push(`${emoji} persona_setup ${r.preset}${mode}`);
  lines.push(`Workspace: ${r.workspace}`);
  if (r.inputs.name || r.inputs.role || r.inputs.goal || r.inputs.soul) {
    const bits: string[] = [];
    if (r.inputs.name) bits.push(`name=${r.inputs.name}`);
    if (r.inputs.role) bits.push(`role=${r.inputs.role}`);
    if (r.inputs.goal) bits.push(`goal=${r.inputs.goal}`);
    if (r.inputs.soul) bits.push(`soul=${r.inputs.soul}`);
    lines.push(`Inputs:    ${bits.join(", ")}`);
  }
  lines.push("");
  if (r.dryRun) {
    lines.push("Plan (no files written):");
    for (const p of r.plan) {
      lines.push(`  ${p.exists ? "·" : "+"} ${p.relPath}  [${p.source}]${p.exists ? " (exists)" : ""}`);
    }
    return lines.join("\n");
  }
  if (r.written.length > 0) {
    lines.push(`Wrote ${r.written.length} file(s):`);
    for (const w of r.written) {
      lines.push(`  + ${w.relPath}  (${w.bytes} B)  [${w.source}]`);
    }
  }
  if (r.skipped.length > 0) {
    lines.push("");
    lines.push(`Skipped ${r.skipped.length} existing file(s) (pass force:true to overwrite):`);
    for (const s of r.skipped) {
      lines.push(`  · ${s.relPath}  [${s.source}]`);
    }
  }
  if (r.written.length === 0 && r.skipped.length === 0) {
    lines.push("No changes.");
  }
  return lines.join("\n");
}

/** For unit tests / callers that want a relative-only view of the plan. */
export function plannedRelPaths(plan: PlannedWrite[]): string[] {
  return plan.map((p) => p.relPath);
}

/** Re-export for the wizard UI descriptor so we have one type to import. */
export type { PlannedWrite };

/** Convenience: workspace-relative path normalization for tool output. */
export function relativizeIfInside(workspace: string, abs: string): string {
  const rel = relative(workspace, abs);
  return rel.startsWith("..") ? abs : rel;
}
