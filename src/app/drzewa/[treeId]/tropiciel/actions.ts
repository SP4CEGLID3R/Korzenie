"use server";

import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { suggestTasks } from "@/lib/detective/suggest";
import { personFacts } from "@/lib/matching/facts";
import { saveCandidates } from "@/lib/matching/run";
import { genetekaAdapter, searchGenetekaActs } from "@/lib/sources/geneteka";
import { actToCandidate } from "@/lib/sources/geneteka-parse";
import { SourceError } from "@/lib/sources/types";
import { AccessError, requirePersonInTree, requireTreeEditor } from "@/lib/trees/access";
import { loadConfirmedSources } from "@/lib/trees/detective";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";

const statusSchema = z.enum(["OPEN", "DONE", "DISMISSED"]);

/** „Zrobione” / „Pomiń” / „Przywróć” dla propozycji Tropiciela. */
export async function setTaskStatusAction(treeId: string, personId: string, key: string, status: string) {
  await requireTreeEditor(treeId);
  await requirePersonInTree(treeId, personId);
  const s = statusSchema.parse(status);
  const tree = await loadTreeSnapshot(treeId);
  const task = suggestTasks(tree, personId).find((t) => t.key === key);
  await db.researchTask.upsert({
    where: { personId_key: { personId, key } },
    create: {
      treeId,
      personId,
      key,
      kind: task?.kind ?? "OTHER",
      title: task?.title ?? key,
      details: (task ?? {}) as Prisma.InputJsonValue,
      status: s,
    },
    update: { status: s },
  });
  revalidatePath(`/drzewa/${treeId}`, "layout");
  refresh();
}

export type AutoSearchState = { error?: string; message?: string };

/**
 * Automatyczne wyszukiwanie w Genetece dla jednego zadania (tylko przy
 * GENETEKA_FETCH_ENABLED=true). Wyniki trafiają do „Odkryć” jako propozycje.
 */
export async function autoSearchTaskAction(
  treeId: string,
  personId: string,
  key: string,
  searchIndex: number,
  _prev: AutoSearchState,
): Promise<AutoSearchState> {
  try {
    await requireTreeEditor(treeId);
    await requirePersonInTree(treeId, personId);
    const tree = await loadTreeSnapshot(treeId);
    const confirmed = await loadConfirmedSources(treeId);
    const task = suggestTasks(tree, personId, confirmed).find((t) => t.key === key);
    const search = task?.searches[searchIndex];
    if (!task || !search) return { error: "To zadanie jest już nieaktualne – odśwież stronę." };
    if (task.kind === "FIND_SIBLINGS") {
      return { error: "Rodzeństwa szukaj przez link – nie mamy jeszcze tych osób w drzewie, więc nie ma z kim porównać." };
    }

    const acts = await searchGenetekaActs(search.query);
    const candidates = acts.map(actToCandidate);
    // Kogo dotyczy zadanie: osoby, albo – przy ślubie – obojga małżonków.
    const targets = task.kind === "FIND_MARRIAGE" ? task.key.split(":")[1].split("+") : [personId];
    let newMatches = 0;
    for (const id of targets) {
      const facts = personFacts(tree, id);
      if (facts.living) continue;
      newMatches += await saveCandidates(facts, candidates, genetekaAdapter);
    }
    revalidatePath(`/drzewa/${treeId}`, "layout");
    refresh();
    return {
      message:
        acts.length === 0
          ? "Geneteka nie znalazła aktów dla tego zapytania."
          : `Sprawdzono ${acts.length} aktów. Nowe propozycje w „Odkryciach”: ${newMatches}.`,
    };
  } catch (e) {
    if (e instanceof SourceError || e instanceof AccessError) return { error: e.message };
    throw e;
  }
}
