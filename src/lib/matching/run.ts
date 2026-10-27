import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TreeSnapshot } from "@/lib/genealogy/types";
import type { SourceAdapter, SourceCandidate, SourceQuery } from "@/lib/sources/types";
import { MATCH_ALGORITHM_VERSION, MATCH_CONFIG } from "./config";
import { personFacts } from "./facts";
import { scoreMatch } from "./score";
import type { PersonFacts } from "./types";

/** Wspólny wpis w tabeli Source dla danego źródła (np. jeden „Wikidata” dla wszystkich drzew). */
export async function ensureGlobalSource(adapter: SourceAdapter) {
  const existing = await db.source.findFirst({ where: { kind: adapter.kind, treeId: null }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.source.create({
    data: {
      kind: adapter.kind,
      title: adapter.title,
      url: adapter.homepage,
      citationText: adapter.citationText,
      license: adapter.license,
    },
    select: { id: true },
  });
  return created.id;
}

export type SkipReason = "living" | "noName";

/** Czy osobę wolno i warto szukać w zewnętrznym źródle. */
export function searchability(facts: PersonFacts): SkipReason | null {
  // RODO: danych osób żyjących nie wysyłamy do żadnego zewnętrznego serwisu.
  if (facts.living) return "living";
  if (!facts.givenNames || facts.surnames.length === 0) return "noName";
  return null;
}

export function toSourceQuery(facts: PersonFacts): SourceQuery {
  return {
    givenNames: facts.givenNames!,
    surnames: facts.surnames,
    sex: facts.sex,
    birth: facts.birth,
    death: facts.death,
  };
}

export type PersonSearchResult = {
  skipped?: SkipReason;
  candidates: number;
  newMatches: number;
};

/**
 * Ocenia znalezione rekordy i zapisuje propozycje (Match).
 * Nic nie trafia do drzewa – propozycje czekają na decyzję użytkownika.
 * Odrzuconych i potwierdzonych propozycji nie zmieniamy, więc odrzucone nie wracają.
 */
async function saveCandidates(facts: PersonFacts, candidates: SourceCandidate[], adapter: SourceAdapter) {
  if (candidates.length === 0) return 0;
  const sourceId = await ensureGlobalSource(adapter);
  let newMatches = 0;
  for (const c of candidates) {
    const result = scoreMatch(facts, c.facts);
    if (result.score < MATCH_CONFIG.thresholds.possible) continue;

    const data = {
      url: c.url,
      year: c.year,
      raw: c.raw as Prisma.InputJsonValue,
      normalized: { ...c.facts, title: c.title } as Prisma.InputJsonValue,
    };
    const record = await db.record.upsert({
      where: { sourceId_externalId: { sourceId, externalId: c.externalId } },
      create: { sourceId, externalId: c.externalId, type: c.type, ...data },
      update: { ...data, fetchedAt: new Date() },
      select: { id: true },
    });

    const explanation = { items: result.items, summary: result.summary } as Prisma.InputJsonValue;
    const key = { personId_recordId: { personId: facts.id, recordId: record.id } };
    const existing = await db.match.findUnique({ where: key, select: { status: true } });
    if (!existing) {
      await db.match.create({
        data: {
          personId: facts.id,
          recordId: record.id,
          score: result.score,
          explanation,
          algorithmVersion: MATCH_ALGORITHM_VERSION,
        },
      });
      newMatches++;
    } else if (existing.status === "PENDING") {
      // Nowe dane w drzewie mogły zmienić ocenę – odświeżamy tylko nierozstrzygnięte.
      await db.match.update({
        where: key,
        data: { score: result.score, explanation, algorithmVersion: MATCH_ALGORITHM_VERSION },
      });
    }
  }
  return newMatches;
}

/** Szuka rekordów dla jednej osoby. */
export async function findMatchesForPerson(
  tree: TreeSnapshot,
  personId: string,
  adapter: SourceAdapter,
): Promise<PersonSearchResult> {
  const facts = personFacts(tree, personId);
  const skipped = searchability(facts);
  if (skipped) return { skipped, candidates: 0, newMatches: 0 };
  const candidates = await adapter.search(toSourceQuery(facts));
  return { candidates: candidates.length, newMatches: await saveCandidates(facts, candidates, adapter) };
}

/** Szuka rekordów dla wielu osób naraz (osoby żyjące i bez nazwiska są pomijane). */
export async function findMatchesForPersons(tree: TreeSnapshot, personIds: string[], adapter: SourceAdapter) {
  const facts = personIds.map((id) => personFacts(tree, id)).filter((f) => searchability(f) === null);
  const queries = facts.map(toSourceQuery);
  const results = adapter.searchMany
    ? await adapter.searchMany(queries)
    : await Promise.all(queries.map((q) => adapter.search(q)));
  let newMatches = 0;
  for (const [i, f] of facts.entries()) newMatches += await saveCandidates(f, results[i], adapter);
  return { searched: facts.length, newMatches };
}
