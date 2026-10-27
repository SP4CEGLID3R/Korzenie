// Zamiana osoby z drzewa (TreeSnapshot) na „fakty” do porównania z rekordami.

import type { GenDate } from "@/lib/genealogy/dates";
import { primaryName } from "@/lib/genealogy/names";
import type { SnapshotEvent, SnapshotPerson, TreeSnapshot } from "@/lib/genealogy/types";
import { livingStatusMap } from "@/lib/privacy/living";
import type { NameFact, PersonFacts, PlaceFact, YearRange } from "./types";

/** Przedział lat z daty genealogicznej („ok. 1850” → 1848–1852, „przed 1863” → 1853–1863). */
export function yearRangeOf(d: GenDate): YearRange | null {
  const y = d.dateYear;
  if (y === null) return null;
  switch (d.dateQualifier ?? "EXACT") {
    case "EXACT":
      return { min: y, max: y };
    case "ABOUT":
      return { min: y - 2, max: y + 2 };
    case "BEFORE":
      return { min: y - 10, max: y };
    case "AFTER":
      return { min: y, max: y + 10 };
    case "BETWEEN":
      return { min: y, max: d.dateEndYear ?? y };
  }
}

function placeFact(e: SnapshotEvent): PlaceFact | null {
  if (!e.place) return null;
  return {
    name: e.place.name,
    parish: e.place.parish,
    region: e.place.jurisdiction,
    latitude: e.place.latitude,
    longitude: e.place.longitude,
  };
}

function firstRange(events: SnapshotEvent[], types: string[]) {
  for (const t of types) {
    const e = events.find((x) => x.type === t && x.dateYear !== null);
    if (e) return yearRangeOf(e);
  }
  return null;
}

function nameFact(p: SnapshotPerson | undefined, { maiden = false } = {}): NameFact | null {
  if (!p) return null;
  const n = primaryName(p.names);
  if (!n) return null;
  return { given: n.givenNames || null, surname: (maiden ? n.birthSurname : null) ?? n.surname ?? null };
}

// Status „żyjąca” liczymy raz na całe drzewo (przy wyszukiwaniu dla tysięcy osób).
const livingCache = new WeakMap<TreeSnapshot, { year: number; map: Map<string, boolean> }>();
function livingOf(tree: TreeSnapshot, year: number) {
  const hit = livingCache.get(tree);
  if (hit && hit.year === year) return hit.map;
  const map = livingStatusMap(tree, year);
  livingCache.set(tree, { year, map });
  return map;
}

export function personFacts(tree: TreeSnapshot, personId: string, now: Date = new Date()): PersonFacts {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const p = byId.get(personId);
  if (!p) throw new Error(`Brak osoby ${personId}`);
  const n = primaryName(p.names);
  const surnames = [
    ...new Set(
      p.names
        .flatMap((x) => [x.birthSurname, x.surname])
        .filter((x): x is string => Boolean(x && x.trim())),
    ),
  ];

  const parents = tree.parentLinks
    .filter((l) => l.childId === personId && l.type === "BIOLOGICAL")
    .map((l) => byId.get(l.parentId))
    .filter((x): x is SnapshotPerson => Boolean(x));
  const father = parents.find((x) => x.sex === "MALE");
  const mother = parents.find((x) => x.sex === "FEMALE");
  const spouses = tree.unions
    .filter((u) => u.partner1Id === personId || u.partner2Id === personId)
    .map((u) => byId.get(u.partner1Id === personId ? u.partner2Id : u.partner1Id))
    .map((s) => nameFact(s, { maiden: true }))
    .filter((x): x is NameFact => Boolean(x));

  return {
    id: p.id,
    sex: p.sex,
    givenNames: n?.givenNames || null,
    birthSurname: n?.birthSurname ?? n?.surname ?? null,
    surnames,
    birth: firstRange(p.events, ["BIRTH", "BAPTISM"]),
    death: firstRange(p.events, ["DEATH", "BURIAL"]),
    birthPlaces: p.events
      .filter((e) => e.type === "BIRTH" || e.type === "BAPTISM")
      .map(placeFact)
      .filter((x): x is PlaceFact => Boolean(x)),
    deathPlaces: p.events
      .filter((e) => e.type === "DEATH" || e.type === "BURIAL")
      .map(placeFact)
      .filter((x): x is PlaceFact => Boolean(x)),
    father: nameFact(father),
    mother: nameFact(mother, { maiden: true }),
    spouses,
    living: livingOf(tree, now.getFullYear()).get(p.id) ?? true,
  };
}
