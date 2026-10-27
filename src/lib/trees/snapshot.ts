import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type {
  EventType,
  SnapshotEvent,
  SnapshotPerson,
  SnapshotPlace,
  TreeSnapshot,
} from "@/lib/genealogy/types";

const eventInclude = { place: true } satisfies Prisma.EventInclude;
type DbEvent = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

const personInclude = {
  names: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
  eventRoles: {
    where: { role: "PRINCIPAL" },
    include: { event: { include: eventInclude } },
  },
} satisfies Prisma.PersonInclude;
type DbPerson = Prisma.PersonGetPayload<{ include: typeof personInclude }>;

export function toSnapshotPlace(p: DbEvent["place"]): SnapshotPlace | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    jurisdiction: p.jurisdiction,
    parish: p.parish,
    county: p.county,
    province: p.province,
    country: p.country,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

export function toSnapshotEvent(e: DbEvent): SnapshotEvent {
  return {
    id: e.id,
    type: e.type as EventType,
    dateQualifier: e.dateQualifier,
    dateYear: e.dateYear,
    dateMonth: e.dateMonth,
    dateDay: e.dateDay,
    dateEndYear: e.dateEndYear,
    dateEndMonth: e.dateEndMonth,
    dateEndDay: e.dateEndDay,
    dateText: e.dateText,
    description: e.description,
    place: toSnapshotPlace(e.place),
  };
}

function bySortKey(a: DbEvent, b: DbEvent) {
  return (a.dateSort ?? Number.MAX_SAFE_INTEGER) - (b.dateSort ?? Number.MAX_SAFE_INTEGER);
}

function toSnapshotPerson(p: DbPerson): SnapshotPerson {
  return {
    id: p.id,
    sex: p.sex,
    livingStatus: p.livingStatus,
    notes: p.notes,
    names: p.names.map((n) => ({
      type: n.type,
      isPrimary: n.isPrimary,
      givenNames: n.givenNames,
      surname: n.surname,
      birthSurname: n.birthSurname,
    })),
    events: p.eventRoles
      .map((r) => r.event)
      .sort(bySortKey)
      .map(toSnapshotEvent),
  };
}

/** Całe drzewo (do wykresu, sprawdzania spójności i eksportu). */
export const loadTreeSnapshot = cache(async (treeId: string): Promise<TreeSnapshot> => {
  const [persons, parentLinks, unions] = await Promise.all([
    db.person.findMany({ where: { treeId }, include: personInclude, orderBy: { createdAt: "asc" } }),
    db.parentChild.findMany({ where: { child: { treeId } } }),
    db.union.findMany({ where: { treeId }, include: { events: { include: eventInclude } } }),
  ]);
  return {
    persons: persons.map(toSnapshotPerson),
    parentLinks: parentLinks.map((l) => ({ parentId: l.parentId, childId: l.childId, type: l.type })),
    unions: unions.map((u) => ({
      id: u.id,
      partner1Id: u.partner1Id,
      partner2Id: u.partner2Id,
      type: u.type,
      events: u.events.sort(bySortKey).map(toSnapshotEvent),
    })),
  };
});

/**
 * Osoba z najbliższą rodziną: rodzice, rodzeństwo, małżonkowie, dzieci.
 * Wystarcza do karty osoby i do sprawdzenia spójności dotyczącej tej osoby.
 */
export async function loadPersonNeighborhood(treeId: string, personId: string): Promise<TreeSnapshot> {
  const [asChild, asParent, unions] = await Promise.all([
    db.parentChild.findMany({ where: { childId: personId } }),
    db.parentChild.findMany({ where: { parentId: personId } }),
    db.union.findMany({
      where: { treeId, OR: [{ partner1Id: personId }, { partner2Id: personId }] },
      include: { events: { include: eventInclude } },
    }),
  ]);
  const parentIds = asChild.map((l) => l.parentId);
  const siblingLinks = parentIds.length
    ? await db.parentChild.findMany({ where: { parentId: { in: parentIds }, childId: { not: personId } } })
    : [];

  const ids = new Set<string>([
    personId,
    ...parentIds,
    ...asParent.map((l) => l.childId),
    ...siblingLinks.map((l) => l.childId),
    ...unions.flatMap((u) => [u.partner1Id, u.partner2Id]),
  ]);
  const persons = await db.person.findMany({
    where: { treeId, id: { in: [...ids] } },
    include: personInclude,
  });

  const links = [...asChild, ...asParent, ...siblingLinks];
  const seen = new Set<string>();
  return {
    persons: persons.map(toSnapshotPerson),
    parentLinks: links
      .filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)))
      .map((l) => ({ parentId: l.parentId, childId: l.childId, type: l.type })),
    unions: unions.map((u) => ({
      id: u.id,
      partner1Id: u.partner1Id,
      partner2Id: u.partner2Id,
      type: u.type,
      events: u.events.sort(bySortKey).map(toSnapshotEvent),
    })),
  };
}

/** Lista miejsc w drzewie – do podpowiedzi w formularzach. */
export async function loadTreePlaces(treeId: string) {
  return db.place.findMany({
    where: { treeId },
    select: { id: true, name: true, jurisdiction: true, parish: true },
    orderBy: { name: "asc" },
    take: 2000,
  });
}
