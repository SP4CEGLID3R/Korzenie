// „Tropiciel” – podpowiada następne kroki poszukiwań dla osób z drzewa.
//
// Reguły (jak pracuje genealog z polskimi metrykami):
//  • akt urodzenia/chrztu podaje imiona rodziców i nazwisko rodowe matki,
//  • ślub rodziców odbywał się zwykle 0–15 lat przed urodzeniem dziecka,
//  • rodzeństwa szukamy w tej samej i sąsiednich parafiach (Geneteka przeszukuje
//    całe województwo), w latach, gdy matka mogła rodzić,
//  • zgonu szukamy od ostatniej znanej daty do ~100 lat po urodzeniu,
//  • kobiety w aktach zgonu występują zwykle pod nazwiskiem po mężu.
//
// Moduł nie zależy od bazy danych – dostaje TreeSnapshot i zwraca propozycje.

import { primaryName, displayName } from "@/lib/genealogy/names";
import type { SnapshotEvent, SnapshotPerson, TreeSnapshot } from "@/lib/genealogy/types";
import { yearRangeOf } from "@/lib/matching/facts";
import type { YearRange } from "@/lib/matching/types";
import { livingStatusMap } from "@/lib/privacy/living";
import {
  buildGenetekaUrl,
  detectGenetekaRegion,
  type GenetekaQuery,
  type GenetekaRegion,
} from "@/lib/sources/geneteka-links";

export type TaskKind = "FIND_BIRTH" | "FIND_MARRIAGE" | "FIND_DEATH" | "FIND_SIBLINGS" | "FIND_PARENTS";

export type TaskSearch = {
  label: string;
  query: GenetekaQuery;
  url: string;
};

export type Suggestion = {
  /** Stały klucz – ta sama propozycja ma zawsze ten sam klucz. */
  key: string;
  kind: TaskKind;
  /** Osoba, przy której pokazujemy zadanie. */
  personId: string;
  title: string;
  /** Dlaczego tu i w tych latach – po ludzku. */
  why: string;
  years: YearRange;
  region: GenetekaRegion | null;
  /** Miejscowość lub parafia, od której warto zacząć (do wyszukiwarek bez gotowych linków). */
  placeHint: string | null;
  searches: TaskSearch[];
};

/** Rodzaje rekordów potwierdzonych dla osoby (z tabeli Citation → Record.type). */
export type ConfirmedSources = Map<string, Set<string>>;

const MAX_YEAR_SPAN = 25;
/** Indeksy metrykalne obejmują zwykle akty starsze niż ~100 lat (urodzenia) i ~80 lat (śluby, zgony). */
const RECORDS_AVAILABLE_UNTIL = { B: 100, S: 80, D: 80 };

function firstYearRange(events: SnapshotEvent[], types: string[]) {
  for (const t of types) {
    const e = events.find((x) => x.type === t && x.dateYear !== null);
    if (e) return yearRangeOf(e);
  }
  return null;
}

const clampSpan = (r: YearRange): YearRange =>
  r.max - r.min > MAX_YEAR_SPAN ? { min: r.min, max: r.min + MAX_YEAR_SPAN } : r;

function widen(r: YearRange, by: number): YearRange {
  return { min: r.min - by, max: r.max + by };
}

type Ctx = {
  tree: TreeSnapshot;
  byId: Map<string, SnapshotPerson>;
  parentsOf: Map<string, string[]>;
  childrenOf: Map<string, string[]>;
  living: Map<string, boolean>;
  confirmed: ConfirmedSources;
  currentYear: number;
};

function makeCtx(tree: TreeSnapshot, confirmed: ConfirmedSources, now: Date): Ctx {
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  for (const l of tree.parentLinks) {
    if (l.type !== "BIOLOGICAL" && l.type !== "UNKNOWN") continue;
    parentsOf.set(l.childId, [...(parentsOf.get(l.childId) ?? []), l.parentId]);
    childrenOf.set(l.parentId, [...(childrenOf.get(l.parentId) ?? []), l.childId]);
  }
  return {
    tree,
    byId: new Map(tree.persons.map((p) => [p.id, p])),
    parentsOf,
    childrenOf,
    living: livingStatusMap(tree, now.getFullYear()),
    confirmed,
    currentYear: now.getFullYear(),
  };
}

/** Szacowany rok urodzenia: z dat osoby, a gdy ich brak – z dat dzieci lub ślubu. */
export function estimateBirth(ctx: Ctx, p: SnapshotPerson): { range: YearRange; estimated: boolean } | null {
  const own = firstYearRange(p.events, ["BIRTH", "BAPTISM"]);
  if (own) return { range: own, estimated: false };
  const childBirths = (ctx.childrenOf.get(p.id) ?? [])
    .map((c) => ctx.byId.get(c))
    .map((c) => (c ? firstYearRange(c.events, ["BIRTH", "BAPTISM"]) : null))
    .filter((r): r is YearRange => Boolean(r));
  if (childBirths.length) {
    const first = Math.min(...childBirths.map((r) => r.min));
    return { range: { min: first - 45, max: first - 16 }, estimated: true };
  }
  const marriage = marriageYears(ctx, p)[0];
  if (marriage) return { range: { min: marriage.min - 40, max: marriage.max - 16 }, estimated: true };
  const death = firstYearRange(p.events, ["DEATH", "BURIAL"]);
  if (death) return { range: { min: death.min - 90, max: death.max - 16 }, estimated: true };
  return null;
}

function unionsOf(ctx: Ctx, personId: string) {
  return ctx.tree.unions.filter((u) => u.partner1Id === personId || u.partner2Id === personId);
}

function marriageYears(ctx: Ctx, p: SnapshotPerson): YearRange[] {
  return unionsOf(ctx, p.id)
    .map((u) => u.events.find((e) => e.type === "MARRIAGE" && e.dateYear !== null))
    .map((e) => (e ? yearRangeOf(e) : null))
    .filter((r): r is YearRange => Boolean(r));
}

/** Województwo do wyszukiwania: z miejsc osoby, a gdy brak – z miejsc najbliższej rodziny. */
function regionFor(ctx: Ctx, ...persons: (SnapshotPerson | undefined)[]): GenetekaRegion | null {
  const places = (p: SnapshotPerson | undefined) =>
    (p?.events ?? []).flatMap((e) => (e.place ? [[e.place.name, e.place.parish, e.place.jurisdiction, e.place.province].join(" , ")] : []));
  for (const p of persons) {
    for (const text of places(p)) {
      const r = detectGenetekaRegion(text);
      if (r) return r;
    }
  }
  for (const p of persons) {
    if (!p) continue;
    const relatives = [...(ctx.parentsOf.get(p.id) ?? []), ...(ctx.childrenOf.get(p.id) ?? [])].map((id) => ctx.byId.get(id));
    for (const r of relatives) {
      for (const text of places(r)) {
        const code = detectGenetekaRegion(text);
        if (code) return code;
      }
    }
  }
  return null;
}

/** Pierwsza znana parafia lub miejscowość osoby (albo jej rodziny). */
function placeHintFor(ctx: Ctx, ...persons: (SnapshotPerson | undefined)[]): string | null {
  const all = [...persons, ...persons.flatMap((p) => (p ? (ctx.parentsOf.get(p.id) ?? []).map((id) => ctx.byId.get(id)) : []))];
  for (const p of all) {
    const e = p?.events.find((x) => x.place);
    if (e?.place) return e.place.parish ?? e.place.name;
  }
  return null;
}

function firstGiven(p: SnapshotPerson) {
  return primaryName(p.names)?.givenNames.split(/\s+/)[0] ?? "";
}
function birthSurname(p: SnapshotPerson) {
  const n = primaryName(p.names);
  return n?.birthSurname ?? n?.surname ?? "";
}
function currentSurname(p: SnapshotPerson) {
  return primaryName(p.names)?.surname ?? "";
}

function hasSource(ctx: Ctx, personId: string, types: string[]) {
  const s = ctx.confirmed.get(personId);
  return Boolean(s && types.some((t) => s.has(t)));
}

function search(label: string, query: GenetekaQuery): TaskSearch {
  return { label, query, url: buildGenetekaUrl(query) };
}

function yearsText(r: YearRange) {
  return r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
}

/** Nie szukamy w latach, z których akty nie są jeszcze w indeksach. */
function capYears(r: YearRange, ctx: Ctx, kind: keyof typeof RECORDS_AVAILABLE_UNTIL): YearRange | null {
  const limit = ctx.currentYear - RECORDS_AVAILABLE_UNTIL[kind];
  if (r.min > limit) return null;
  return { min: r.min, max: Math.min(r.max, limit) };
}

/** Propozycje dla jednej osoby. */
function suggestForPerson(ctx: Ctx, p: SnapshotPerson): Suggestion[] {
  if (ctx.living.get(p.id)) return [];
  const out: Suggestion[] = [];
  const name = displayName(p.names);
  const given = firstGiven(p);
  const bSurname = birthSurname(p);
  if (!given || !bSurname) return [];

  const parents = (ctx.parentsOf.get(p.id) ?? []).map((id) => ctx.byId.get(id)).filter((x): x is SnapshotPerson => Boolean(x));
  const father = parents.find((x) => x.sex === "MALE");
  const mother = parents.find((x) => x.sex === "FEMALE");
  const birth = estimateBirth(ctx, p);

  // ── 1. Akt urodzenia / chrztu ──
  if (birth && !hasSource(ctx, p.id, ["BIRTH", "BAPTISM"])) {
    const years = capYears(clampSpan(birth.estimated ? birth.range : widen(birth.range, 2)), ctx, "B");
    if (years) {
      const region = regionFor(ctx, p, father, mother);
      out.push({
        key: `FIND_BIRTH:${p.id}`,
        kind: "FIND_BIRTH",
        personId: p.id,
        title: `Znajdź akt urodzenia lub chrztu: ${name}`,
        why:
          (birth.estimated
            ? `Data urodzenia nie jest znana – szacujemy ${yearsText(years)} na podstawie dat rodziny. `
            : `Data urodzenia z drzewa: ${yearsText(birth.range)} (szukamy ±2 lata). `) +
          (parents.length < 2
            ? "Akt poda imiona rodziców i nazwisko rodowe matki – to klucz do kolejnego pokolenia."
            : "Akt potwierdzi datę i rodziców."),
        years,
        region,
        placeHint: placeHintFor(ctx, p, father, mother),
        searches: [search("Urodzenia i chrzty", { kind: "B", lastname: bSurname, name: given, fromYear: years.min, toYear: years.max, region })],
      });
    }
  }

  // ── 2. Ślub rodziców: 0–15 lat przed urodzeniem dziecka ──
  if (father && mother && birth) {
    const parentsUnion = ctx.tree.unions.find(
      (u) => [u.partner1Id, u.partner2Id].includes(father.id) && [u.partner1Id, u.partner2Id].includes(mother.id),
    );
    const known = parentsUnion?.events.some((e) => e.type === "MARRIAGE" && e.dateYear !== null);
    if (!known && !hasSource(ctx, father.id, ["MARRIAGE"])) {
      // Najwcześniej urodzone wspólne dziecko wyznacza górną granicę.
      const siblingsBirths = (ctx.childrenOf.get(father.id) ?? [])
        .filter((c) => (ctx.childrenOf.get(mother.id) ?? []).includes(c))
        .map((c) => ctx.byId.get(c))
        .map((c) => (c ? estimateBirth(ctx, c) : null))
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      const firstChild = Math.min(birth.range.max, ...siblingsBirths.map((b) => b.range.max));
      const years = capYears({ min: firstChild - 15, max: firstChild }, ctx, "S");
      const fGiven = firstGiven(father);
      const fSurname = currentSurname(father) || bSurname;
      const mGiven = firstGiven(mother);
      const mMaiden = birthSurname(mother);
      if (years && fSurname) {
        const region = regionFor(ctx, father, mother, p);
        const searches = [
          search("Ślub pary (oba imiona i nazwiska)", {
            kind: "S",
            lastname: fSurname,
            name: fGiven,
            lastname2: mMaiden,
            name2: mGiven,
            pair: Boolean(mMaiden || mGiven),
            fromYear: years.min,
            toYear: years.max,
            region,
          }),
        ];
        if (mMaiden) {
          searches.push(
            search("Tylko nazwiska (gdy imiona zapisano inaczej)", {
              kind: "S",
              lastname: fSurname,
              lastname2: mMaiden,
              pair: true,
              fromYear: years.min,
              toYear: years.max,
              region,
            }),
          );
        }
        out.push({
          key: `FIND_MARRIAGE:${[father.id, mother.id].sort().join("+")}`,
          kind: "FIND_MARRIAGE",
          personId: p.id,
          title: `Znajdź akt ślubu rodziców: ${displayName(father.names)} i ${displayName(mother.names)}`,
          why: `Ślub odbywał się zwykle 0–15 lat przed urodzeniem pierwszego dziecka (tu: ${firstChild}). Akt ślubu poda wiek i rodziców obojga – kolejne pokolenie.`,
          years,
          region,
          placeHint: placeHintFor(ctx, father, mother, p),
          searches,
        });
      }
    }
  }

  // ── 3. Rodzeństwo ──
  if (father && birth) {
    const fSurname = currentSurname(father) || bSurname;
    const motherBirth = mother ? estimateBirth(ctx, mother) : null;
    const from = Math.max(birth.range.min - 20, motherBirth ? motherBirth.range.min + 16 : -Infinity);
    const to = Math.min(birth.range.max + 20, motherBirth ? motherBirth.range.max + 46 : Infinity);
    const years = capYears(clampSpan({ min: from, max: Math.max(from, to) }), ctx, "B");
    if (years && fSurname) {
      const region = regionFor(ctx, p, father, mother);
      const parentsText = [firstGiven(father), mother ? `${firstGiven(mother)} z d. ${birthSurname(mother)}` : null].filter(Boolean).join(" i ");
      out.push({
        key: `FIND_SIBLINGS:${father.id}`,
        kind: "FIND_SIBLINGS",
        personId: p.id,
        title: `Poszukaj rodzeństwa: dzieci ${parentsText}`,
        why: `Szukaj aktów urodzenia z nazwiskiem ${fSurname} w latach ${yearsText(years)}, w których rodzice to ${parentsText}. Geneteka przeszukuje całe województwo – także sąsiednie parafie.`,
        years,
        region,
        placeHint: placeHintFor(ctx, p, father, mother),
        searches: [search("Urodzenia z tym nazwiskiem", { kind: "B", lastname: fSurname, fromYear: years.min, toYear: years.max, region })],
      });
    }
  }

  // ── 4. Własny ślub (gdy jest małżonek, ale brak daty ślubu) ──
  for (const u of unionsOf(ctx, p.id)) {
    if (u.events.some((e) => e.type === "MARRIAGE" && e.dateYear !== null)) continue;
    const spouse = ctx.byId.get(u.partner1Id === p.id ? u.partner2Id : u.partner1Id);
    if (!spouse || p.sex !== "MALE" || !birth) continue; // jedno zadanie na parę – przy mężu
    const kids = (ctx.childrenOf.get(p.id) ?? []).filter((c) => (ctx.childrenOf.get(spouse.id) ?? []).includes(c));
    const kidBirths = kids.map((c) => ctx.byId.get(c)).map((c) => (c ? estimateBirth(ctx, c) : null)).filter((x): x is NonNullable<typeof x> => Boolean(x));
    // Ślub rodziców tej osoby dzieci liczy zadanie z pkt 2 przy dziecku – tu tylko bez dzieci w drzewie.
    if (kidBirths.length) continue;
    const years = capYears(clampSpan({ min: birth.range.min + 16, max: birth.range.max + 40 }), ctx, "S");
    if (!years) continue;
    const region = regionFor(ctx, p, spouse);
    out.push({
      key: `FIND_MARRIAGE:${[p.id, spouse.id].sort().join("+")}`,
      kind: "FIND_MARRIAGE",
      personId: p.id,
      title: `Znajdź akt ślubu: ${name} i ${displayName(spouse.names)}`,
      why: `Mężczyźni żenili się zwykle między 16. a 40. rokiem życia. Akt ślubu poda wiek i rodziców obojga.`,
      years,
      region,
      placeHint: placeHintFor(ctx, p, spouse),
      searches: [
        search("Ślub pary", {
          kind: "S",
          lastname: currentSurname(p) || bSurname,
          name: given,
          lastname2: birthSurname(spouse),
          name2: firstGiven(spouse),
          pair: true,
          fromYear: years.min,
          toYear: years.max,
          region,
        }),
      ],
    });
  }

  // ── 5. Akt zgonu ──
  const death = firstYearRange(p.events, ["DEATH", "BURIAL"]);
  if (!hasSource(ctx, p.id, ["DEATH", "BURIAL"]) && (death || birth)) {
    const lastKnown = Math.max(
      birth?.range.min ?? -Infinity,
      ...p.events.filter((e) => e.dateYear !== null).map((e) => e.dateEndYear ?? e.dateYear!),
      ...(ctx.childrenOf.get(p.id) ?? []).map((c) => ctx.byId.get(c)).map((c) => (c ? (firstYearRange(c.events, ["BIRTH", "BAPTISM"])?.min ?? -Infinity) : -Infinity)),
    );
    const range = death ? widen(death, 1) : { min: lastKnown, max: (birth?.range.max ?? lastKnown) + 100 };
    const years = capYears(clampSpan(range), ctx, "D");
    if (years) {
      const surname = currentSurname(p) || bSurname;
      const region = regionFor(ctx, p);
      const searches = [search("Zgony", { kind: "D", lastname: surname, name: given, fromYear: years.min, toYear: years.max, region })];
      if (p.sex === "FEMALE" && bSurname && bSurname !== surname) {
        searches.push(search("Zgony pod nazwiskiem rodowym", { kind: "D", lastname: bSurname, name: given, fromYear: years.min, toYear: years.max, region }));
      }
      out.push({
        key: `FIND_DEATH:${p.id}`,
        kind: "FIND_DEATH",
        personId: p.id,
        title: `Znajdź akt zgonu: ${name}`,
        why: death
          ? `Data zgonu z drzewa: ${yearsText(death)} – akt potwierdzi ją i często poda wiek, małżonka i rodziców.`
          : `Data zgonu nie jest znana – szukamy od ostatniej znanej daty (${years.min}). Akt zgonu podaje zwykle wiek, a więc przybliżony rok urodzenia.` +
            (p.sex === "FEMALE" ? " Kobiety zapisywano zwykle pod nazwiskiem po mężu." : ""),
        years,
        region,
        placeHint: placeHintFor(ctx, p),
        searches,
      });
    }
  }

  return out;
}

export type GenerationGroup = { generation: number; label: string; suggestions: Suggestion[] };

export function generationLabel(n: number) {
  return ["Osoba startowa", "Rodzice", "Dziadkowie", "Pradziadkowie", "Prapradziadkowie"][n] ?? `${n}. pokolenie wstecz`;
}

/** Propozycje dla jednej osoby (karta osoby). */
export function suggestTasks(tree: TreeSnapshot, personId: string, confirmed: ConfirmedSources = new Map(), now = new Date()): Suggestion[] {
  const ctx = makeCtx(tree, confirmed, now);
  const p = ctx.byId.get(personId);
  return p ? suggestForPerson(ctx, p) : [];
}

/**
 * Propozycje dla drzewa – pokolenie po pokoleniu w górę od osoby startowej
 * (najpierw rodzice, potem dziadkowie…). Osoby spoza linii przodków na końcu.
 */
export function suggestByGeneration(
  tree: TreeSnapshot,
  homePersonId: string | null,
  confirmed: ConfirmedSources = new Map(),
  now = new Date(),
): GenerationGroup[] {
  const ctx = makeCtx(tree, confirmed, now);
  const generation = new Map<string, number>();
  const start = homePersonId && ctx.byId.has(homePersonId) ? homePersonId : tree.persons[0]?.id;
  if (start) {
    let frontier = [start];
    generation.set(start, 0);
    for (let g = 1; frontier.length; g++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const parent of ctx.parentsOf.get(id) ?? []) {
          if (generation.has(parent)) continue;
          generation.set(parent, g);
          next.push(parent);
        }
      }
      frontier = next;
    }
  }

  const groups = new Map<number, Suggestion[]>();
  const seen = new Set<string>();
  const ordered = [...tree.persons].sort((a, b) => (generation.get(a.id) ?? 999) - (generation.get(b.id) ?? 999));
  for (const p of ordered) {
    const g = generation.get(p.id) ?? -1;
    for (const s of suggestForPerson(ctx, p)) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      groups.set(g, [...(groups.get(g) ?? []), s]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === -1 ? 1 : b === -1 ? -1 : a - b))
    .map(([g, suggestions]) => ({ generation: g, label: g === -1 ? "Pozostałe osoby" : generationLabel(g), suggestions }));
}
