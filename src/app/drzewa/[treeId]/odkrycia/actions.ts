"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { suggestTasks } from "@/lib/detective/suggest";
import { proposeFacts } from "@/lib/matching/adopt";
import type { RecordFacts } from "@/lib/matching/types";
import { loadConfirmedSources } from "@/lib/trees/detective";
import { addPersonalEvent, createPerson, dateColumns, ensureUnion, linkParent, resolvePlace } from "@/lib/trees/write";
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
  if (status === "CONFIRMED") {
    await createFollowUpTasks(treeId, match.personId, match.id);
    revalidatePath(`/drzewa/${treeId}`, "layout");
    // Od razu pokazujemy potwierdzony rekord z listą faktów do dodania.
    redirect(`/drzewa/${treeId}/odkrycia?status=potwierdzone&dopasowanie=${match.id}`);
  }
  revalidatePath(`/drzewa/${treeId}`, "layout");
  refresh();
}

/**
 * Po potwierdzeniu rekordu Tropiciel zapisuje następne kroki dla tej osoby
 * i jej rodziców (oznaczone jako „nowe po potwierdzeniu”).
 */
async function createFollowUpTasks(treeId: string, personId: string, matchId: string) {
  const tree = await loadTreeSnapshot(treeId);
  const confirmed = await loadConfirmedSources(treeId);
  const parents = tree.parentLinks.filter((l) => l.childId === personId).map((l) => l.parentId);
  for (const id of [personId, ...parents]) {
    for (const t of suggestTasks(tree, id, confirmed)) {
      await db.researchTask.upsert({
        where: { personId_key: { personId: id, key: t.key } },
        create: {
          treeId,
          personId: id,
          key: t.key,
          kind: t.kind,
          title: t.title,
          details: t as unknown as Prisma.InputJsonValue,
          originMatchId: matchId,
        },
        update: {},
      });
    }
  }
}

/** Dodaje do drzewa zaznaczone fakty z potwierdzonego rekordu (każdy z przypisem do rekordu). */
export async function applyFactsAction(treeId: string, matchId: string, _prev: SearchState, fd: FormData): Promise<SearchState> {
  let added = 0;
  try {
    await requireTreeEditor(treeId);
    const match = await db.match.findFirst({
      where: { id: matchId, status: "CONFIRMED", person: { treeId } },
      include: { record: true, person: { select: { sex: true } } },
    });
    if (!match) return { error: "Nie znaleziono potwierdzonego rekordu." };
    const selected = new Set(fd.getAll("fact").map(String));
    if (selected.size === 0) return { error: "Zaznacz, co chcesz dodać." };

    const normalized = match.record.normalized as unknown as RecordFacts & { alt?: RecordFacts | null };
    const recordFacts = match.person.sex === "FEMALE" && normalized.alt ? normalized.alt : normalized;
    const tree = await loadTreeSnapshot(treeId);
    // Propozycje liczymy na serwerze od nowa – nie ufamy temu, co przyszło z formularza.
    const proposals = proposeFacts(tree, match.personId, recordFacts).filter((p) => selected.has(p.key));
    const recordId = match.recordId;
    const personId = match.personId;

    await db.$transaction(async (tx) => {
      const cite = (data: { personId?: string; eventId?: string }) => tx.citation.create({ data: { ...data, recordId } });
      const newParents: string[] = [];
      for (const p of proposals) {
        if (p.kind === "event") {
          if (p.updateEventId) {
            const placeId = p.place ? await resolvePlace(tx, treeId, p.place) : undefined;
            await tx.event.update({
              where: { id: p.updateEventId },
              data: { ...(p.date.dateYear !== null ? dateColumns(p.date) : {}), ...(placeId ? { placeId } : {}) },
            });
            await cite({ eventId: p.updateEventId });
          } else {
            const e = await addPersonalEvent(tx, treeId, personId, { type: p.eventType, date: p.date, place: p.place, description: null });
            await cite({ eventId: e.id });
            if (p.eventType === "DEATH") {
              await tx.person.updateMany({ where: { id: personId, livingStatus: "AUTO" }, data: { livingStatus: "DECEASED" } });
            }
          }
        } else if (p.kind === "parent") {
          const created = await createPerson(tx, treeId, { ...p.person, livingStatus: "AUTO", notes: null });
          await linkParent(tx, created.id, personId);
          await cite({ personId: created.id });
          newParents.push(created.id);
        } else if (p.kind === "marriage") {
          let spouseId = p.spouseId;
          if (!spouseId && p.newSpouse) {
            const created = await createPerson(tx, treeId, { ...p.newSpouse, livingStatus: "AUTO", notes: null });
            await cite({ personId: created.id });
            spouseId = created.id;
          }
          if (!spouseId) continue;
          const union = await ensureUnion(tx, treeId, personId, spouseId);
          const placeId = await resolvePlace(tx, treeId, p.place);
          const e = await tx.event.create({
            data: { treeId, unionId: union.id, type: "MARRIAGE", ...dateColumns(p.date), placeId },
            select: { id: true },
          });
          await cite({ eventId: e.id });
        }
      }
      // Nowi rodzice tworzą parę – także z rodzicem, który już był w drzewie.
      const allParents = await tx.parentChild.findMany({ where: { childId: personId }, select: { parentId: true } });
      if (newParents.length > 0 && allParents.length === 2) {
        await ensureUnion(tx, treeId, allParents[0].parentId, allParents[1].parentId);
      }
    });

    added = proposals.length;
  } catch (e) {
    return { error: sourceErrorMessage(e) };
  }
  revalidatePath(`/drzewa/${treeId}`, "layout");
  // Po dodaniu formularz znika (nie ma już czego dodać), więc potwierdzenie pokazujemy w adresie.
  redirect(`/drzewa/${treeId}/odkrycia?status=potwierdzone&dopasowanie=${matchId}&dodano=${added}`);
}
