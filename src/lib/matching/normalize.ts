// Normalizacja imion i nazwisk do porównań.
// Oryginalny zapis zawsze przechowujemy osobno – tu powstają tylko „klucze”.

import { GIVEN_NAMES, type NameSex } from "./data/given-names";

// ───────────────────────────── Podstawy ─────────────────────────────

/** Małe litery, bez polskich znaków i akcentów: „Łódź” → „lodz”. */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("pl")
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Transliteracja rosyjskiej cyrylicy na polski alfabet (tak, jak polscy
// genealodzy czytają metryki z zaboru rosyjskiego): Иоанн → Ioann,
// Ковальский → Kowalskij, Ядвига → Jadwiga, Щепан → Szczepan.
const CYR: Record<string, string> = {
  а: "a", б: "b", в: "w", г: "g", д: "d", е: "e", ё: "io", ж: "ż", з: "z", и: "i", і: "i", й: "j",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "ch", ц: "c", ч: "cz", ш: "sz", щ: "szcz", ъ: "", ы: "y", ь: "", э: "e", ю: "iu", я: "ia",
  ѣ: "e", ѳ: "f", ѵ: "i", є: "je", ї: "ji", ґ: "g",
};
const CYR_VOWELS = new Set("аеёиіоуыэюяєї");
const CYR_IOTATED: Record<string, string> = { е: "je", ё: "jo", ю: "ju", я: "ja" };

export function hasCyrillic(s: string) {
  return /[Ѐ-ӿ]/.test(s);
}

export function transliterateCyrillic(s: string): string {
  let out = "";
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    if (!(lower in CYR)) {
      out += ch;
      continue;
    }
    const prev = chars[i - 1]?.toLowerCase();
    // Na początku wyrazu i po samogłosce „я” to „ja”, a po spółgłosce „ia”.
    const atWordStart = !prev || !/[Ѐ-ӿ]/.test(prev);
    const afterVowel = prev ? CYR_VOWELS.has(prev) || prev === "ь" || prev === "ъ" : false;
    let t = (atWordStart || afterVowel) && CYR_IOTATED[lower] ? CYR_IOTATED[lower] : CYR[lower];
    if (lower === "е" && !atWordStart && !afterVowel) t = "e";
    out += ch !== lower && t ? t[0].toUpperCase() + t.slice(1) : t;
  }
  return out;
}

/** Łaciński zapis bez różnic w pisowni: j/i, y/i, w/v, ae/e, th/t, ph/f, podwójne litery. */
function spellingKey(s: string): string {
  return fold(hasCyrillic(s) ? transliterateCyrillic(s) : s)
    .replace(/ae|oe/g, "e")
    .replace(/th/g, "t")
    .replace(/ph/g, "f")
    .replace(/[jy]/g, "i")
    .replace(/w/g, "v")
    .replace(/(.)\1+/g, "$1")
    .replace(/[\s-]/g, "");
}

// ───────────────────────────── Imiona ─────────────────────────────

/** Formy dopełniacza łacińskiego: „syn Adalberta” w metryce to „filius Adalberti”. */
export function latinGenitives(nominative: string): string[] {
  const n = nominative;
  const out: string[] = [];
  if (/us$/.test(n)) out.push(n.replace(/us$/, "i"));
  else if (/es$/.test(n)) out.push(n.replace(/es$/, "is"));
  else if (/as$/.test(n)) out.push(n.replace(/as$/, "ae"));
  else if (/a$/.test(n)) out.push(`${n}e`);
  else if (/x$/.test(n)) out.push(n.replace(/x$/, "cis"));
  else if (/o$/.test(n)) out.push(`${n}nis`);
  else if (/er$/.test(n)) out.push(n.replace(/er$/, "ri"), `${n}is`);
  else if (/[^aeiou]$/.test(n)) out.push(`${n}is`, `${n}i`);
  return out;
}

/**
 * Polskie formy dopełniacza → możliwe mianowniki („syn Wojciecha i Jadwigi”).
 * Zwraca kandydatów; o tym, który jest imieniem, decyduje słownik.
 */
export function polishNominativeCandidates(word: string): string[] {
  const w = word.toLocaleLowerCase("pl");
  const c: string[] = [];
  const rep = (re: RegExp, to: string) => {
    if (re.test(w)) c.push(w.replace(re, to));
  };
  rep(/ego$/, "y"); // Jerzego → Jerzy, Ignacego → Ignacy
  rep(/ego$/, ""); // Antoniego → Antoni
  rep(/ńca$/, "niec"); // Wawrzyńca → Wawrzyniec
  rep(/ka$/, "ek"); // Marka → Marek, Franciszka → Franciszek
  rep(/ła$/, "eł"); // Pawła → Paweł
  rep(/a$/, ""); // Wojciecha → Wojciech, Jana → Jan, Mikołaja → Mikołaj
  rep(/ii$/, "ia"); // Marii → Maria, Zofii → Zofia
  rep(/ji$/, "ja"); // Łucji → Łucja
  rep(/i$/, "a"); // Jadwigi → Jadwiga, Agnieszki → Agnieszka, Anieli → Aniela
  rep(/y$/, "a"); // Marianny → Marianna, Ewy → Ewa
  return c;
}

/** genitive = klucz pochodzi z łacińskiego dopełniacza („Adalberti”), nie z mianownika. */
type CanonicalInfo = { name: string; sex: NameSex; genitive: boolean };

/** Indeks: klucz pisowni → imiona polskie. Budowany raz przy pierwszym użyciu. */
let INDEX: Map<string, CanonicalInfo[]> | null = null;
function index() {
  if (INDEX) return INDEX;
  INDEX = new Map();
  const add = (form: string, info: CanonicalInfo) => {
    const key = spellingKey(form);
    if (!key) return;
    const list = INDEX!.get(key) ?? [];
    const existing = list.find((x) => x.name === info.name);
    if (!existing) list.push(info);
    else if (!info.genitive) existing.genitive = false;
    INDEX!.set(key, list);
  };
  for (const [polish, sex, variants] of GIVEN_NAMES) {
    add(polish, { name: polish, sex, genitive: false });
    for (const v of variants.split("|")) {
      add(v, { name: polish, sex, genitive: false });
      if (!hasCyrillic(v)) for (const g of latinGenitives(v)) add(g, { name: polish, sex, genitive: true });
    }
  }
  return INDEX;
}

export type GivenNameToken = {
  original: string;
  /** Polskie odpowiedniki (pusta lista, gdy imienia nie ma w słowniku). */
  canonical: string[];
};

/** Rozpoznaje imiona: „Joannes” → Jan, „Иоанн” → Jan, „Wojciecha” → Wojciech. */
export function canonicalGivenNames(input: string | null | undefined, sexHint?: "MALE" | "FEMALE" | "UNKNOWN"): GivenNameToken[] {
  if (!input) return [];
  const idx = index();
  const want: NameSex | null = sexHint === "MALE" ? "M" : sexHint === "FEMALE" ? "F" : null;
  return input
    .split(/[\s,-]+/)
    .filter((t) => t.length > 1)
    .map((original) => {
      const direct = idx.get(spellingKey(original)) ?? [];
      const nominative = direct.filter((f) => !f.genitive);
      let found = nominative;
      // Polska forma dopełniacza – szukamy, gdy słowo nie jest mianownikiem żadnego
      // imienia albo gdy znalezione imię ma „złą” płeć (np. „syn Józefa”).
      if (nominative.length === 0 || (want && !nominative.some((f) => f.sex === want))) {
        const polish = polishNominativeCandidates(original)
          .flatMap((c) => idx.get(spellingKey(c)) ?? [])
          .filter((f) => !f.genitive);
        found = [...nominative, ...direct.filter((f) => f.genitive), ...polish];
      }
      if (want && found.some((f) => f.sex === want)) found = found.filter((f) => f.sex === want);
      return { original, canonical: [...new Set(found.map((f) => f.name))] };
    });
}

/** Klucz porównawczy dla imienia spoza słownika. */
export function givenNameKey(token: string) {
  return spellingKey(token);
}

// ───────────────────────────── Nazwiska ─────────────────────────────

const SURNAME_PREFIXES =
  /^(z domu|z d\.?|zd\.?|de domo|ex|de|z|von|geb\.?|geborene|урожд\.?|урожденная|урождённая)\s+/i;

/** Zwraca możliwe formy podstawowe nazwiska: „Kowalska” → {kowalska, kowalski}. */
export function surnameKeys(input: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  if (!input) return keys;
  let s = input.trim().replace(/[()]/g, " ");
  while (SURNAME_PREFIXES.test(s)) s = s.replace(SURNAME_PREFIXES, "");
  const latin = fold(hasCyrillic(s) ? transliterateCyrillic(s) : s).replace(/v/g, "w");
  if (!latin) return keys;

  const parts = latin.split(/[\s-]+/).filter(Boolean);
  const candidates = parts.length > 1 ? [...parts, parts.join("")] : parts;

  for (const p of candidates) {
    keys.add(p);
    const rules: [RegExp, string][] = [
      // Rosyjskie końcówki: Ковальский → kowalskij → kowalski
      [/skij$|skiy$|skii$|sky$/, "ski"],
      [/ckij$|ckiy$|ckii$|cky$/, "cki"],
      [/dzkij$|zkij$/, "dzki"],
      [/skaja$|skaia$|skaya$/, "ska"],
      [/ckaja$|ckaia$|ckaya$/, "cka"],
      // „z Kowalskich”, „z Nowaków”
      [/skich$/, "ski"],
      [/ckich$/, "cki"],
      [/dzkich$/, "dzki"],
      [/ow$/, ""],
      // Formy żeńskie
      [/ska$/, "ski"],
      [/cka$/, "cki"],
      [/dzka$/, "dzki"],
      [/owa$/, ""], // Nowakowa (żona Nowaka)
      [/ewa$/, ""],
      [/owna$/, ""], // Nowakówna (córka Nowaka)
      [/ewna$/, ""],
      [/ianka$/, "a"], // Wronianka (córka Wrony)
      [/anka$/, "a"],
      [/ina$/, "a"], // Wronina (żona Wrony)
      [/yna$/, "a"],
      [/na$/, "ny"], // Czarna → Czarny
      [/la$/, "ly"], // Biała → Biały
    ];
    const derive = (word: string) => {
      for (const [re, to] of rules) {
        if (re.test(word)) {
          const base = word.replace(re, to);
          if (base.length >= 3 && base !== word) keys.add(base);
        }
      }
    };
    derive(p);
    // Druga runda: „Kowalskaja” → kowalska → kowalski
    for (const k of [...keys]) derive(k);
  }
  return keys;
}

export function sharesKey(a: Set<string>, b: Set<string>) {
  for (const x of a) if (b.has(x)) return true;
  return false;
}
