import "server-only";
import { cachedQuery, readCache, writeCache } from "./cache";
import { politeFetch } from "./http";
import type { SourceAdapter, SourceCandidate, SourceQuery } from "./types";
import {
  buildDetailsSparql,
  buildItemSparql,
  buildPersonSearchSparql,
  filterByItems,
  nameVariants,
  parseSearchIds,
  parseSparqlPersons,
  toCandidate,
  WIKIDATA_SPARQL_ENDPOINT,
  type SparqlJson,
} from "./wikidata-sparql";

/** Wyniki wyszukiwania trzymamy 30 dni – dane w Wikidata zmieniają się powoli. */
const CACHE_DAYS = 30;
/**
 * Ile nazw łączymy w jednym wyszukiwaniu. Każda nazwa to osobne wyszukiwanie
 * pełnotekstowe (~1–3 s), a Wikidata przerywa zapytania po 60 s.
 */
const NAMES_PER_QUERY = 8;
/** Ile osób pobieramy w jednym zapytaniu o szczegóły. */
const ITEMS_PER_QUERY = 60;

const searchKey = (names: string[]) => ({ v: 3, names });

async function sparql(query: string): Promise<SparqlJson> {
  const res = await politeFetch(
    WIKIDATA_SPARQL_ENDPOINT,
    {
      method: "POST",
      headers: {
        Accept: "application/sparql-results+json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ query }).toString(),
    },
    // Wikimedia prosi o niewielki ruch – jedno zapytanie na 1,5 s z jednej instancji.
    { host: "query.wikidata.org", minIntervalMs: 1500, timeoutMs: 58_000, maxRetries: 1 },
  );
  return (await res.json()) as SparqlJson;
}

export const wikidataAdapter: SourceAdapter = {
  kind: "WIKIDATA",
  title: "Wikidata",
  citationText: "Wikidata – wolna baza wiedzy (Wikimedia Foundation), licencja CC0",
  license: "CC0 1.0",
  homepage: "https://www.wikidata.org",

  async search(query: SourceQuery): Promise<SourceCandidate[]> {
    const [result] = await this.searchMany!([query]);
    return result;
  },

  /**
   * Wyszukiwanie w dwóch krokach: (1) wyszukiwarka zwraca identyfikatory osób
   * dla wszystkich nazw, (2) jednym zapytaniem pobieramy ich szczegóły.
   * Wynik dla każdej osoby z drzewa trafia do pamięci podręcznej osobno.
   */
  async searchMany(queries: SourceQuery[]) {
    const names = queries.map((q) => nameVariants(q));
    const results: (SparqlJson | null)[] = await Promise.all(
      names.map((n) => (n.length ? readCache<SparqlJson>("WIKIDATA", searchKey(n)) : Promise.resolve({ results: { bindings: [] } }))),
    );
    const missing = results.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);

    if (missing.length > 0) {
      // Krok 1: identyfikatory
      const allNames = [...new Set(missing.flatMap((i) => names[i]))];
      const idsByName = new Map<string, string[]>();
      for (let i = 0; i < allNames.length; i += NAMES_PER_QUERY) {
        const json = await sparql(buildPersonSearchSparql(allNames.slice(i, i + NAMES_PER_QUERY)));
        for (const [name, ids] of parseSearchIds(json)) idsByName.set(name, ids);
      }
      // Krok 2: szczegóły
      const allIds = [...new Set([...idsByName.values()].flat())];
      const details: SparqlJson = { results: { bindings: [] } };
      for (let i = 0; i < allIds.length; i += ITEMS_PER_QUERY) {
        const json = await sparql(buildDetailsSparql(allIds.slice(i, i + ITEMS_PER_QUERY)));
        details.results.bindings.push(...json.results.bindings);
      }
      for (const i of missing) {
        const ids = [...new Set(names[i].flatMap((n) => idsByName.get(n) ?? []))];
        results[i] = filterByItems(details, ids);
        await writeCache("WIKIDATA", searchKey(names[i]), CACHE_DAYS, results[i]);
      }
    }
    return results.map((r) => parseSparqlPersons(r!).map(toCandidate));
  },

  buildSearchUrl(query: SourceQuery) {
    const name = nameVariants(query, 1)[0] ?? query.givenNames;
    return `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(name)}`;
  },

  async getRecord(qid: string) {
    const json = await cachedQuery("WIKIDATA", { v: 1, qid }, CACHE_DAYS, () => sparql(buildItemSparql(qid)));
    const [person] = parseSparqlPersons(json);
    return person ? toCandidate(person) : null;
  },
};
