/**
 * Soul-file operations — read from the gallery, swap SOUL.md, blend two souls.
 *
 * Bundled-template gallery lives under `<templatesRoot>/prebuilt-souls/` and
 * `<templatesRoot>/iconic-characters/`. Lookup tries both. All write paths
 * back up the current SOUL.md to `memory/archive/` before overwriting.
 *
 * Pure functions take templates + workspace explicitly so the logic is
 * unit-testable without spinning up the plugin runtime.
 */

import { promises as fs } from "node:fs";
import { join } from "node:path";
import { atomicWriteFile, backupFile } from "./fs-write.js";

export type SoulSource = {
  /** Filename within the gallery (e.g. "03-jarvis.md"). */
  filename: string;
  /** Workspace-relative gallery path, e.g. "iconic-characters/03-jarvis.md". */
  galleryRelPath: string;
  /** Raw markdown content. */
  content: string;
};

/** Locate a soul template by trying prebuilt-souls/ then iconic-characters/. */
export async function findSoul(
  templatesRoot: string,
  filename: string
): Promise<SoulSource | undefined> {
  const candidates = [
    join("prebuilt-souls", filename),
    join("iconic-characters", filename),
  ];
  for (const rel of candidates) {
    try {
      const content = await fs.readFile(join(templatesRoot, rel), "utf8");
      return { filename, galleryRelPath: rel, content };
    } catch {
      // try next
    }
  }
  return undefined;
}

export type SwitchSoulInput = {
  workspace: string;
  templatesRoot: string;
  soul: string;
  /** Inject a clock so backup filenames are reproducible in tests. */
  now?: Date;
};

export type SwitchSoulResult = {
  workspace: string;
  newSoul: SoulSource;
  /** Workspace-relative path of the backup (if any prior SOUL.md existed). */
  backupRelPath?: string;
  /** Absolute path of the SOUL.md that was written. */
  soulPathAbs: string;
  /** Bytes written to SOUL.md. */
  bytesWritten: number;
  /** True when a prior SOUL.md was present (and thus backed up). */
  hadPriorSoul: boolean;
};

export async function switchSoul(input: SwitchSoulInput): Promise<SwitchSoulResult> {
  const source = await findSoul(input.templatesRoot, input.soul);
  if (!source) {
    throw new Error(
      `Soul "${input.soul}" not found under templates/prebuilt-souls/ or templates/iconic-characters/.`
    );
  }

  const soulPath = join(input.workspace, "SOUL.md");
  const backupAbs = await backupFile(
    input.workspace,
    soulPath,
    "soul-pre-switch",
    input.now
  );
  const bytes = await atomicWriteFile(soulPath, source.content);

  const backupRelPath = backupAbs
    ? backupAbs.slice(input.workspace.length + 1)
    : undefined;

  return {
    workspace: input.workspace,
    newSoul: source,
    backupRelPath,
    soulPathAbs: soulPath,
    bytesWritten: bytes,
    hadPriorSoul: backupAbs !== undefined,
  };
}

// ─── BLEND ──────────────────────────────────────────────────────────────────
//
// Structural soul blending. The v2.0 soul format uses Markdown with these
// canonical sections:
//   # SOUL.md — <subtitle>
//   *intro paragraph italics*
//   ## Core Truths       (5 bolded one-liners)
//   ## Communication Style  (bullet list)
//   …additional sections vary
//
// The blender:
//   1. Reads both souls
//   2. Synthesizes a hybrid title + intro
//   3. Interleaves Core Truths (pulling 3 from A and 2 from B, then 2 from
//      A and 3 from B alternated — keeps the merged list to ~5 items)
//   4. Concatenates Communication Style bullets, deduped by first word
//   5. Leaves trailing sections from soul A as-is (the "base")
//
// The output is a single coherent SOUL.md the user can edit further.

export type BlendInput = {
  workspace: string;
  templatesRoot: string;
  a: string;
  b: string;
  now?: Date;
};

export type BlendResult = {
  workspace: string;
  a: SoulSource;
  b: SoulSource;
  blended: string;
  backupRelPath?: string;
  soulPathAbs: string;
  bytesWritten: number;
  hadPriorSoul: boolean;
};

type Sections = {
  title: string;
  intro: string;
  coreTruths: string[];
  communicationStyle: string[];
  /** Anything after the first three known sections, kept verbatim. */
  trailing: string;
};

function parseSections(markdown: string): Sections {
  const lines = markdown.split(/\r?\n/);

  let title = "";
  let intro = "";
  const coreTruths: string[] = [];
  const communicationStyle: string[] = [];

  // First non-blank line starting with # is the title.
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.startsWith("# ")) {
    title = lines[i].trim();
    i++;
  }

  // Skip blanks, capture intro italics block as a single paragraph.
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.startsWith("*") && !lines[i].startsWith("**")) {
    const introLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("##")) {
      introLines.push(lines[i]);
      i++;
    }
    intro = introLines.join("\n");
  }

  // Walk forward looking for ## Core Truths and ## Communication Style.
  let coreEnd = -1;
  let commStart = -1;
  let commEnd = -1;
  for (let j = i; j < lines.length; j++) {
    const t = lines[j].trim();
    if (/^## Core Truths/i.test(t)) {
      // Collect until next ##
      let k = j + 1;
      while (k < lines.length && !lines[k].trim().startsWith("##")) {
        const ln = lines[k];
        if (/^\*\*[^*]/.test(ln) || /^\d+\.\s/.test(ln) || /^[-*]\s/.test(ln)) {
          coreTruths.push(ln);
        }
        k++;
      }
      coreEnd = k;
    } else if (/^## Communication Style/i.test(t)) {
      let k = j + 1;
      commStart = k;
      while (k < lines.length && !lines[k].trim().startsWith("##")) {
        const ln = lines[k];
        if (/^[-*]\s/.test(ln)) communicationStyle.push(ln);
        k++;
      }
      commEnd = k;
    }
  }

  // Trailing: everything after the LAST of the known sections we found.
  const knownEnd = Math.max(coreEnd, commEnd);
  const trailing =
    knownEnd > 0 && knownEnd < lines.length
      ? lines.slice(knownEnd).join("\n")
      : "";
  // Touch unused capture markers to satisfy noUnusedLocals.
  void commStart;

  return { title, intro, coreTruths, communicationStyle, trailing };
}

/** Interleave two arrays element-by-element (a0,b0,a1,b1,...). */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/** Dedupe bullets keyed by the first word inside the bullet (case-insensitive). */
function dedupeBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of bullets) {
    const m = /[-*]\s+\*?\*?(\w+)/.exec(b);
    const key = (m?.[1] ?? b).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

function deriveDisplayName(source: SoulSource): string {
  // Try the bolded name inside the intro paragraph: e.g. *You are **Axiom** — ...*
  const m = /\*\*([^*]+)\*\*/.exec(source.content.slice(0, 600));
  if (m) return m[1].trim();
  // Fallback: filename without numeric prefix / .md.
  return source.filename
    .replace(/^\d+-/, "")
    .replace(/\.md$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildBlendedMarkdown(a: SoulSource, b: SoulSource, now: Date): string {
  const sa = parseSections(a.content);
  const sb = parseSections(b.content);

  const nameA = deriveDisplayName(a);
  const nameB = deriveDisplayName(b);
  const blendName = `${nameA} × ${nameB}`;

  const lines: string[] = [];
  lines.push(`# SOUL.md — ${blendName} (blended)`);
  lines.push("");
  lines.push(
    `*You are a hybrid persona — **${nameA} × ${nameB}** — blended from two ` +
      `souls in the AI Persona OS gallery. Edit this file freely; the structural ` +
      `merge is a starting point, not a finished voice.*`
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Surface each source's original intro so the user can see what got merged.
  if (sa.intro || sb.intro) {
    lines.push("## Source intros");
    lines.push("");
    if (sa.intro) {
      lines.push(`From **${nameA}** (${a.galleryRelPath}):`);
      lines.push("");
      lines.push(sa.intro);
      lines.push("");
    }
    if (sb.intro) {
      lines.push(`From **${nameB}** (${b.galleryRelPath}):`);
      lines.push("");
      lines.push(sb.intro);
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push("## Core Truths");
  lines.push("");
  const interleaved = interleave(sa.coreTruths, sb.coreTruths).slice(0, 6);
  if (interleaved.length === 0) {
    lines.push("_(Add your own — neither source soul had detectable Core Truths.)_");
  } else {
    for (const truth of interleaved) lines.push(truth);
  }
  lines.push("");

  lines.push("## Communication Style");
  lines.push("");
  const combinedComms = dedupeBullets([
    ...sa.communicationStyle,
    ...sb.communicationStyle,
  ]);
  if (combinedComms.length === 0) {
    lines.push("_(Add your own — neither source soul had a Communication Style block.)_");
  } else {
    for (const b1 of combinedComms) lines.push(b1);
  }
  lines.push("");

  // Pass through the trailing sections from soul A as the "base" so the
  // hybrid retains structure (Quirks, Boundaries, etc. from the first soul).
  if (sa.trailing && sa.trailing.trim()) {
    lines.push(sa.trailing.trim());
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(
    `_Blended from \`${a.galleryRelPath}\` × \`${b.galleryRelPath}\` ` +
      `at ${now.toISOString()} by persona_blend_souls._`
  );

  return lines.join("\n");
}

export async function blendSouls(input: BlendInput): Promise<BlendResult> {
  const [a, b] = await Promise.all([
    findSoul(input.templatesRoot, input.a),
    findSoul(input.templatesRoot, input.b),
  ]);
  if (!a) throw new Error(`Soul A "${input.a}" not found in the gallery.`);
  if (!b) throw new Error(`Soul B "${input.b}" not found in the gallery.`);
  if (a.filename === b.filename) {
    throw new Error("Blend requires two different souls.");
  }

  const now = input.now ?? new Date();
  const blended = buildBlendedMarkdown(a, b, now);

  const soulPath = join(input.workspace, "SOUL.md");
  const backupAbs = await backupFile(
    input.workspace,
    soulPath,
    "soul-pre-blend",
    now
  );
  const bytes = await atomicWriteFile(soulPath, blended);

  return {
    workspace: input.workspace,
    a,
    b,
    blended,
    backupRelPath: backupAbs
      ? backupAbs.slice(input.workspace.length + 1)
      : undefined,
    soulPathAbs: soulPath,
    bytesWritten: bytes,
    hadPriorSoul: backupAbs !== undefined,
  };
}
