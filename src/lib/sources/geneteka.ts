import "server-only";
import { db } from "@/lib/db";
import { cachedQuery, readCache, writeCache } from "./cache";
import { buildGenetekaUrl, type GenetekaQuery } from "./geneteka-links";
import { actToCandidate, isAllowed, parseGetAct, parseRobots, type GenetekaAct, type GetActResponse, type RobotsRules } from "./geneteka-parse";
import { politeFetch } from "./http";
import { SourceError, type SourceAdapter, type SourceQuery } from "./types";

// Automatyczne pobieranie wyników z Geneteki – DOMYŚLNIE WYŁĄCZONE.
//
// Geneteka to praca wolontariuszy Polskiego Towarzystwa Genealogicznego. Zanim
// włączysz ten tryb na produkcji (GENETEKA_FETCH_ENABLED=true), uzyskaj pisemną
// zgodę PTG. Zasady, których pilnuje ten moduł:
//  • przestrzegamy robots.txt (Crawl-delay – dziś 120 s między zapytaniami),
//  • odstęp liczymy w bazie danych, więc obowiązuje on wszystkie serwery naraz,
//  • każde zapytanie trafia do pamięci podręcznej na 30 dni,
//  • przedstawiamy się nagłówkiem User-Agent z adresem projektu i kontaktem,
//  • nigdy nie pytamy o osoby żyjące (pilnuje tego warstwa wyżej).

const ORIGIN = "https://geneteka.genealodzy.pl";
const API_PATH = "/api/getAct.php";
const CACHE_DAYS = 30;
/** Gdy robots.txt nie podaje opóźnienia – i tak co najmniej tyle. */
const MIN_DELAY_SECONDS = 10;
const DEFAULT_DELAY_SECONDS = 120;
const RATE_KEY = "ratelimit:geneteka";

export function isGenetekaFetchEnabled() {
  return process.env.GENETEKA_FETCH_ENABLED === "true";
}

async function robotsRules(): Promise<RobotsRules> {
  return cachedQuery("GENETEKA", { robots: 1 }, 1, async () => {
    const res = await politeFetch(`${ORIGIN}/robots.txt`, {}, { host: "geneteka-robots", minIntervalMs: 0, maxRetries: 0 });
    return parseRobots(await res.text());
  });
}

/**
 * Rezerwuje „okno” na zapytanie. Zwraca 0, gdy można pytać teraz, albo liczbę
 * sekund do odczekania. Jedno atomowe UPDATE w bazie – dwa serwery naraz nie
 * dostaną tego samego okna.
 */
async function acquireSlot(delaySeconds: number): Promise<number> {
  await db.$executeRaw`
    INSERT INTO app."SourceQueryCache" ("key", "kind", "response", "fetchedAt", "expiresAt")
    VALUES (${RATE_KEY}, 'GENETEKA'::app."SourceKind", '{}'::jsonb, to_timestamp(0), now() + interval '100 years')
    ON CONFLICT ("key") DO NOTHING`;
  const taken = await db.$queryRaw<{ ok: number }[]>`
    UPDATE app."SourceQueryCache" SET "fetchedAt" = now()
    WHERE "key" = ${RATE_KEY} AND "fetchedAt" <= now() - make_interval(secs => ${delaySeconds})
    RETURNING 1 AS ok`;
  if (taken.length > 0) return 0;
  const [row] = await db.$queryRaw<{ wait: number }[]>`
    SELECT CEIL(EXTRACT(EPOCH FROM ("fetchedAt" + make_interval(secs => ${delaySeconds}) - now())))::int AS wait
    FROM app."SourceQueryCache" WHERE "key" = ${RATE_KEY}`;
  return Math.max(1, row?.wait ?? delaySeconds);
}

const queryKey = (q: GenetekaQuery) => ({ v: 1, ...q });

/** Akty z Geneteki dla zapytania (z pamięci podręcznej albo – gdy wolno – z serwisu). */
export async function searchGenetekaActs(q: GenetekaQuery): Promise<GenetekaAct[]> {
  if (!isGenetekaFetchEnabled()) {
    throw new SourceError(
      "Automatyczne pobieranie z Geneteki jest wyłączone. Otwórz link do Geneteki i sprawdź wyniki samodzielnie.",
    );
  }
  const cached = await readCache<GenetekaAct[]>("GENETEKA", queryKey(q));
  if (cached) return cached;

  const rules = await robotsRules();
  if (!isAllowed(rules, API_PATH)) {
    throw new SourceError("Geneteka nie zezwala automatom na to zapytanie (robots.txt). Skorzystaj z linku.");
  }
  const delay = Math.max(MIN_DELAY_SECONDS, rules.crawlDelaySeconds ?? DEFAULT_DELAY_SECONDS);
  const wait = await acquireSlot(delay);
  if (wait > 0) {
    throw new SourceError(
      `Geneteka pozwala automatom na jedno zapytanie co ${delay} s. Spróbuj ponownie za ${wait} s – albo otwórz link i sprawdź sam.`,
    );
  }

  const params = new URL(buildGenetekaUrl(q)).searchParams;
  params.set("draw", "1");
  params.set("start", "0");
  params.set("length", "50");
  const res = await politeFetch(
    `${ORIGIN}${API_PATH}?${params.toString()}`,
    { headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" } },
    // Bez ponawiania – każde ponowienie byłoby kolejnym zapytaniem w oknie 120 s.
    { host: "geneteka", minIntervalMs: 0, maxRetries: 0, timeoutMs: 30_000 },
  );
  let json: GetActResponse;
  try {
    json = (await res.json()) as GetActResponse;
  } catch {
    throw new SourceError("Geneteka zwróciła nieoczekiwaną odpowiedź. Skorzystaj z linku.");
  }
  const acts = parseGetAct(json, q.kind);
  await writeCache("GENETEKA", queryKey(q), CACHE_DAYS, acts);
  return acts;
}

export const genetekaAdapter: SourceAdapter = {
  kind: "GENETEKA",
  title: "Geneteka",
  citationText: "Geneteka – indeksy metrykalne Polskiego Towarzystwa Genealogicznego (praca wolontariuszy)",
  license: "© Polskie Towarzystwo Genealogiczne – korzystanie zgodnie z regulaminem Geneteki",
  homepage: `${ORIGIN}/`,

  async search(query: SourceQuery) {
    const surname = query.surnames[0];
    if (!surname) return [];
    const acts = await searchGenetekaActs({
      kind: "B",
      lastname: surname,
      name: query.givenNames.split(/\s+/)[0],
      fromYear: query.birth ? query.birth.min - 2 : null,
      toYear: query.birth ? query.birth.max + 2 : null,
      region: (query.region as GenetekaQuery["region"]) ?? null,
    });
    return acts.map(actToCandidate);
  },

  buildSearchUrl(query: SourceQuery) {
    return buildGenetekaUrl({
      kind: "B",
      lastname: query.surnames[0] ?? "",
      name: query.givenNames.split(/\s+/)[0],
      fromYear: query.birth ? query.birth.min - 2 : null,
      toYear: query.birth ? query.birth.max + 2 : null,
      region: (query.region as GenetekaQuery["region"]) ?? null,
    });
  },

  // Geneteka nie ma stałych adresów pojedynczych aktów – rekord odtwarzamy z zapisanego wyniku.
  async getRecord() {
    return null;
  },
};
