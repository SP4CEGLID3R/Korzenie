import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dateSortKey, type GenDate } from "@/lib/genealogy/dates";
import type { EventType, ParentChildType } from "@/lib/genealogy/types";
import type { EventInput, PersonInput, PlaceInput } from "./forms";

type Tx = Prisma.TransactionClient;

/** Pola daty do zapisu w tabeli Event. */
export function dateColumns(d: GenDate) {
  return {
    dateQualifier: d.dateQualifier,
    dateYear: d.dateYear,
    dateMonth: d.dateMonth,
    dateDay: d.dateDay,
    dateEndYear: d.dateEndYear,
    dateEndMonth: d.dateEndMonth,
    dateEndDay: d.dateEndDay,
    dateText: d.dateText,
    dateSort: dateSortKey(d),
  };
}

/** Znajduje to samo miejsce w drzewie (bez względu na wielkość liter) albo tworzy nowe. */
export async function resolvePlace(tx: Tx, treeId: string, place: PlaceInput | null) {
  if (!place) return null;
  const existing = await tx.place.findFirst({
    where: {
      treeId,
      name: { equals: place.name, mode: "insensitive" },
      jurisdiction: place.jurisdiction ? { equals: place.jurisdiction, mode: "insensitive" } : null,
      parish: place.parish ? { equals: place.parish, mode: "insensitive" } : null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.place.create({
    data: { treeId, name: place.name, jurisdiction: place.jurisdiction, parish: place.parish },
    select: { id: true },
  });
  return created.id;
}

/** Główne imię: przy nazwisku rodowym innym niż obecne – typ „po ślubie”. */
export function primaryNameData(p: PersonInput) {
  const married = Boolean(p.birthSurname && p.birthSurname !== p.surname);
  return {
    type: married ? ("MARRIED" as const) : ("BIRTH" as const),
    isPrimary: true,
    givenNames: p.givenNames,
    surname: p.surname,
    birthSurname: married ? p.birthSurname : null,
  };
}

export async function createPerson(tx: Tx, treeId: string, p: PersonInput) {
  return tx.person.create({
    data: {
      treeId,
      sex: p.sex,
      livingStatus: p.livingStatus,
      notes: p.notes,
      names: { create: primaryNameData(p) },
    },
    select: { id: true },
  });
}

export async function addPersonalEvent(tx: Tx, treeId: string, personId: string, e: EventInput) {
  const placeId = await resolvePlace(tx, treeId, e.place);
  return tx.event.create({
    data: {
      treeId,
      type: e.type,
      ...dateColumns(e.date),
      placeId,
      description: e.description,
      participants: { create: { personId, role: "PRINCIPAL" } },
    },
    select: { id: true },
  });
}

/** Para w stałej kolejności – (A,B) i (B,A) to ten sam związek. */
export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function ensureUnion(tx: Tx, treeId: string, a: string, b: string) {
  const [partner1Id, partner2Id] = orderedPair(a, b);
  return tx.union.upsert({
    where: { partner1Id_partner2Id: { partner1Id, partner2Id } },
    create: { treeId, partner1Id, partner2Id },
    update: {},
    select: { id: true },
  });
}

export async function linkParent(tx: Tx, parentId: string, childId: string, type: ParentChildType = "BIOLOGICAL") {
  if (parentId === childId) throw new Error("Osoba nie może być swoim rodzicem.");
  return tx.parentChild.upsert({
    where: { parentId_childId: { parentId, childId } },
    create: { parentId, childId, type },
    update: { type },
  });
}

/** Czy `ancestorId` jest przodkiem `personId` (żeby nie tworzyć pętli). */
export async function isAncestor(tx: Tx, ancestorId: string, personId: string) {
  const seen = new Set<string>();
  let frontier = [personId];
  while (frontier.length) {
    const links = await tx.parentChild.findMany({
      where: { childId: { in: frontier } },
      select: { parentId: true },
    });
    frontier = [];
    for (const { parentId } of links) {
      if (parentId === ancestorId) return true;
      if (!seen.has(parentId)) {
        seen.add(parentId);
        frontier.push(parentId);
      }
    }
  }
  return false;
}

/** Usuwa osobę razem z jej wydarzeniami osobistymi (relacje znikają kaskadowo). */
export async function deletePerson(tx: Tx, treeId: string, personId: string) {
  await tx.event.deleteMany({
    where: { treeId, unionId: null, participants: { some: { personId, role: "PRINCIPAL" } } },
  });
  await tx.tree.updateMany({ where: { id: treeId, homePersonId: personId }, data: { homePersonId: null } });
  await tx.person.delete({ where: { id: personId } });
}

export const COUPLE_EVENTS: EventType[] = ["MARRIAGE", "DIVORCE"];
