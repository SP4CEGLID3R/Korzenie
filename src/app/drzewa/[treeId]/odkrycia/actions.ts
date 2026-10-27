"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { personFacts } from "@/lib/matching/facts";
import { findMatchesForPerson, findMatchesForPersons, searchability } from "@/lib/matching/run";
import { wikidataAdapter } from "@/lib/sources/wikidata";
import { SourceError } from "@/lib/sources/types";
import { AccessError, requirePersonInTree, requireTreeEditor } from "@/lib/trees/access";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";

export type SearchState = {
  error?: string;
  message?: string;
};

function sourceErrorMessage(e: unknown) {
  if (e instanceof SourceError || e instanceof AccessError) return e.message;
  throw e;
}

/** Szukanie w Wikidata dla jednej osoby (przycisk na karcie osoby). */
export async function searchPersonAction(treeId: string, personId: string, _prev: SearchState): Promise<SearchState> {
  try {
    await requireTreeEditor(treeId);
    await requirePersonInTree(treeId, personId);
    const tree = await loadTreeSnapshot(treeId);
    const r = await findMatchesForPerson(tree, personId, wikidataAdapter);
    refresh();
    if (r.skipped === "living") {
      return { error: "To osoba żyjąca – jej danych nie wysyłamy do zewnętrznych serwisów." };
    }
    if (r.skipped === "noName") return { error: "Uzupełnij imię i nazwisko, żeby wyszukać tę osobę." };
    if (r.newMatches > 0) return { message: `Nowe propozycje: ${r.newMatches}. Zobacz je w zakładce „Odkrycia”.` };
    return { message: r.candidates > 0 ? "Znalezione osoby nie pasują wystarczająco dobrze." : "Wikidata nie zna osoby o tym imieniu i nazwisku." };
  } catch (e) {
    return { error: sourceErrorMessage(e) };
  }
}

export type BatchState = {
  error?: string;
  /** Ile osób już sprawdzono / ile w sumie kwalifikuje się do wyszukania. */
  done: number;
  total: number;
  newMatches: number;
  finished: boolean;
  /** Ostatnio sprawdzona osoba (kolejność po id) – od niej startuje następna porcja. */
  cursor: string | null;
};

const BATCH_SIZE = 8;

/**
 * Szukanie dla całego drzewa w małych porcjach (kilka osób na wywołanie),
 * żeby nie przekroczyć limitu czasu serwera i nie obciążać Wikidata.
 * Przeglądarka wywołuje tę akcję w pętli, pokazując postęp.
 */
export async function searchTreeBatchAction(treeId: string, prev: BatchState): Promise<BatchState> {
  try {
    await requireTreeEditor(treeId);
    const tree = await loadTreeSnapshot(treeId);
    const eligible = tree.persons
      .filter((p) => searchability(personFacts(tree, p.id)) === null)
      .map((p) => p.id)
      .sort();
    const remaining = prev.cursor ? eligible.filter((id) => id > prev.cursor!) : eligible;
    const batch = remaining.slice(0, BATCH_SIZE);

    const r = await findMatchesForPersons(tree, batch, wikidataAdapter);
    const newMatches = prev.newMatches + r.newMatches;
    const finished = remaining.length <= BATCH_SIZE;
    if (finished) revalidatePath(`/drzewa/${treeId}`, "layout");
    return {
      done: eligible.length - remaining.length + batch.length,
      total: eligible.length,
      newMatches,
      finished,
      cursor: batch[batch.length - 1] ?? prev.cursor,
    };
  } catch (e) {
    return { ...prev, error: sourceErrorMessage(e), finished: true };
  }
}

const decisionSchema = z.enum(["CONFIRMED", "REJECTED", "PENDING"]);

/** Potwierdzenie / odrzucenie propozycji. Potwierdzenie dodaje rekord jako źródło osoby. */
export async function decideMatchAction(treeId: string, matchId: string, decision: string) {
  const { user } = await requireTreeEditor(treeId);
  const status = decisionSchema.parse(decision);
  const match = await db.match.findFirst({
    where: { id: matchId, person: { treeId } },
    select: { id: true, personId: true, recordId: true },
  });
  if (!match) throw new AccessError("Nie znaleziono propozycji.");

  await db.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: match.id },
      data: {
        status,
        decidedById: status === "PENDING" ? null : user.id,
        decidedAt: status === "PENDING" ? null : new Date(),
      },
    });
    if (status === "CONFIRMED") {
      const exists = await tx.citation.findFirst({ where: { personId: match.personId, recordId: match.recordId } });
      if (!exists) await tx.citation.create({ data: { personId: match.personId, recordId: match.recordId } });
    } else {
      // Cofnięcie potwierdzenia usuwa też powiązanie ze źródłem.
      await tx.citation.deleteMany({ where: { personId: match.personId, recordId: match.recordId } });
    }
  });
  revalidatePath(`/drzewa/${treeId}`, "layout");
  refresh();
}
