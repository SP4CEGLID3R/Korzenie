import { formatYearShort, type GenDate } from "./dates";
import type { EventType, SnapshotName, SnapshotPerson } from "./types";

const TYPE_ORDER: Record<SnapshotName["type"], number> = {
  BIRTH: 0,
  MARRIED: 1,
  RECORDED: 2,
  ALIAS: 3,
};

/** Imię i nazwisko, którymi osoba jest przedstawiana (główne albo rodowe). */
export function primaryName(names: SnapshotName[]): SnapshotName | null {
  if (names.length === 0) return null;
  return [...names].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type],
  )[0];
}

/** „Jan Kowalski”, „Marianna Kowalska z d. Nowak”, „(bez imienia)”. */
export function displayName(names: SnapshotName[], { withBirthSurname = true } = {}): string {
  const n = primaryName(names);
  if (!n) return "(bez imienia)";
  const base = [n.givenNames, n.surname].filter(Boolean).join(" ").trim() || "(bez imienia)";
  const birth = n.birthSurname ?? names.find((x) => x.type === "BIRTH" && x !== n)?.surname ?? null;
  if (withBirthSurname && birth && birth !== n.surname) return `${base} z d. ${birth}`;
  return base;
}

/** Klucz do sortowania alfabetycznego po nazwisku (po polsku). */
export function sortName(names: SnapshotName[]): string {
  const n = primaryName(names);
  return `${n?.surname ?? ""} ${n?.givenNames ?? ""}`.trim().toLocaleLowerCase("pl");
}

const BIRTH_TYPES: EventType[] = ["BIRTH", "BAPTISM"];
const DEATH_TYPES: EventType[] = ["DEATH", "BURIAL"];

/** Pierwsze z wydarzeń danego rodzaju, które ma datę (np. urodzenie, a gdy brak – chrzest). */
export function firstDatedEvent<T extends GenDate & { type: EventType }>(
  events: T[],
  types: EventType[],
): T | undefined {
  for (const type of types) {
    const e = events.find((x) => x.type === type && x.dateYear !== null);
    if (e) return e;
  }
  return undefined;
}

export function birthEvent(person: Pick<SnapshotPerson, "events">) {
  return firstDatedEvent(person.events, BIRTH_TYPES);
}

export function deathEvent(person: Pick<SnapshotPerson, "events">) {
  return firstDatedEvent(person.events, DEATH_TYPES);
}

/** „1850–1910”, „ur. 1850”, „zm. 1910”, „zm.” (wiadomo, że zmarła) albo pusty tekst. */
export function lifespan(person: Pick<SnapshotPerson, "events">): string {
  const b = birthEvent(person);
  const d = deathEvent(person);
  const by = b ? formatYearShort(b) : "";
  const dy = d ? formatYearShort(d) : "";
  if (by && dy) return `${by}–${dy}`;
  if (by) return `ur. ${by}`;
  if (dy) return `zm. ${dy}`;
  if (person.events.some((e) => DEATH_TYPES.includes(e.type))) return "zm.";
  return "";
}

/** Polskie etykiety. */
export const EVENT_LABEL: Record<EventType, string> = {
  BIRTH: "Urodzenie",
  BAPTISM: "Chrzest",
  MARRIAGE: "Ślub",
  DIVORCE: "Rozwód",
  DEATH: "Zgon",
  BURIAL: "Pochówek",
  RESIDENCE: "Zamieszkanie",
  EMIGRATION: "Wyjazd / emigracja",
  OCCUPATION: "Zawód",
  OTHER: "Inne",
};

export const SEX_LABEL = { MALE: "Mężczyzna", FEMALE: "Kobieta", UNKNOWN: "Nieznana" } as const;

// ───────────────── Żeńskie i męskie formy nazwisk ─────────────────
// Polskie nazwiska przymiotnikowe zmieniają końcówkę zależnie od płci:
// Kowalski ↔ Kowalska, Nowicki ↔ Nowicka, Zawadzki ↔ Zawadzka, Czarny ↔ Czarna.
// Pozostałe (Nowak, Wójcik, Kaczmarek) są takie same dla obu płci.

const ADJ_MASC_TO_FEM: [RegExp, string][] = [
  [/(ski)$/i, "ska"],
  [/(cki)$/i, "cka"],
  [/(dzki)$/i, "dzka"],
  [/(ny)$/i, "na"],
  [/(ły)$/i, "ła"],
  [/(wy)$/i, "wa"],
];

function keepCase(original: string, replacement: string) {
  return original === original.toUpperCase() ? replacement.toUpperCase() : replacement;
}

/** Żeńska forma nazwiska: „Kowalski” → „Kowalska”; „Nowak” bez zmian. */
export function feminineSurname(surname: string): string {
  for (const [re, fem] of ADJ_MASC_TO_FEM) {
    const m = surname.match(re);
    if (m) return surname.slice(0, -m[1].length) + keepCase(m[1], fem);
  }
  return surname;
}

/** Męska forma nazwiska: „Kowalska” → „Kowalski”; „Nowak” bez zmian. */
export function masculineSurname(surname: string): string {
  const pairs: [RegExp, string][] = [
    [/(dzka)$/i, "dzki"],
    [/(cka)$/i, "cki"],
    [/(ska)$/i, "ski"],
  ];
  for (const [re, masc] of pairs) {
    const m = surname.match(re);
    if (m) return surname.slice(0, -m[1].length) + keepCase(m[1], masc);
  }
  return surname;
}

/** Nazwisko w formie pasującej do płci osoby. */
export function surnameForSex(surname: string | null | undefined, sex: "MALE" | "FEMALE" | "UNKNOWN") {
  if (!surname) return null;
  if (sex === "FEMALE") return feminineSurname(surname);
  if (sex === "MALE") return masculineSurname(surname);
  return surname;
}
