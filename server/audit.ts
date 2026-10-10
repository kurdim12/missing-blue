// Append-only audit log: every AI run, decision, crew outcome and work order the demo produces is one JSON line in
// data/learning/audit.jsonl (gitignored: local demo state only). Other routers call `audit(...)`; it never throws.
//
//   import { audit } from "./audit";
//   audit({ kind: "work_order", action: "workorder.create", source: "live", summary: { en: "...", ar: "..." }, data: { spot_id: "W7" } });
//
// GET /api/audit?limit=50&kind=outcome  ->  { entries (newest first), count, total, file, note }
import { Hono } from "hono";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA, type Bilingual } from "./data";

export const LEARNING_DIR = join(DATA, "learning");
export const AUDIT_FILE = join(LEARNING_DIR, "audit.jsonl");
export const AUDIT_REL = "data/learning/audit.jsonl";

export type AuditKind = "ai_run" | "decision" | "outcome" | "work_order" | "reset" | "note";
export type AuditEntry = {
  /** A1, A2, ... in the order written */
  id: string;
  ts: string;
  kind: AuditKind | (string & {});
  /** dotted name of what happened, e.g. "assistant.answer", "learning.outcome", "workorder.create" */
  action: string;
  /** who did it: "demo user", "claude", "system" */
  actor: string;
  /** live = a live Claude call, recorded = a recorded run, demo = entered by a person in this demo */
  source?: "live" | "recorded" | "demo" | "system" | "unavailable";
  summary?: Bilingual;
  data?: Record<string, unknown>;
};
export type AuditInput = Omit<AuditEntry, "id" | "ts" | "actor"> & { actor?: string };

function readLines(): AuditEntry[] {
  if (!existsSync(AUDIT_FILE)) return [];
  const out: AuditEntry[] = [];
  for (const line of readFileSync(AUDIT_FILE, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as AuditEntry);
    } catch {
      /* a torn line is skipped, never fatal */
    }
  }
  return out;
}

let nextId: number | null = null;

/** Append one entry. Never throws (an audit failure must not break the action it records); returns null on failure. */
export function audit(input: AuditInput): AuditEntry | null {
  try {
    if (!existsSync(LEARNING_DIR)) mkdirSync(LEARNING_DIR, { recursive: true });
    if (nextId === null) nextId = readLines().length + 1;
    const entry: AuditEntry = { id: `A${nextId++}`, ts: new Date().toISOString(), actor: "system", ...input };
    appendFileSync(AUDIT_FILE, JSON.stringify(entry) + "\n", "utf-8");
    return entry;
  } catch (e) {
    console.error("[audit] could not append:", (e as Error)?.message ?? e);
    return null;
  }
}

/** Entries newest first, optionally filtered by kind. */
export function readAudit(opts: { limit?: number; kind?: string } = {}): { entries: AuditEntry[]; total: number } {
  const all = readLines();
  const filtered = opts.kind ? all.filter((e) => e.kind === opts.kind) : all;
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
  return { entries: filtered.reverse().slice(0, limit), total: filtered.length };
}

const router = new Hono();

router.get("/", (c) => {
  const limit = Number(c.req.query("limit") || 200);
  const kind = c.req.query("kind") || undefined;
  const { entries, total } = readAudit({ limit: Number.isFinite(limit) ? limit : 200, kind });
  return c.json({
    entries,
    count: entries.length,
    total,
    file: AUDIT_REL,
    note: {
      en: "Append-only log of this demo (AI runs, decisions, demo crew labels, work orders). Local only, not real field records.",
      ar: "سجل إلحاقي لهذا العرض (تشغيلات الذكاء الاصطناعي، القرارات، تسميات الفرق التجريبية، أوامر العمل). محلي فقط، وليس سجلات ميدانية حقيقية.",
    },
  });
});

export default router;
