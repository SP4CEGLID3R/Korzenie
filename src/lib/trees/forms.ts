// Odczyt i sprawdzanie danych z formularzy (osoba, wydarzenie, miejsce).
// Bez zależności od bazy – łatwo przetestować.

import { z } from "zod";
import { EMPTY_DATE, parsePolishDate, type GenDate } from "@/lib/genealogy/dates";
import type { EventType, LivingStatus, ParentChildType, Sex } from "@/lib/genealogy/types";

export type ActionState = {
  error?: string;
  /** Wpisane wartości – żeby formularz nie czyścił się po błędzie. */
  values?: Record<string, string>;
  /** Komunikat po udanym zapisie. */
  message?: string;
  /** Zmienia się po każdym udanym zapisie (do czyszczenia formularza). */
  savedAt?: number;
};

export function formValues(fd: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string" && !k.startsWith("$")) values[k] = v;
  }
  return values;
}

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Tekst może mieć najwyżej ${max} znaków.` })
    .transform((s) => (s === "" ? null : s));

const SEXES = ["MALE", "FEMALE", "UNKNOWN"] as const satisfies readonly Sex[];
const LIVING = ["AUTO", "LIVING", "DECEASED"] as const satisfies readonly LivingStatus[];
export const PERSONAL_EVENT_TYPES = [
  "BIRTH",
  "BAPTISM",
  "DEATH",
  "BURIAL",
  "OCCUPATION",
  "RESIDENCE",
  "EMIGRATION",
  "OTHER",
] as const satisfies readonly EventType[];
export const PARENT_CHILD_TYPES = [
  "BIOLOGICAL",
  "ADOPTIVE",
  "FOSTER",
  "STEP",
  "UNKNOWN",
] as const satisfies readonly ParentChildType[];

const personSchema = z.object({
  givenNames: z
    .string()
    .trim()
    .min(1, { error: "Podaj imię (jeśli nieznane, wpisz np. „NN”)." })
    .max(120, { error: "Imię może mieć najwyżej 120 znaków." }),
  surname: text(120),
  birthSurname: text(120),
  sex: z.enum(SEXES, { error: "Wybierz płeć." }),
  livingStatus: z.enum(LIVING).default("AUTO"),
  notes: text(10_000),
});

export type PersonInput = z.infer<typeof personSchema>;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Sprawdź dane w formularzu.";
}

const get = (fd: FormData, name: string) => {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
};

export function parsePersonForm(fd: FormData, prefix = ""): Result<PersonInput> {
  const r = personSchema.safeParse({
    givenNames: get(fd, `${prefix}givenNames`),
    surname: get(fd, `${prefix}surname`),
    birthSurname: get(fd, `${prefix}birthSurname`),
    sex: get(fd, `${prefix}sex`) || "UNKNOWN",
    livingStatus: get(fd, `${prefix}livingStatus`) || "AUTO",
    notes: get(fd, `${prefix}notes`),
  });
  return r.success ? { ok: true, data: r.data } : { ok: false, error: firstIssue(r.error) };
}

export type PlaceInput = { name: string; jurisdiction: string | null; parish: string | null };

const placeSchema = z.object({
  name: text(160),
  jurisdiction: text(240),
  parish: text(160),
});

/** Miejsce z pól `${prefix}place`, `${prefix}placeRegion`, `${prefix}parish`. Brak nazwy → null. */
export function parsePlaceFields(fd: FormData, prefix = ""): Result<PlaceInput | null> {
  const r = placeSchema.safeParse({
    name: get(fd, `${prefix}place`),
    jurisdiction: get(fd, `${prefix}placeRegion`),
    parish: get(fd, `${prefix}parish`),
  });
  if (!r.success) return { ok: false, error: firstIssue(r.error) };
  if (!r.data.name) {
    if (r.data.parish || r.data.jurisdiction) {
      return { ok: false, error: "Podaj nazwę miejscowości (parafię i region wpisz obok)." };
    }
    return { ok: true, data: null };
  }
  return { ok: true, data: { name: r.data.name, jurisdiction: r.data.jurisdiction, parish: r.data.parish } };
}

export function parseDateField(fd: FormData, name: string, label: string): Result<GenDate> {
  const r = parsePolishDate(get(fd, name));
  if (!r.ok) return { ok: false, error: `${label}: ${r.error}` };
  return { ok: true, data: r.date };
}

export type EventInput = {
  type: EventType;
  date: GenDate;
  place: PlaceInput | null;
  description: string | null;
};

const eventTypeSchema = z.enum(PERSONAL_EVENT_TYPES, { error: "Wybierz rodzaj wydarzenia." });

/** Wydarzenie z formularza (rodzaj, data, miejsce, opis). */
export function parseEventForm(fd: FormData, prefix = "", fixedType?: EventType): Result<EventInput> {
  const typeResult = fixedType
    ? { success: true as const, data: fixedType }
    : eventTypeSchema.safeParse(get(fd, `${prefix}type`));
  if (!typeResult.success) return { ok: false, error: firstIssue(typeResult.error) };

  const date = parseDateField(fd, `${prefix}date`, "Data");
  if (!date.ok) return date;
  const place = parsePlaceFields(fd, prefix);
  if (!place.ok) return place;
  const description = text(2000).safeParse(get(fd, `${prefix}description`));
  if (!description.success) return { ok: false, error: firstIssue(description.error) };

  if (typeResult.data === "OCCUPATION" && !description.data) {
    return { ok: false, error: "Wpisz zawód (np. rolnik, kowal, włościanin)." };
  }
  return {
    ok: true,
    data: { type: typeResult.data, date: date.data, place: place.data, description: description.data },
  };
}

/** Czy w wydarzeniu cokolwiek wpisano (pusty „zgon” w formularzu nowej osoby pomijamy). */
export function isEventEmpty(e: EventInput) {
  return e.date.dateYear === null && !e.date.dateText && !e.place && !e.description;
}

export { EMPTY_DATE };
