import "server-only";
import { db } from "@/lib/db";
import type { ConfirmedSources } from "@/lib/detective/suggest";

/** Rodzaje potwierdzonych rekordów dla każdej osoby drzewa (np. jan → {BIRTH}). */
export async function loadConfirmedSources(treeId: string, personIds?: string[]): Promise<ConfirmedSources> {
  const rows = await db.citation.findMany({
    where: { person: { treeId }, recordId: { not: null }, ...(personIds ? { personId: { in: personIds } } : {}) },
    select: { personId: true, record: { select: { type: true } } },
  });
  const map: ConfirmedSources = new Map();
  for (const r of rows) {
    if (!r.personId || !r.record) continue;
    const set = map.get(r.personId) ?? new Set<string>();
    set.add(r.record.type);
    map.set(r.personId, set);
  }
  return map;
}

export type TaskStatus = "OPEN" | "DONE" | "DISMISSED";

/** Decyzje użytkownika o propozycjach Tropiciela: klucz „osoba|klucz” → status. */
export async function loadTaskStatuses(treeId: string): Promise<Map<string, { status: TaskStatus; fromMatch: boolean }>> {
  const rows = await db.researchTask.findMany({
    where: { treeId },
    select: { personId: true, key: true, status: true, originMatchId: true },
  });
  return new Map(rows.map((r) => [`${r.personId}|${r.key}`, { status: r.status, fromMatch: Boolean(r.originMatchId) }]));
}
