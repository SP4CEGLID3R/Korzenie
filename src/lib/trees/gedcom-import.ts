import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { GedcomImport, ImportedEvent, ImportedPlace } from "@/lib/gedcom/import";
import type { ParentChildType } from "@/lib/genealogy/types";
import { dateColumns, orderedPair } from "./write";

const CHUNK = 1000;

async function createInChunks<T>(rows: T[], create: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await create(rows.slice(i, i + CHUNK));
}

export type ImportSummary = { treeId: string; persons: number; families: number; places: number };

/**
 * Zapisuje zaimportowany GEDCOM jako NOWE drzewo użytkownika.
 * Wszystko w jednej transakcji – albo całe drzewo, albo nic.
 */
export async function saveImportedTree(
  ownerId: string,
  treeName: string,
  data: GedcomImport,
): Promise<ImportSummary> {
  const treeId = randomUUID();
  const personId = new Map(data.persons.map((p) => [p.xref, randomUUID()]));

  const places = new Map<string, { id: string; place: ImportedPlace }>();
  const placeId = (p: ImportedPlace | null) => {
    if (!p) return null;
    let entry = places.get(p.key);
    if (!entry) {
      entry = { id: randomUUID(), place: p };
      places.set(p.key, entry);
    } else if (entry.place.latitude === null && p.latitude !== null) {
      entry.place = { ...entry.place, latitude: p.latitude, longitude: p.longitude };
    }
    return entry.id;
  };

  const names: Prisma.PersonNameCreateManyInput[] = [];
  const events: Prisma.EventCreateManyInput[] = [];
  const participants: Prisma.EventParticipantCreateManyInput[] = [];
  const eventRow = (e: ImportedEvent<string>, unionId: string | null): Prisma.EventCreateManyInput => ({
    id: randomUUID(),
    treeId,
    type: e.type as Prisma.EventCreateManyInput["type"],
    ...dateColumns(e),
    placeId: placeId(e.place),
    unionId,
    description: e.description,
  });

  for (const p of data.persons) {
    const id = personId.get(p.xref)!;
    p.names.forEach((n, i) =>
      names.push({ personId: id, ...n, givenNames: n.givenNames || "NN", sortOrder: i }),
    );
    for (const e of p.events) {
      const row = eventRow(e, null);
      events.push(row);
      participants.push({ eventId: row.id!, personId: id, role: "PRINCIPAL" });
    }
  }

  // Rodzaj pokrewieństwa: z FAMC/PEDI osoby, a gdy brak – z rekordu rodziny.
  const pediByChildFamily = new Map<string, ParentChildType>();
  for (const p of data.persons) {
    for (const c of p.childOf) pediByChildFamily.set(`${p.xref}|${c.familyXref}`, c.type);
  }

  const unions = new Map<string, Prisma.UnionCreateManyInput>();
  const parentLinks = new Map<string, Prisma.ParentChildCreateManyInput>();
  for (const f of data.families) {
    const husband = f.husband ? personId.get(f.husband) : undefined;
    const wife = f.wife ? personId.get(f.wife) : undefined;
    let unionId: string | null = null;
    if (husband && wife && husband !== wife) {
      const [partner1Id, partner2Id] = orderedPair(husband, wife);
      const key = `${partner1Id}+${partner2Id}`;
      let u = unions.get(key);
      if (!u) {
        u = { id: randomUUID(), treeId, partner1Id, partner2Id, type: "MARRIAGE" };
        unions.set(key, u);
      }
      unionId = u.id!;
    }
    if (unionId) for (const e of f.events) events.push(eventRow(e, unionId));

    for (const c of f.children) {
      const childId = personId.get(c.xref);
      if (!childId) continue;
      const type = pediByChildFamily.get(`${c.xref}|${f.xref}`) ?? c.type ?? "BIOLOGICAL";
      for (const parentId of [husband, wife]) {
        if (!parentId || parentId === childId) continue;
        parentLinks.set(`${parentId}>${childId}`, { parentId, childId, type });
      }
    }
  }

  await db.$transaction(
    async (tx) => {
      await tx.tree.create({
        data: {
          id: treeId,
          name: treeName,
          ownerId,
          members: { create: { userId: ownerId, role: "OWNER" } },
        },
      });
      await createInChunks(
        [...places.values()].map(({ id, place }) => ({
          id,
          treeId,
          name: place.name,
          jurisdiction: place.jurisdiction,
          latitude: place.latitude,
          longitude: place.longitude,
        })),
        (rows) => tx.place.createMany({ data: rows }),
      );
      await createInChunks(
        data.persons.map((p) => ({
          id: personId.get(p.xref)!,
          treeId,
          sex: p.sex,
          notes: p.notes,
          gedcomId: p.xref,
          livingStatus: p.events.some((e) => e.type === "DEATH" || e.type === "BURIAL")
            ? ("DECEASED" as const)
            : ("AUTO" as const),
        })),
        (rows) => tx.person.createMany({ data: rows }),
      );
      await createInChunks(names, (rows) => tx.personName.createMany({ data: rows }));
      await createInChunks([...unions.values()], (rows) => tx.union.createMany({ data: rows }));
      await createInChunks(events, (rows) => tx.event.createMany({ data: rows }));
      await createInChunks(participants, (rows) => tx.eventParticipant.createMany({ data: rows }));
      await createInChunks([...parentLinks.values()], (rows) => tx.parentChild.createMany({ data: rows }));
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  return { treeId, persons: data.persons.length, families: data.families.length, places: places.size };
}
