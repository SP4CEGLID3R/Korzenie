import type { Sex } from "@/lib/genealogy/types";

export type NameFact = { given?: string | null; surname?: string | null };

/** Przedział lat (dla dokładnej daty min = max). */
export type YearRange = { min: number; max: number };

export type PlaceFact = {
  name: string;
  parish?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Co wiemy o osobie z drzewa – wejście do porównania. */
export type PersonFacts = {
  id: string;
  sex: Sex;
  givenNames: string | null;
  /** Nazwisko przy urodzeniu (dla kobiet zamężnych – rodowe). */
  birthSurname: string | null;
  /** Wszystkie znane formy nazwiska (rodowe, po ślubie, inne). */
  surnames: string[];
  birth: YearRange | null;
  death: YearRange | null;
  birthPlaces: PlaceFact[];
  deathPlaces: PlaceFact[];
  father: NameFact | null;
  /** Nazwisko matki = jej nazwisko rodowe, jeśli je znamy. */
  mother: NameFact | null;
  spouses: NameFact[];
  /** Osoba żyjąca – jej danych NIE wysyłamy do zewnętrznych serwisów. */
  living: boolean;
};

export type RecordKind = "BIRTH" | "BAPTISM" | "MARRIAGE" | "DEATH" | "BURIAL" | "PERSON";

/**
 * Znormalizowany rekord ze źródła (zapisywany w Record.normalized).
 * Każde źródło (Wikidata, Geneteka…) tłumaczy swoje dane na ten kształt.
 */
export type RecordFacts = {
  kind: RecordKind;
  /** Osoba, której dotyczy rekord (dziecko, zmarły, pan młody / panna młoda). */
  person: NameFact & { sex?: Sex | null };
  /** Rok wydarzenia opisanego w rekordzie (urodzenia, ślubu, zgonu). */
  year?: number | null;
  birth?: YearRange | null;
  death?: YearRange | null;
  place?: PlaceFact | null;
  birthPlace?: PlaceFact | null;
  deathPlace?: PlaceFact | null;
  father?: NameFact | null;
  mother?: NameFact | null;
  spouses?: NameFact[];
  /** Krótki opis do wyświetlenia (np. „polski generał, 1746–1817”). */
  description?: string | null;
};

export type ExplanationStatus = "match" | "partial" | "mismatch" | "missing";

export type ExplanationItem = {
  field: string;
  label: string;
  status: ExplanationStatus;
  detail: string;
};

export type MatchResult = {
  score: number;
  strength: "strong" | "possible" | "none";
  items: ExplanationItem[];
  /** Zdanie „po ludzku”: „Zgadza się nazwisko i imię ojca; rok różni się o 1.” */
  summary: string;
};
