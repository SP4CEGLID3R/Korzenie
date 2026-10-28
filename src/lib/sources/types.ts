import type { Sex } from "@/lib/genealogy/types";
import type { RecordFacts, YearRange } from "@/lib/matching/types";

export type SourceKind = "GENETEKA" | "WIKIDATA" | "WIKIMEDIA_COMMONS" | "USER_SCAN" | "GEDCOM_IMPORT" | "ARCHIVE" | "OTHER";
export type RecordType = "BIRTH" | "BAPTISM" | "MARRIAGE" | "DEATH" | "BURIAL" | "PERSON" | "OTHER";

/** Zapytanie o osobę – to, co wysyłamy do źródła. Nigdy nie dotyczy osób żyjących. */
export type SourceQuery = {
  givenNames: string;
  surnames: string[];
  sex?: Sex;
  birth?: YearRange | null;
  death?: YearRange | null;
  /** Region w formacie źródła (np. kod województwa w Genetece). */
  region?: string | null;
};

/** Rekord znaleziony w źródle, gotowy do zapisania w tabeli Record. */
export type SourceCandidate = {
  externalId: string;
  type: RecordType;
  /** Link do oryginału, który użytkownik otwiera sam. */
  url: string;
  title: string;
  year: number | null;
  facts: RecordFacts;
  /** Drugie spojrzenie na ten sam akt – np. panna młoda w akcie ślubu. */
  altFacts?: RecordFacts;
  raw: unknown;
};

/** Wspólny interfejs wszystkich źródeł (Wikidata, Geneteka, …). */
export interface SourceAdapter {
  kind: SourceKind;
  /** Nazwa do wyświetlenia i przypisów. */
  title: string;
  citationText: string;
  license: string;
  homepage: string;
  search(query: SourceQuery): Promise<SourceCandidate[]>;
  /** Wiele zapytań naraz (mniej żądań do serwisu). Wynik w tej samej kolejności. */
  searchMany?(queries: SourceQuery[]): Promise<SourceCandidate[][]>;
  /** Link do wyszukiwarki źródła z tym zapytaniem – do samodzielnego sprawdzenia. */
  buildSearchUrl(query: SourceQuery): string;
  getRecord(externalId: string): Promise<SourceCandidate | null>;
}

export class SourceError extends Error {}
