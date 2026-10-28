// Fakty, które można dodać do drzewa z potwierdzonego rekordu.
// Zasada: nic nie trafia do drzewa samo. Ten moduł tylko PROPONUJE – użytkownik
// zaznacza, co chce dodać, a każdy dodany fakt dostaje przypis do rekordu.

import { EMPTY_DATE, formatGenDate, type GenDate } from "@/lib/genealogy/dates";
import { displayName, feminineSurname, masculineSurname, primaryName } from "@/lib/genealogy/names";
import type { SnapshotEvent, SnapshotPerson, TreeSnapshot } from "@/lib/genealogy/types";
import { canonicalGivenNames } from "./normalize";
import type { NameFact, PlaceFact, RecordFacts, YearRange } from "./types";

export type PlaceData = { name: string; jurisdiction: string | null; parish: string | null };
export type NewPerson = { givenNames: string; surname: string | null; birthSurname: string | null; sex: "MALE" | "FEMALE" };

export type FactProposal =
  | {
      key: "birth" | "death";
      kind: "event";
      label: string;
      eventType: "BIRTH" | "DEATH";
      date: GenDate;
      place: PlaceData | null;
      /** Uzupełniamy istniejące wydarzenie zamiast dodawać nowe. */
      updateEventId: string | null;
    }
  | { key: "father" | "mother"; kind: "parent"; label: string; person: NewPerson }
  | {
      key: "marriage";
      kind: "marriage";
      label: string;
      date: GenDate;
      place: PlaceData | null;
      /** Istniejący małżonek w drzewie albo nowa osoba do dodania. */
      spouseId: string | null;
      newSpouse: NewPerson | null;
    };

function dateFrom(year: number | null | undefined, exact?: [number, number, number] | null, range?: YearRange | null): GenDate {
  if (exact) {
    return { ...EMPTY_DATE, dateQualifier: "EXACT", dateYear: exact[0], dateMonth: exact[1], dateDay: exact[2] };
  }
  if (year) return { ...EMPTY_DATE, dateQualifier: "EXACT", dateYear: year };
  if (range) {
    return range.min === range.max
      ? { ...EMPTY_DATE, dateQualifier: "EXACT", dateYear: range.min }
      : { ...EMPTY_DATE, dateQualifier: "BETWEEN", dateYear: range.min, dateEndYear: range.max };
  }
  return EMPTY_DATE;
}

function placeData(p: PlaceFact | null | undefined): PlaceData | null {
  if (!p?.name) return null;
  return { name: p.name, parish: p.parish ?? null, jurisdiction: p.region ?? null };
}

function placeText(p: PlaceData | null) {
  if (!p) return "";
  return p.parish && p.parish !== p.name ? `${p.name} (parafia ${p.parish})` : p.parish ? `parafia ${p.name}` : p.name;
}

/** Czy data z rekordu mówi więcej niż ta w drzewie. */
function isMorePrecise(record: GenDate, existing: SnapshotEvent) {
  if (record.dateYear === null) return false;
  if (existing.dateYear === null) return true;
  if (existing.dateQualifier && existing.dateQualifier !== "EXACT") return record.dateQualifier === "EXACT";
  if (record.dateDay !== null && existing.dateDay === null) return record.dateYear === existing.dateYear;
  return false;
}

function eventProposal(
  person: SnapshotPerson,
  key: "birth" | "death",
  date: GenDate,
  place: PlaceData | null,
): FactProposal | null {
  if (date.dateYear === null && !place) return null;
  const types = key === "birth" ? ["BIRTH", "BAPTISM"] : ["DEATH", "BURIAL"];
  const existing = person.events.find((e) => types.includes(e.type));
  const what = key === "birth" ? "urodzenie" : "zgon";
  const text = [formatGenDate(date), placeText(place)].filter(Boolean).join(", ");
  if (!existing) {
    return {
      key,
      kind: "event",
      label: `Dodaj ${what}: ${text}`,
      eventType: key === "birth" ? "BIRTH" : "DEATH",
      date,
      place,
      updateEventId: null,
    };
  }
  const betterDate = isMorePrecise(date, existing);
  const addPlace = !existing.place && place;
  if (!betterDate && !addPlace) return null;
  return {
    key,
    kind: "event",
    label: `Uzupełnij ${what}: ${[betterDate ? formatGenDate(date) : null, addPlace ? placeText(place) : null].filter(Boolean).join(", ")}`,
    eventType: key === "birth" ? "BIRTH" : "DEATH",
    date: betterDate ? date : { ...EMPTY_DATE },
    place: addPlace ? place : null,
    updateEventId: existing.id,
  };
}

const sameGiven = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  const ca = canonicalGivenNames(a).flatMap((t) => t.canonical);
  const cb = canonicalGivenNames(b).flatMap((t) => t.canonical);
  return ca.some((x) => cb.includes(x)) || a.trim().toLowerCase() === b.trim().toLowerCase();
};

function nameLabel(n: NameFact, birth?: string | null) {
  const base = [n.given, n.surname].filter(Boolean).join(" ");
  return birth && birth !== n.surname ? `${base} z d. ${birth}` : base;
}

export function proposeFacts(tree: TreeSnapshot, personId: string, record: RecordFacts): FactProposal[] {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const person = byId.get(personId);
  if (!person) return [];
  const out: FactProposal[] = [];
  const push = (p: FactProposal | null) => p && out.push(p);

  // ── Wydarzenia osoby ──
  if (record.kind === "BIRTH" || record.kind === "BAPTISM") {
    push(eventProposal(person, "birth", dateFrom(record.year, record.date), placeData(record.place)));
  }
  if (record.kind === "DEATH" || record.kind === "BURIAL") {
    push(eventProposal(person, "death", dateFrom(record.year, record.date), placeData(record.place)));
    // Wiek w akcie zgonu → przybliżony rok urodzenia (tylko gdy w drzewie brak urodzenia).
    if (record.birth && !person.events.some((e) => e.type === "BIRTH" || e.type === "BAPTISM")) {
      const p = eventProposal(person, "birth", dateFrom(null, null, record.birth), null);
      if (p) out.push({ ...p, label: `${p.label} (wyliczone z wieku w akcie zgonu)` });
    }
  }
  if (record.kind === "PERSON") {
    push(eventProposal(person, "birth", dateFrom(null, null, record.birth), placeData(record.birthPlace)));
    push(eventProposal(person, "death", dateFrom(null, null, record.death), placeData(record.deathPlace)));
  }

  // ── Rodzice (tylko gdy w drzewie ich brak) ──
  const parents = tree.parentLinks.filter((l) => l.childId === personId).map((l) => byId.get(l.parentId));
  const hasFather = parents.some((p) => p?.sex === "MALE");
  const hasMother = parents.some((p) => p?.sex === "FEMALE");
  const own = primaryName(person.names);
  const familySurname = record.father?.surname ?? own?.birthSurname ?? own?.surname ?? null;
  if (!hasFather && record.father?.given) {
    const surname = familySurname ? masculineSurname(familySurname) : null;
    out.push({
      key: "father",
      kind: "parent",
      label: `Dodaj ojca: ${nameLabel({ given: record.father.given, surname })}`,
      person: { givenNames: record.father.given, surname, birthSurname: null, sex: "MALE" },
    });
  }
  if (!hasMother && record.mother?.given) {
    const maiden = record.mother.surname ?? null;
    const married = familySurname ? feminineSurname(familySurname) : maiden;
    out.push({
      key: "mother",
      kind: "parent",
      label: `Dodaj matkę: ${nameLabel({ given: record.mother.given, surname: married }, maiden)}`,
      person: { givenNames: record.mother.given, surname: married, birthSurname: maiden !== married ? maiden : null, sex: "FEMALE" },
    });
  }

  // ── Ślub ──
  if (record.kind === "MARRIAGE") {
    const spouseFact = record.spouses?.[0];
    const date = dateFrom(record.year, record.date);
    const place = placeData(record.place);
    const unions = tree.unions.filter((u) => u.partner1Id === personId || u.partner2Id === personId);
    const matching = unions.find((u) => {
      const other = byId.get(u.partner1Id === personId ? u.partner2Id : u.partner1Id);
      return other && sameGiven(primaryName(other.names)?.givenNames, spouseFact?.given);
    });
    const text = [formatGenDate(date), placeText(place)].filter(Boolean).join(", ");
    if (matching && !matching.events.some((e) => e.type === "MARRIAGE")) {
      const other = byId.get(matching.partner1Id === personId ? matching.partner2Id : matching.partner1Id)!;
      out.push({ key: "marriage", kind: "marriage", label: `Dodaj ślub z: ${displayName(other.names)} – ${text}`, date, place, spouseId: other.id, newSpouse: null });
    } else if (!matching && spouseFact?.given) {
      const sex = person.sex === "FEMALE" ? "MALE" : "FEMALE";
      const maiden = spouseFact.surname ?? null;
      const husbandSurname = person.sex === "FEMALE" ? maiden : own?.surname;
      const surname = sex === "FEMALE" && husbandSurname ? feminineSurname(husbandSurname) : maiden;
      out.push({
        key: "marriage",
        kind: "marriage",
        label: `Dodaj ${sex === "FEMALE" ? "żonę" : "męża"} i ślub: ${nameLabel({ given: spouseFact.given, surname }, sex === "FEMALE" ? maiden : null)} – ${text}`,
        date,
        place,
        spouseId: null,
        newSpouse: {
          givenNames: spouseFact.given,
          surname,
          birthSurname: sex === "FEMALE" && maiden !== surname ? maiden : null,
          sex,
        },
      });
    }
  }

  return out;
}
