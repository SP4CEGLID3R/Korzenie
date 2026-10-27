// Punktacja dopasowania „osoba z drzewa ↔ rekord ze źródła”.
//
// Dla każdego pola, które da się porównać, liczymy podobieństwo 0–1 i zapisujemy
// wyjaśnienie (zgadza się / częściowo / nie zgadza się / brak danych).
// Wynik 0–100 = ważona zgodność × zakres porównanych danych (config.ts).

import { MATCH_CONFIG, type MatchConfig } from "./config";
import { canonicalGivenNames, fold, sharesKey, surnameKeys } from "./normalize";
import { jaroWinkler, sharesSoundex } from "./phonetic";
import type {
  ExplanationItem,
  ExplanationStatus,
  MatchResult,
  NameFact,
  PersonFacts,
  PlaceFact,
  RecordFacts,
  YearRange,
} from "./types";

type Sim = { s: number; status: ExplanationStatus; detail: string };

// ───────────────────────────── Imiona ─────────────────────────────

export function givenNameSimilarity(
  a: string,
  b: string,
  sex?: "MALE" | "FEMALE" | "UNKNOWN",
  cfg: MatchConfig = MATCH_CONFIG,
): Sim {
  const ta = canonicalGivenNames(a, sex);
  const tb = canonicalGivenNames(b, sex);
  // Zgodność przez słownik (Joannes = Jan). Pierwsze imię liczy się najbardziej.
  for (const [i, x] of ta.entries()) {
    for (const [j, y] of tb.entries()) {
      const common = x.canonical.find((c) => y.canonical.includes(c));
      if (!common) continue;
      const translated = fold(x.original) !== fold(y.original);
      const detail = translated ? `${y.original} → ${common}` : common;
      return i === 0 && j === 0
        ? { s: 1, status: "match", detail }
        : { s: 0.9, status: "match", detail: `${detail} (jedno z imion)` };
    }
  }
  // Imię spoza słownika – porównanie pisowni i brzmienia.
  const jw = jaroWinkler(a.split(/\s+/)[0] ?? a, b.split(/\s+/)[0] ?? b);
  if (jw >= cfg.names.jaroWinklerVariant) return { s: 0.85, status: "partial", detail: `${b} ≈ ${a} (podobna pisownia)` };
  if (jw >= cfg.names.jaroWinklerWithSoundex && sharesSoundex(a, b)) {
    return { s: 0.6, status: "partial", detail: `${b} ≈ ${a} (podobne brzmienie)` };
  }
  return { s: 0, status: "mismatch", detail: `${b} ≠ ${a}` };
}

// ───────────────────────────── Nazwiska ─────────────────────────────

export function surnameSimilarity(personSurnames: string[], recordSurname: string, cfg: MatchConfig = MATCH_CONFIG): Sim {
  const rk = surnameKeys(recordSurname);
  let best: Sim = { s: 0, status: "mismatch", detail: `${recordSurname} ≠ ${personSurnames.join(" / ")}` };
  for (const ps of personSurnames) {
    if (sharesKey(surnameKeys(ps), rk)) {
      const same = fold(ps) === fold(recordSurname);
      return {
        s: 1,
        status: "match",
        detail: same ? ps : `${recordSurname} = ${ps} (inna forma tego samego nazwiska)`,
      };
    }
    const jw = jaroWinkler(ps, recordSurname);
    if (jw >= cfg.names.jaroWinklerVariant && best.s < 0.85) {
      best = { s: 0.85, status: "partial", detail: `${recordSurname} ≈ ${ps} (podobna pisownia)` };
    } else if (jw >= cfg.names.jaroWinklerWithSoundex && sharesSoundex(ps, recordSurname) && best.s < 0.7) {
      best = { s: 0.7, status: "partial", detail: `${recordSurname} ≈ ${ps} (podobne brzmienie)` };
    }
  }
  return best;
}

// ───────────────────────────── Lata ─────────────────────────────

function rangeText(r: YearRange) {
  return r.min === r.max ? String(r.min) : `${r.min}–${r.max}`;
}

function yearsWord(n: number) {
  if (n === 1) return "rok";
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && !(t >= 12 && t <= 14) ? "lata" : "lat";
}

export function yearSimilarity(person: YearRange, record: YearRange, cfg: MatchConfig = MATCH_CONFIG): Sim {
  const d = Math.max(0, record.min - person.max, person.min - record.max);
  const text = `${rangeText(record)} w rekordzie, ${rangeText(person)} w drzewie`;
  if (d === 0) return { s: 1, status: "match", detail: rangeText(record) };
  if (d <= cfg.years.noPenalty) return { s: 1, status: "partial", detail: `${text} – różnica ${d} ${yearsWord(d)}` };
  if (d >= cfg.years.zeroAt) return { s: 0, status: "mismatch", detail: `${text} – różnica ${d} lat` };
  const s = 1 - (d - cfg.years.noPenalty) / (cfg.years.zeroAt - cfg.years.noPenalty);
  return { s, status: "partial", detail: `${text} – różnica ${d} ${yearsWord(d)}` };
}

// ───────────────────────────── Miejsca ─────────────────────────────

function distanceKm(a: PlaceFact, b: PlaceFact) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function placeNames(p: PlaceFact) {
  return [p.name, p.parish].filter((x): x is string => Boolean(x)).map(fold);
}

export function placeSimilarity(personPlaces: PlaceFact[], record: PlaceFact, cfg: MatchConfig = MATCH_CONFIG): Sim {
  const rn = placeNames(record);
  let best: Sim = { s: 0, status: "mismatch", detail: `${record.name} ≠ ${personPlaces.map((p) => p.name).join(" / ")}` };
  for (const p of personPlaces) {
    if (placeNames(p).some((n) => rn.includes(n))) {
      return { s: cfg.places.sameParish, status: "match", detail: record.parish ? `${record.name} (parafia ${record.parish})` : record.name };
    }
    const km = distanceKm(p, record);
    if (km !== null && km <= cfg.places.nearbyKm && best.s < cfg.places.nearby) {
      best = { s: cfg.places.nearby, status: "partial", detail: `${record.name} – ok. ${Math.round(km)} km od: ${p.name}` };
      continue;
    }
    const pr = p.region ? fold(p.region.split(",")[0]) : null;
    const rr = record.region ? fold(record.region.split(",")[0]) : null;
    if (pr && rr && pr === rr && best.s < cfg.places.sameRegion) {
      best = { s: cfg.places.sameRegion, status: "partial", detail: `${record.name} – ten sam region (${record.region!.split(",")[0]})` };
    }
  }
  return best;
}

// ───────────────────────────── Całość ─────────────────────────────

const LABELS: Record<keyof MatchConfig["weights"], string> = {
  surname: "Nazwisko",
  givenNames: "Imię",
  birthYear: "Rok urodzenia",
  deathYear: "Rok zgonu",
  eventYear: "Rok wydarzenia",
  birthPlace: "Miejsce urodzenia",
  deathPlace: "Miejsce zgonu",
  fatherGiven: "Imię ojca",
  motherGiven: "Imię matki",
  motherMaiden: "Nazwisko rodowe matki",
  spouseGiven: "Imię współmałżonka",
  spouseSurname: "Nazwisko współmałżonka",
};

/** Krótkie nazwy pól do zdania podsumowania. */
const SHORT: Record<keyof MatchConfig["weights"], string> = {
  surname: "nazwisko",
  givenNames: "imię",
  birthYear: "rok urodzenia",
  deathYear: "rok zgonu",
  eventYear: "rok wydarzenia",
  birthPlace: "miejsce urodzenia",
  deathPlace: "miejsce zgonu",
  fatherGiven: "imię ojca",
  motherGiven: "imię matki",
  motherMaiden: "nazwisko rodowe matki",
  spouseGiven: "imię współmałżonka",
  spouseSurname: "nazwisko współmałżonka",
};

type Field = keyof MatchConfig["weights"];

/** Pola, których brak warto zgłosić – zależnie od rodzaju aktu (akt chrztu nie podaje daty zgonu). */
const RELEVANT: Record<RecordFacts["kind"], Field[]> = {
  BIRTH: ["surname", "givenNames", "birthYear", "birthPlace", "fatherGiven", "motherGiven", "motherMaiden"],
  BAPTISM: ["surname", "givenNames", "birthYear", "birthPlace", "fatherGiven", "motherGiven", "motherMaiden"],
  MARRIAGE: ["surname", "givenNames", "eventYear", "fatherGiven", "motherGiven", "motherMaiden", "spouseGiven", "spouseSurname"],
  DEATH: ["surname", "givenNames", "deathYear", "deathPlace", "spouseGiven", "spouseSurname"],
  BURIAL: ["surname", "givenNames", "deathYear", "deathPlace", "spouseGiven", "spouseSurname"],
  PERSON: ["surname", "givenNames", "birthYear", "deathYear", "birthPlace", "deathPlace", "fatherGiven", "motherGiven", "spouseGiven"],
};

export function scoreMatch(person: PersonFacts, record: RecordFacts, cfg: MatchConfig = MATCH_CONFIG): MatchResult {
  const items: (ExplanationItem & { weight: number; s: number | null })[] = [];

  const compare = (field: Field, personHas: boolean, recordHas: boolean, sim: () => Sim) => {
    const weight = cfg.weights[field];
    if (personHas && recordHas) {
      const r = sim();
      items.push({ field, label: LABELS[field], status: r.status, detail: r.detail, weight, s: r.s });
    } else if ((personHas || recordHas) && RELEVANT[record.kind].includes(field)) {
      items.push({
        field,
        label: LABELS[field],
        status: "missing",
        detail: recordHas ? "brak w Twoim drzewie" : "brak w rekordzie",
        weight,
        s: null,
      });
    }
  };

  const isBirthRecord = record.kind === "BIRTH" || record.kind === "BAPTISM";
  const isDeathRecord = record.kind === "DEATH" || record.kind === "BURIAL";

  // Nazwisko: w akcie urodzenia porównujemy z nazwiskiem rodowym.
  const surnames = isBirthRecord && person.birthSurname ? [person.birthSurname] : person.surnames;
  compare("surname", surnames.length > 0, Boolean(record.person.surname), () =>
    surnameSimilarity(surnames, record.person.surname!, cfg),
  );
  compare("givenNames", Boolean(person.givenNames), Boolean(record.person.given), () =>
    givenNameSimilarity(person.givenNames!, record.person.given!, person.sex, cfg),
  );

  // Lata
  const recordBirth = isBirthRecord && record.year ? { min: record.year, max: record.year } : (record.birth ?? null);
  compare("birthYear", Boolean(person.birth), Boolean(recordBirth), () => yearSimilarity(person.birth!, recordBirth!, cfg));
  const recordDeath = isDeathRecord && record.year ? { min: record.year, max: record.year } : (record.death ?? null);
  compare("deathYear", Boolean(person.death), Boolean(recordDeath), () => yearSimilarity(person.death!, recordDeath!, cfg));
  if (record.kind === "MARRIAGE" && record.year && person.birth) {
    // Ślub: rozsądny wiek to 14–70 lat.
    const plausible = { min: person.birth.min + 14, max: person.birth.max + 70 };
    compare("eventYear", true, true, () => {
      const r = yearSimilarity(plausible, { min: record.year!, max: record.year! }, cfg);
      return r.s === 1
        ? { s: 1, status: "match", detail: `ślub w ${record.year} pasuje do wieku osoby` }
        : { ...r, detail: `ślub w ${record.year} – mało prawdopodobny przy dacie urodzenia ${rangeText(person.birth!)}` };
    });
  }

  // Miejsca
  const recordBirthPlace = isBirthRecord ? (record.place ?? null) : (record.birthPlace ?? null);
  compare("birthPlace", person.birthPlaces.length > 0, Boolean(recordBirthPlace), () =>
    placeSimilarity(person.birthPlaces, recordBirthPlace!, cfg),
  );
  const recordDeathPlace = isDeathRecord ? (record.place ?? null) : (record.deathPlace ?? null);
  compare("deathPlace", person.deathPlaces.length > 0, Boolean(recordDeathPlace), () =>
    placeSimilarity(person.deathPlaces, recordDeathPlace!, cfg),
  );

  // Rodzice
  compare("fatherGiven", Boolean(person.father?.given), Boolean(record.father?.given), () =>
    givenNameSimilarity(person.father!.given!, record.father!.given!, "MALE", cfg),
  );
  compare("motherGiven", Boolean(person.mother?.given), Boolean(record.mother?.given), () =>
    givenNameSimilarity(person.mother!.given!, record.mother!.given!, "FEMALE", cfg),
  );
  compare("motherMaiden", Boolean(person.mother?.surname), Boolean(record.mother?.surname), () =>
    surnameSimilarity([person.mother!.surname!], record.mother!.surname!, cfg),
  );

  // Małżonkowie: najlepiej pasujący z listy.
  const recordSpouses = (record.spouses ?? []).filter((s) => s.given || s.surname);
  if (person.spouses.length > 0 || recordSpouses.length > 0) {
    const best = bestSpouse(person.spouses, recordSpouses, cfg);
    compare("spouseGiven", person.spouses.some((s) => s.given), recordSpouses.some((s) => s.given), () => best.given!);
    compare("spouseSurname", person.spouses.some((s) => s.surname), recordSpouses.some((s) => s.surname), () => best.surname!);
  }

  // Płeć
  const sexMismatch =
    record.person.sex && record.person.sex !== "UNKNOWN" && person.sex !== "UNKNOWN" && record.person.sex !== person.sex;

  // ── Wynik ──
  const compared = items.filter((i) => i.s !== null);
  const totalWeight = compared.reduce((a, i) => a + i.weight, 0);
  let score = 0;
  if (totalWeight > 0) {
    const raw = compared.reduce((a, i) => a + i.weight * i.s!, 0) / totalWeight;
    const coverage = Math.min(1, totalWeight / cfg.coverageReference);
    score = 100 * raw * (1 - cfg.coverageShare + cfg.coverageShare * coverage);
  }
  const get = (f: Field) => compared.find((i) => i.field === f);
  const nameFields = [get("surname"), get("givenNames")];
  if (nameFields.every((x) => !x)) score = 0;
  if (nameFields.some((x) => x && x.s! < 0.5)) score = Math.min(score, cfg.capOnNameMismatch);
  if (!compared.some((i) => i.field !== "surname" && i.field !== "givenNames")) {
    score = Math.min(score, cfg.capWithoutContext);
  }
  if (get("birthYear")?.s === 0 || get("deathYear")?.s === 0) score = Math.min(score, cfg.thresholds.possible - 1);
  if (sexMismatch) score *= cfg.sexMismatchFactor;
  score = Math.round(Math.max(0, Math.min(100, score)));

  const explanation: ExplanationItem[] = items.map(({ field, label, status, detail }) => ({ field, label, status, detail }));
  if (sexMismatch) {
    explanation.unshift({ field: "sex", label: "Płeć", status: "mismatch", detail: "inna płeć niż w drzewie" });
  }

  return {
    score,
    strength: score >= cfg.thresholds.strong ? "strong" : score >= cfg.thresholds.possible ? "possible" : "none",
    items: explanation,
    summary: summarize(explanation),
  };
}

function bestSpouse(personSpouses: NameFact[], recordSpouses: NameFact[], cfg: MatchConfig) {
  let best: { given?: Sim; surname?: Sim; total: number } = { total: -1 };
  for (const ps of personSpouses) {
    for (const rs of recordSpouses) {
      const given = ps.given && rs.given ? givenNameSimilarity(ps.given, rs.given, undefined, cfg) : undefined;
      const surname = ps.surname && rs.surname ? surnameSimilarity([ps.surname], rs.surname, cfg) : undefined;
      const total = (given?.s ?? 0) + (surname?.s ?? 0);
      if (total > best.total) best = { given, surname, total };
    }
  }
  const none: Sim = { s: 0, status: "mismatch", detail: "inna osoba" };
  return { given: best.given ?? none, surname: best.surname ?? none };
}

function listPl(xs: string[]) {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} i ${xs[xs.length - 1]}`;
}

/** „Zgadza się nazwisko, imię i imię ojca. Różni się: rok urodzenia (o 1). Brak danych: imię matki.” */
export function summarize(items: ExplanationItem[]): string {
  const short = (i: ExplanationItem) => SHORT[i.field as Field] ?? i.label.toLowerCase();
  const match = items.filter((i) => i.status === "match").map(short);
  const partial = items.filter((i) => i.status === "partial").map((i) => {
    const diff = i.detail.match(/różnica (\d+)/);
    return diff ? `${short(i)} (o ${diff[1]})` : `${short(i)} (podobne)`;
  });
  const mismatch = items.filter((i) => i.status === "mismatch").map(short);
  const missing = items.filter((i) => i.status === "missing").map(short);
  const parts: string[] = [];
  if (match.length) parts.push(`Zgadza się: ${listPl(match)}.`);
  if (partial.length) parts.push(`Częściowo: ${listPl(partial)}.`);
  if (mismatch.length) parts.push(`Nie zgadza się: ${listPl(mismatch)}.`);
  if (missing.length) parts.push(`Brak danych: ${listPl(missing)}.`);
  return parts.join(" ");
}
