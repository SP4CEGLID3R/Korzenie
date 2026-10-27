// Wikidata: budowanie zapytań SPARQL i odczyt wyników (bez sieci – łatwo testować).
// Dane Wikidata są na licencji CC0. Dokumentacja: https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
//
// Szukamy ludzi (P31 = Q5) wyszukiwarką pełnotekstową Wikidata (usługa mwapi „Search”),
// która znajdzie też „Ludwik Tadeusz Kościuszko” dla zapytania „Ludwik Kościuszko”.
// Od razu pobieramy: płeć (P21), daty urodzenia/zgonu (P569/P570) z dokładnością,
// miejsca (P19/P20) ze współrzędnymi (P625), ojca (P22), matkę (P25), małżonków (P26).

import type { RecordFacts, YearRange } from "@/lib/matching/types";
import type { SourceCandidate, SourceQuery } from "./types";

const qidOf = (uri: string) => uri.split("/").pop() ?? uri;

export const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const MALE = "http://www.wikidata.org/entity/Q6581097";
const FEMALE = "http://www.wikidata.org/entity/Q6581072";

/** Zapis tekstu w SPARQL (cudzysłowy, ukośniki, nowe linie). */
function literal(s: string) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ")}"`;
}

/**
 * Warianty „Imię Nazwisko” do wyszukania: pierwsze imię × znane formy nazwiska
 * (rodowe, po ślubie). Wyszukiwarka pełnotekstowa sama znajdzie osoby z drugim imieniem.
 */
export function nameVariants(q: SourceQuery, max = 3): string[] {
  // Tylko litery, spacje, łączniki i apostrofy – znaki specjalne wyszukiwarki
  // (np. „insource:”, „/regex/”) mogłyby niepotrzebnie obciążyć serwery Wikidata.
  const clean = (s: string) => s.replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
  const first = clean(q.givenNames).split(" ")[0];
  if (!first) return [];
  const out = new Set<string>();
  for (const surname of q.surnames.map(clean).filter(Boolean)) out.add(`${first} ${surname}`);
  return [...out].slice(0, max);
}

const SELECT = `SELECT ?item ?itemLabel ?itemDescription ?sex ?birth ?birthPrecision ?death ?deathPrecision
  ?birthPlace ?birthPlaceLabel ?birthCoord ?deathPlace ?deathPlaceLabel ?deathCoord
  ?father ?fatherLabel ?mother ?motherLabel ?spouse ?spouseLabel`;

const BODY = `
  ?item wdt:P31 wd:Q5 .
  OPTIONAL { ?item wdt:P21 ?sex }
  OPTIONAL { ?item p:P569/psv:P569 [ wikibase:timeValue ?birth; wikibase:timePrecision ?birthPrecision ] }
  OPTIONAL { ?item p:P570/psv:P570 [ wikibase:timeValue ?death; wikibase:timePrecision ?deathPrecision ] }
  OPTIONAL { ?item wdt:P19 ?birthPlace . OPTIONAL { ?birthPlace wdt:P625 ?birthCoord } }
  OPTIONAL { ?item wdt:P20 ?deathPlace . OPTIONAL { ?deathPlace wdt:P625 ?deathCoord } }
  OPTIONAL { ?item wdt:P22 ?father }
  OPTIONAL { ?item wdt:P25 ?mother }
  OPTIONAL { ?item wdt:P26 ?spouse }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pl,en". }`;

/** Ile wyników wyszukiwarki bierzemy dla jednej nazwy (resztę odfiltruje punktacja). */
const RESULTS_PER_NAME = 10;

/**
 * Krok 1: sama wyszukiwarka pełnotekstowa – zwraca pary (szukana nazwa, osoba).
 * Bez dodatkowych złączeń, żeby zapytanie było krótkie (Wikidata liczy czas zapytań).
 */
export function buildPersonSearchSparql(names: string[]): string {
  const values = names.map(literal).join(" ");
  return `SELECT ?name ?item WHERE {
  hint:Query hint:optimizer "None" .
  VALUES ?name { ${values} }
  BIND(CONCAT(?name, " haswbstatement:P31=Q5") AS ?search)
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "Search"; wikibase:endpoint "www.wikidata.org";
                    mwapi:srsearch ?search; mwapi:srlimit "${RESULTS_PER_NAME}".
    ?item wikibase:apiOutputItem mwapi:title.
  }
}`;
}

/** Wynik kroku 1: nazwa → identyfikatory osób (Q…). */
export function parseSearchIds(json: SparqlJson): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const b of json.results.bindings) {
    if (!b.name || !b.item) continue;
    const qid = qidOf(b.item.value);
    if (!/^Q\d+$/.test(qid)) continue;
    const list = out.get(b.name.value) ?? [];
    if (!list.includes(qid)) list.push(qid);
    out.set(b.name.value, list);
  }
  return out;
}

/** Krok 2: szczegóły wielu osób naraz. */
export function buildDetailsSparql(qids: string[]): string {
  const safe = qids.filter((q) => /^Q\d+$/.test(q));
  return `${SELECT} WHERE {
  VALUES ?item { ${safe.map((q) => `wd:${q}`).join(" ")} }
  ${BODY}
}
LIMIT 5000`;
}

/** Wiersze dotyczące tylko podanych osób. */
export function filterByItems(json: SparqlJson, qids: string[]): SparqlJson {
  const wanted = new Set(qids);
  return { results: { bindings: json.results.bindings.filter((b) => wanted.has(qidOf(b.item.value))) } };
}

export function buildItemSparql(qid: string): string {
  if (!/^Q\d+$/.test(qid)) throw new Error("Niepoprawny identyfikator Wikidata.");
  return buildDetailsSparql([qid]);
}

// ───────────────────────────── Odczyt wyników ─────────────────────────────

type Binding = Record<string, { type: string; value: string; "xml:lang"?: string }>;
export type SparqlJson = { results: { bindings: Binding[] } };

type Place = { id: string; name: string; latitude: number | null; longitude: number | null };
type Ref = { id: string; name: string };

export type WikidataPerson = {
  qid: string;
  label: string;
  description: string | null;
  sex: "MALE" | "FEMALE" | "UNKNOWN";
  birth: YearRange | null;
  death: YearRange | null;
  birthPlace: Place | null;
  deathPlace: Place | null;
  father: Ref | null;
  mother: Ref | null;
  spouses: Ref[];
};


/** „1746-02-12T00:00:00Z” z dokładnością 11 (dzień) → 1746; dekada/wiek → przedział. */
export function yearRangeFromTime(value: string, precision: number): YearRange | null {
  const m = value.match(/^(-?)\+?(\d{1,4})-/);
  if (!m || m[1] === "-") return null;
  const y = Number(m[2]);
  if (precision >= 9) return { min: y, max: y };
  if (precision === 8) return { min: Math.floor(y / 10) * 10, max: Math.floor(y / 10) * 10 + 9 };
  if (precision === 7) return { min: Math.floor((y - 1) / 100) * 100 + 1, max: Math.floor((y - 1) / 100) * 100 + 100 };
  return null;
}

function mergeRange(a: YearRange | null, b: YearRange | null) {
  if (!a) return b;
  if (!b) return a;
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

function point(value: string | undefined) {
  const m = value?.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
  return m ? { longitude: Number(m[1]), latitude: Number(m[2]) } : { longitude: null, latitude: null };
}

/** Etykieta bez nazwy (Wikidata podaje wtedy sam identyfikator, np. „Q123”). */
const isRealLabel = (s: string | undefined) => Boolean(s && !/^Q\d+$/.test(s));

/** Wiersze SPARQL (jeden na każdą kombinację wartości) → osoby. */
export function parseSparqlPersons(json: SparqlJson): WikidataPerson[] {
  const byQid = new Map<string, WikidataPerson>();
  for (const b of json.results.bindings) {
    const qid = qidOf(b.item.value);
    let p = byQid.get(qid);
    if (!p) {
      p = {
        qid,
        label: b.itemLabel?.value ?? qid,
        description: b.itemDescription?.value ?? null,
        sex: b.sex?.value === MALE ? "MALE" : b.sex?.value === FEMALE ? "FEMALE" : "UNKNOWN",
        birth: null,
        death: null,
        birthPlace: null,
        deathPlace: null,
        father: null,
        mother: null,
        spouses: [],
      };
      byQid.set(qid, p);
    }
    if (b.birth) p.birth = mergeRange(p.birth, yearRangeFromTime(b.birth.value, Number(b.birthPrecision?.value ?? 9)));
    if (b.death) p.death = mergeRange(p.death, yearRangeFromTime(b.death.value, Number(b.deathPrecision?.value ?? 9)));
    if (b.birthPlace && !p.birthPlace && isRealLabel(b.birthPlaceLabel?.value)) {
      p.birthPlace = { id: qidOf(b.birthPlace.value), name: b.birthPlaceLabel!.value, ...point(b.birthCoord?.value) };
    }
    if (b.deathPlace && !p.deathPlace && isRealLabel(b.deathPlaceLabel?.value)) {
      p.deathPlace = { id: qidOf(b.deathPlace.value), name: b.deathPlaceLabel!.value, ...point(b.deathCoord?.value) };
    }
    if (b.father && !p.father && isRealLabel(b.fatherLabel?.value)) p.father = { id: qidOf(b.father.value), name: b.fatherLabel!.value };
    if (b.mother && !p.mother && isRealLabel(b.motherLabel?.value)) p.mother = { id: qidOf(b.mother.value), name: b.motherLabel!.value };
    if (b.spouse && isRealLabel(b.spouseLabel?.value) && !p.spouses.some((s) => s.id === qidOf(b.spouse.value))) {
      p.spouses.push({ id: qidOf(b.spouse.value), name: b.spouseLabel!.value });
    }
  }
  return [...byQid.values()];
}

/** „Tadeusz Kościuszko” → imię „Tadeusz”, nazwisko „Kościuszko” (ostatni wyraz). */
export function splitLabel(label: string) {
  const parts = label.replace(/\s*\(.*\)\s*$/, "").trim().split(/\s+/);
  if (parts.length < 2) return { given: parts[0] ?? null, surname: null };
  return { given: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

export function toCandidate(p: WikidataPerson): SourceCandidate {
  const facts: RecordFacts = {
    kind: "PERSON",
    person: { ...splitLabel(p.label), sex: p.sex },
    birth: p.birth,
    death: p.death,
    birthPlace: p.birthPlace ? { name: p.birthPlace.name, latitude: p.birthPlace.latitude, longitude: p.birthPlace.longitude } : null,
    deathPlace: p.deathPlace ? { name: p.deathPlace.name, latitude: p.deathPlace.latitude, longitude: p.deathPlace.longitude } : null,
    father: p.father ? splitLabel(p.father.name) : null,
    mother: p.mother ? splitLabel(p.mother.name) : null,
    spouses: p.spouses.map((s) => splitLabel(s.name)),
    description: p.description,
  };
  return {
    externalId: p.qid,
    type: "PERSON",
    url: `https://www.wikidata.org/wiki/${p.qid}`,
    title: p.description ? `${p.label} – ${p.description}` : p.label,
    year: p.birth?.min ?? null,
    facts,
    raw: p,
  };
}
