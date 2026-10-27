// Zamiana sparsowanego GEDCOM na nasz model (osoby, imiona, wydarzenia, rodziny).
// Wynik nie zależy od bazy danych – zapisuje go src/lib/trees/gedcom-import.ts.

import { parseGedcomDate, type GenDate } from "@/lib/genealogy/dates";
import type {
  CoupleEventType,
  ParentChildType,
  PersonalEventType,
  Sex,
  SnapshotName,
} from "@/lib/genealogy/types";
import { child, childValue, children, decodeGedcom, parseGedcom, type GedcomNode } from "./parse";

export type ImportedPlace = {
  /** Pełny tekst z GEDCOM – klucz do łączenia tych samych miejsc. */
  key: string;
  name: string;
  jurisdiction: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type ImportedEvent<T extends string> = GenDate & {
  type: T;
  place: ImportedPlace | null;
  description: string | null;
};

export type ImportedPerson = {
  xref: string;
  sex: Sex;
  names: SnapshotName[];
  events: ImportedEvent<PersonalEventType>[];
  notes: string | null;
  /** Rodziny, w których osoba jest dzieckiem, z rodzajem pokrewieństwa. */
  childOf: { familyXref: string; type: ParentChildType }[];
};

export type ImportedFamily = {
  xref: string;
  husband: string | null;
  wife: string | null;
  children: { xref: string; type: ParentChildType | null }[];
  events: ImportedEvent<CoupleEventType>[];
};

export type GedcomImport = {
  persons: ImportedPerson[];
  families: ImportedFamily[];
  /** Program, z którego pochodzi plik (HEAD → SOUR). */
  sourceSystem: string | null;
  encoding: string;
  warnings: string[];
};

export const MAX_IMPORT_PERSONS = 20_000;
/** Limit pliku – musi być mniejszy niż serverActions.bodySizeLimit w next.config.ts. */
export const MAX_GEDCOM_BYTES = 4 * 1024 * 1024;

const PERSONAL_EVENTS: Record<string, PersonalEventType> = {
  BIRT: "BIRTH",
  CHR: "BAPTISM",
  BAPM: "BAPTISM",
  DEAT: "DEATH",
  BURI: "BURIAL",
  CREM: "BURIAL",
  RESI: "RESIDENCE",
  EMIG: "EMIGRATION",
  IMMI: "EMIGRATION",
  OCCU: "OCCUPATION",
  EVEN: "OTHER",
};

const FAMILY_EVENTS: Record<string, CoupleEventType> = {
  MARR: "MARRIAGE",
  DIV: "DIVORCE",
};

function pedigree(value: string | null | undefined): ParentChildType | null {
  switch ((value ?? "").trim().toLowerCase()) {
    case "birth":
    case "natural":
    case "biological":
      return "BIOLOGICAL";
    case "adopted":
      return "ADOPTIVE";
    case "foster":
      return "FOSTER";
    case "step":
    case "stepchild":
      return "STEP";
    case "":
      return null;
    default:
      return "UNKNOWN";
  }
}

/** „N50.8661” / „S12.5” → liczba ze znakiem. */
function coordinate(value: string | null): number | null {
  if (!value) return null;
  const m = value.trim().match(/^([NSEW])?\s*(-?\d+(?:[.,]\d+)?)$/i);
  if (!m) return null;
  const n = Number(m[2].replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return m[1] && /[SW]/i.test(m[1]) ? -Math.abs(n) : n;
}

function parsePlace(node: GedcomNode | undefined): ImportedPlace | null {
  const text = node?.value.trim();
  if (!node || !text) return null;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const map = child(node, "MAP");
  return {
    key: parts.join(", "),
    name: parts[0],
    jurisdiction: parts.length > 1 ? parts.slice(1).join(", ") : null,
    latitude: map ? coordinate(childValue(map, "LATI")) : null,
    longitude: map ? coordinate(childValue(map, "LONG")) : null,
  };
}

/** Treść notatek: wpisanej bezpośrednio albo wskazanej (@N1@). */
function noteTexts(node: GedcomNode, notes: Map<string, string>): string[] {
  return children(node, "NOTE")
    .map((n) => {
      const v = n.value.trim();
      return /^@[^@]+@$/.test(v) ? (notes.get(v) ?? "") : n.value;
    })
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseEvent<T extends string>(
  node: GedcomNode,
  type: T,
  notes: Map<string, string>,
): ImportedEvent<T> {
  const descriptionParts: string[] = [];
  if (node.tag === "OCCU" && node.value.trim()) descriptionParts.push(node.value.trim());
  if (node.tag === "EVEN") {
    const t = childValue(node, "TYPE");
    if (t) descriptionParts.push(t);
    if (node.value.trim()) descriptionParts.push(node.value.trim());
  }
  if (node.tag === "CREM") descriptionParts.push("Kremacja");
  if (node.tag === "IMMI") descriptionParts.push("Przyjazd (imigracja)");
  if (node.tag === "RESI" && node.value.trim()) descriptionParts.push(node.value.trim());
  descriptionParts.push(...noteTexts(node, notes));

  return {
    ...parseGedcomDate(childValue(node, "DATE")),
    type,
    place: parsePlace(child(node, "PLAC")),
    description: descriptionParts.length ? descriptionParts.join("\n") : null,
  };
}

type RawName = { given: string; surname: string | null; type: string | null; married: string | null };

function parseName(node: GedcomNode): RawName {
  // „Jan Wojciech /Kowalski/” – nazwisko między ukośnikami.
  const value = node.value.trim();
  const m = value.match(/^(.*?)\/(.*?)\/(.*)$/);
  let given = m ? `${m[1]} ${m[3]}`.replace(/\s+/g, " ").trim() : value;
  let surname = m ? m[2].trim() || null : null;
  const givn = childValue(node, "GIVN");
  const surn = childValue(node, "SURN");
  if (givn && !given) given = givn;
  if (surn && !surname) surname = surn;
  return {
    given,
    surname,
    type: childValue(node, "TYPE")?.toLowerCase() ?? null,
    married: childValue(node, "_MARNM"),
  };
}

/**
 * Zamienia rekordy NAME na nasze imiona. Główne imię to pierwsze NAME; jeśli
 * osoba ma też nazwisko po ślubie, główne imię dostaje nazwisko po ślubie,
 * a dotychczasowe zostaje nazwiskiem rodowym („Marianna Kowalska z d. Nowak”).
 */
function buildNames(raw: RawName[]): SnapshotName[] {
  if (raw.length === 0) return [];
  const [first, ...rest] = raw;
  const marriedRecord = rest.find((n) => n.type === "married");
  const birthRecord = rest.find((n) => n.type === "birth" || n.type === "maiden");
  const used = new Set<RawName>();

  let primary: SnapshotName;
  if (first.type === "married" && birthRecord?.surname && birthRecord.surname !== first.surname) {
    used.add(birthRecord);
    primary = { type: "MARRIED", isPrimary: true, givenNames: first.given, surname: first.surname, birthSurname: birthRecord.surname };
  } else if (first.type !== "married" && (first.married || marriedRecord?.surname)) {
    const married = first.married ?? marriedRecord!.surname;
    if (marriedRecord) used.add(marriedRecord);
    primary =
      married && married !== first.surname
        ? { type: "MARRIED", isPrimary: true, givenNames: first.given, surname: married, birthSurname: first.surname }
        : { type: "BIRTH", isPrimary: true, givenNames: first.given, surname: first.surname, birthSurname: null };
  } else {
    primary = {
      type: first.type === "married" ? "MARRIED" : "BIRTH",
      isPrimary: true,
      givenNames: first.given,
      surname: first.surname,
      birthSurname: null,
    };
  }

  const others: SnapshotName[] = rest
    .filter((n) => !used.has(n))
    .map((n) => ({
      type: n.type === "married" ? "MARRIED" : n.type === "birth" || n.type === "maiden" ? "BIRTH" : "ALIAS",
      isPrimary: false,
      givenNames: n.given,
      surname: n.surname,
      birthSurname: null,
    }));
  return [primary, ...others];
}

function sexOf(value: string | null): Sex {
  switch ((value ?? "").toUpperCase()) {
    case "M":
      return "MALE";
    case "F":
      return "FEMALE";
    default:
      return "UNKNOWN";
  }
}

export function importGedcom(bytes: Uint8Array): GedcomImport {
  const decoded = decodeGedcom(bytes);
  const { records, warnings: parseWarnings } = parseGedcom(decoded.text);
  const warnings = [...decoded.warnings, ...parseWarnings];

  const notes = new Map<string, string>();
  for (const r of records) {
    if (r.tag === "NOTE" && r.xref) notes.set(r.xref, r.value);
  }

  const head = records.find((r) => r.tag === "HEAD");
  const sour = head && child(head, "SOUR");
  const sourceSystem = sour ? (childValue(sour, "NAME") ?? (sour.value.trim() || null)) : null;

  let skippedSources = 0;
  let skippedMedia = 0;
  const countSkipped = (node: GedcomNode) => {
    skippedSources += children(node, "SOUR").length;
    skippedMedia += children(node, "OBJE").length;
    for (const c of node.children) {
      skippedSources += children(c, "SOUR").length;
      skippedMedia += children(c, "OBJE").length;
    }
  };

  const persons: ImportedPerson[] = [];
  for (const r of records) {
    if (r.tag !== "INDI" || !r.xref) continue;
    countSkipped(r);
    const events: ImportedEvent<PersonalEventType>[] = [];
    for (const c of r.children) {
      const type = PERSONAL_EVENTS[c.tag];
      if (type) events.push(parseEvent(c, type, notes));
    }
    persons.push({
      xref: r.xref,
      sex: sexOf(childValue(r, "SEX")),
      names: buildNames(children(r, "NAME").map(parseName)),
      events,
      notes: noteTexts(r, notes).join("\n\n") || null,
      childOf: children(r, "FAMC")
        .filter((f) => f.value.trim())
        .map((f) => ({ familyXref: f.value.trim(), type: pedigree(childValue(f, "PEDI")) ?? "BIOLOGICAL" })),
    });
  }

  const families: ImportedFamily[] = [];
  for (const r of records) {
    if (r.tag !== "FAM" || !r.xref) continue;
    countSkipped(r);
    const events: ImportedEvent<CoupleEventType>[] = [];
    for (const c of r.children) {
      const type = FAMILY_EVENTS[c.tag];
      if (type) events.push(parseEvent(c, type, notes));
    }
    families.push({
      xref: r.xref,
      husband: childValue(r, "HUSB"),
      wife: childValue(r, "WIFE"),
      children: children(r, "CHIL")
        .filter((c) => c.value.trim())
        .map((c) => ({
          xref: c.value.trim(),
          // Niektóre programy zapisują rodzaj pokrewieństwa przy dziecku (_FREL/_MREL).
          type: pedigree(childValue(c, "_FREL") ?? childValue(c, "_MREL") ?? childValue(c, "PEDI")),
        })),
      events,
    });
  }

  if (persons.length === 0) warnings.push("W pliku nie znaleziono żadnych osób (rekordów INDI).");
  if (persons.length > MAX_IMPORT_PERSONS) {
    warnings.push(`Plik zawiera ${persons.length} osób – to więcej niż limit ${MAX_IMPORT_PERSONS}.`);
  }
  if (skippedSources > 0) {
    warnings.push(`Pominięto ${skippedSources} cytowań źródeł – ich import pojawi się w kolejnych etapach.`);
  }
  if (skippedMedia > 0) warnings.push(`Pominięto ${skippedMedia} odnośników do zdjęć i plików.`);

  return { persons, families, sourceSystem, encoding: decoded.encoding, warnings };
}
