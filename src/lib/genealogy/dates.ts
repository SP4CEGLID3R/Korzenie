// Daty genealogiczne: często znamy tylko rok, rok i miesiąc albo przybliżenie
// („ok. 1850”, „przed 1863”, „1850–1855”). Ten moduł:
//  • rozumie daty wpisywane po polsku w formularzach,
//  • wyświetla je po polsku,
//  • czyta i zapisuje daty w formacie GEDCOM 5.5.1,
//  • wylicza przedziały możliwych dni (do sprawdzania spójności).

export type DateQualifier = "EXACT" | "ABOUT" | "BEFORE" | "AFTER" | "BETWEEN";

/** Pola daty dokładnie jak w tabeli Event. */
export type GenDate = {
  dateQualifier: DateQualifier | null;
  dateYear: number | null;
  dateMonth: number | null;
  dateDay: number | null;
  dateEndYear: number | null;
  dateEndMonth: number | null;
  dateEndDay: number | null;
  /** Oryginalny zapis, gdy nie udało się go zrozumieć (albo z GEDCOM). */
  dateText: string | null;
};

export const EMPTY_DATE: GenDate = {
  dateQualifier: null,
  dateYear: null,
  dateMonth: null,
  dateDay: null,
  dateEndYear: null,
  dateEndMonth: null,
  dateEndDay: null,
  dateText: null,
};

type Ymd = { year: number; month: number | null; day: number | null };

const MIN_YEAR = 1000;
const MAX_YEAR = 2100;

// ───────────────────────────── Nazwy miesięcy ─────────────────────────────

const MONTHS_GENITIVE = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];
const MONTHS_NOMINATIVE = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const GEDCOM_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Słowo → numer miesiąca. Polskie (wszystkie przypadki, z ogonkami i bez), łacińskie, rzymskie, GEDCOM. */
const MONTH_WORDS: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  const add = (word: string, month: number) => {
    map[word] = month;
    map[stripDiacritics(word)] = month;
  };
  MONTHS_GENITIVE.forEach((w, i) => add(w, i + 1));
  MONTHS_NOMINATIVE.forEach((w, i) => add(w, i + 1));
  ROMAN.forEach((w, i) => add(w.toLowerCase(), i + 1));
  GEDCOM_MONTHS.forEach((w, i) => add(w.toLowerCase(), i + 1));
  // Skróty polskie i formy łacińskie spotykane w metrykach.
  const extra: [string, number][] = [
    ["sty", 1], ["lut", 2], ["mar", 3], ["kwi", 4], ["cze", 6], ["lip", 7],
    ["sie", 8], ["wrz", 9], ["paź", 10], ["lis", 11], ["gru", 12],
    ["januarii", 1], ["februarii", 2], ["martii", 3], ["aprilis", 4], ["maii", 5],
    ["junii", 6], ["julii", 7], ["augusti", 8], ["septembris", 9], ["octobris", 10],
    ["novembris", 11], ["decembris", 12],
  ];
  extra.forEach(([w, m]) => add(w, m));
  return map;
})();

function stripDiacritics(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
}

// ───────────────────────────── Walidacja ─────────────────────────────

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isValidYmd({ year, month, day }: Ymd) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return false;
  if (month === null) return day === null;
  if (month < 1 || month > 12) return false;
  if (day === null) return true;
  return day >= 1 && day <= daysInMonth(year, month);
}

function compareYmd(a: Ymd, b: Ymd) {
  return (
    a.year - b.year ||
    (a.month ?? 1) - (b.month ?? 1) ||
    (a.day ?? 1) - (b.day ?? 1)
  );
}

// ───────────────────────── Wpisywanie dat po polsku ─────────────────────────

export type ParseResult = { ok: true; date: GenDate } | { ok: false; error: string };

export const DATE_INPUT_HINT =
  "Np. 1850, 12.03.1850, 12 marca 1850, III 1850, ok. 1850, przed 1863, po 1900, 1850–1855.";

/** Pojedyncza data bez określeń: „1850”, „03.1850”, „12.03.1850”, „12 marca 1850”, „1850-03-12”. */
function parseSimple(raw: string): Ymd | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*r\.?$/, "");
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{4})$/))) return { year: +m[1], month: null, day: null };
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return { year: +m[1], month: +m[2], day: +m[3] };
  if ((m = s.match(/^(\d{4})-(\d{1,2})$/))) return { year: +m[1], month: +m[2], day: null };
  if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) return { year: +m[3], month: +m[2], day: +m[1] };
  if ((m = s.match(/^(\d{1,2})[./](\d{4})$/))) return { year: +m[2], month: +m[1], day: null };

  // „12 marca 1850”, „12 III 1850”, „marzec 1850”, „III.1850”
  if ((m = s.match(/^(?:(\d{1,2})(?:\.\s*|\s+))?([\p{L}]+)(?:\.\s*|\s+)(\d{4})$/u))) {
    const month = MONTH_WORDS[m[2]] ?? MONTH_WORDS[stripDiacritics(m[2])];
    if (!month) return null;
    return { year: +m[3], month, day: m[1] ? +m[1] : null };
  }
  return null;
}

function toGenDate(qualifier: DateQualifier, start: Ymd, end?: Ymd): GenDate {
  return {
    dateQualifier: qualifier,
    dateYear: start.year,
    dateMonth: start.month,
    dateDay: start.day,
    dateEndYear: end?.year ?? null,
    dateEndMonth: end?.month ?? null,
    dateEndDay: end?.day ?? null,
    dateText: null,
  };
}

/**
 * Zamienia tekst wpisany przez użytkownika na datę genealogiczną.
 * Pusty tekst to brak daty (ok: true, wszystkie pola null).
 */
export function parsePolishDate(input: string): ParseResult {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return { ok: true, date: EMPTY_DATE };

  const fail = (): ParseResult => ({
    ok: false,
    error: `Nie rozumiem daty „${text}”. ${DATE_INPUT_HINT}`,
  });
  const lower = text.toLowerCase();
  let m: RegExpMatchArray | null;

  const single = (q: DateQualifier, rest: string): ParseResult => {
    const ymd = parseSimple(rest);
    if (!ymd || !isValidYmd(ymd)) return fail();
    return { ok: true, date: toGenDate(q, ymd) };
  };

  // Zakres: „między 1850 a 1855”, „od 1850 do 1855”, „1850–1855”, „1850-1855”
  if (
    (m = lower.match(/^(?:między|miedzy)\s+(.+?)\s+(?:a|i)\s+(.+)$/)) ||
    (m = lower.match(/^od\s+(.+?)\s+do\s+(.+)$/)) ||
    (m = lower.match(/^(.+?)\s*[–—]\s*(.+)$/)) ||
    (m = lower.match(/^(\d{4})\s*-\s*(\d{4})$/))
  ) {
    const start = parseSimple(m[1]);
    const end = parseSimple(m[2]);
    if (!start || !end || !isValidYmd(start) || !isValidYmd(end)) return fail();
    if (compareYmd(start, end) > 0) {
      return { ok: false, error: "Początek zakresu dat jest późniejszy niż jego koniec." };
    }
    return { ok: true, date: toGenDate("BETWEEN", start, end) };
  }

  if ((m = lower.match(/^(?:około|okolo|ok\.?|circa|ca\.?|~)\s*(.+)$/))) return single("ABOUT", m[1]);
  if ((m = lower.match(/^(?:przed|<)\s*(.+)$/))) return single("BEFORE", m[1]);
  if ((m = lower.match(/^(?:po|>)\s*(.+)$/))) return single("AFTER", m[1]);

  return single("EXACT", lower);
}

// ───────────────────────────── Wyświetlanie ─────────────────────────────

function formatYmd({ year, month, day }: Ymd, style: "genitive" | "nominative" = "genitive") {
  if (month === null) return String(year);
  if (day === null) return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
  return `${day} ${(style === "genitive" ? MONTHS_GENITIVE : MONTHS_NOMINATIVE)[month - 1]} ${year}`;
}

function startOf(d: GenDate): Ymd | null {
  return d.dateYear === null ? null : { year: d.dateYear, month: d.dateMonth, day: d.dateDay };
}

function endOf(d: GenDate): Ymd | null {
  return d.dateEndYear === null
    ? null
    : { year: d.dateEndYear, month: d.dateEndMonth, day: d.dateEndDay };
}

/** Data do wyświetlenia, np. „12 marca 1850”, „ok. 1850”, „1850–1855”. Pusty tekst, gdy brak daty. */
export function formatGenDate(d: GenDate): string {
  const start = startOf(d);
  if (!start) return d.dateText ?? "";
  const s = formatYmd(start);
  switch (d.dateQualifier ?? "EXACT") {
    case "EXACT":
      return s;
    case "ABOUT":
      return `ok. ${s}`;
    case "BEFORE":
      return `przed ${s}`;
    case "AFTER":
      return `po ${s}`;
    case "BETWEEN": {
      const end = endOf(d);
      return end ? `${s}–${formatYmd(end)}` : s;
    }
  }
}

/** Zapis daty, który parsePolishDate zrozumie z powrotem (do wypełniania formularzy). */
export function formatGenDateForInput(d: GenDate): string {
  const start = startOf(d);
  if (!start) return d.dateText ?? "";
  const num = ({ year, month, day }: Ymd) =>
    month === null
      ? String(year)
      : day === null
        ? `${String(month).padStart(2, "0")}.${year}`
        : `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
  const s = num(start);
  switch (d.dateQualifier ?? "EXACT") {
    case "EXACT":
      return s;
    case "ABOUT":
      return `ok. ${s}`;
    case "BEFORE":
      return `przed ${s}`;
    case "AFTER":
      return `po ${s}`;
    case "BETWEEN": {
      const end = endOf(d);
      return end ? `${s}–${num(end)}` : s;
    }
  }
}

/** Sam rok do krótkich opisów („1850–1910”), z „ok.”, gdy data przybliżona. */
export function formatYearShort(d: GenDate): string {
  if (d.dateYear === null) return "";
  switch (d.dateQualifier ?? "EXACT") {
    case "ABOUT":
      return `ok. ${d.dateYear}`;
    case "BEFORE":
      return `przed ${d.dateYear}`;
    case "AFTER":
      return `po ${d.dateYear}`;
    case "BETWEEN":
      return d.dateEndYear && d.dateEndYear !== d.dateYear ? `${d.dateYear}–${d.dateEndYear}` : String(d.dateYear);
    default:
      return String(d.dateYear);
  }
}

/** Klucz sortowania RRRRMMDD (brakujące części = 00). */
export function dateSortKey(d: GenDate): number | null {
  if (d.dateYear === null) return null;
  return d.dateYear * 10000 + (d.dateMonth ?? 0) * 100 + (d.dateDay ?? 0);
}

// ─────────────────────── Przedziały (do sprawdzania spójności) ───────────────────────

/** Numer dnia (dni od 1970-01-01) – wygodny do porównań. */
function dayNumber(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function earliestDay({ year, month, day }: Ymd) {
  return dayNumber(year, month ?? 1, day ?? 1);
}

function latestDay({ year, month, day }: Ymd) {
  const m = month ?? 12;
  return dayNumber(year, m, day ?? daysInMonth(year, m));
}

/** Margines dla dat przybliżonych („ok.”) – 2 lata w obie strony. */
const ABOUT_MARGIN_DAYS = 2 * 366;

export type DayRange = { min: number; max: number };

/**
 * Przedział dni, w którym mogło nastąpić wydarzenie.
 * „1850” → cały rok 1850; „przed 1863” → od −∞ do końca 1863; brak daty → null.
 */
export function dateRange(d: GenDate): DayRange | null {
  const start = startOf(d);
  if (!start) return null;
  switch (d.dateQualifier ?? "EXACT") {
    case "EXACT":
      return { min: earliestDay(start), max: latestDay(start) };
    case "ABOUT":
      return { min: earliestDay(start) - ABOUT_MARGIN_DAYS, max: latestDay(start) + ABOUT_MARGIN_DAYS };
    case "BEFORE":
      return { min: -Infinity, max: latestDay(start) };
    case "AFTER":
      return { min: earliestDay(start), max: Infinity };
    case "BETWEEN": {
      const end = endOf(d) ?? start;
      return { min: earliestDay(start), max: latestDay(end) };
    }
  }
}

export const DAYS_PER_YEAR = 365.2425;

/** Dzisiejszy numer dnia (do testów można podać własny). */
export function todayDayNumber(now: Date = new Date()) {
  return dayNumber(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

// ───────────────────────────── GEDCOM ─────────────────────────────

function parseGedcomSimple(raw: string): Ymd | null {
  // Kalendarz juliański/gregoriański w GEDCOM: „@#DGREGORIAN@ 12 MAR 1850”.
  const s = raw.replace(/@#D[A-Z ]+@/g, "").trim().toUpperCase();
  let m: RegExpMatchArray | null;
  // Podwójny rok (np. 1750/51) – bierzemy pierwszy.
  if ((m = s.match(/^(\d{3,4})(?:\/\d{1,2})?$/))) return { year: +m[1], month: null, day: null };
  if ((m = s.match(/^([A-Z]{3})\s+(\d{3,4})(?:\/\d{1,2})?$/))) {
    const month = GEDCOM_MONTHS.indexOf(m[1]) + 1;
    return month ? { year: +m[2], month, day: null } : null;
  }
  if ((m = s.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})(?:\/\d{1,2})?$/))) {
    const month = GEDCOM_MONTHS.indexOf(m[2]) + 1;
    return month ? { year: +m[3], month, day: +m[1] } : null;
  }
  return null;
}

/**
 * Czyta datę GEDCOM 5.5.1 („12 MAR 1850”, „ABT 1850”, „BEF 1863”, „BET 1850 AND 1855”…).
 * Gdy się nie da – zwraca datę bez pól liczbowych, z oryginalnym tekstem w dateText.
 */
export function parseGedcomDate(value: string | null | undefined): GenDate {
  const text = (value ?? "").trim();
  if (!text) return EMPTY_DATE;
  const upper = text.toUpperCase().replace(/\s+/g, " ");
  const asText: GenDate = { ...EMPTY_DATE, dateText: text };
  let m: RegExpMatchArray | null;

  const withQualifier = (q: DateQualifier, rest: string): GenDate => {
    const ymd = parseGedcomSimple(rest);
    return ymd && isValidYmd(ymd) ? { ...toGenDate(q, ymd), dateText: null } : asText;
  };

  if ((m = upper.match(/^(?:BET|FROM) (.+?) (?:AND|TO) (.+)$/))) {
    const start = parseGedcomSimple(m[1]);
    const end = parseGedcomSimple(m[2]);
    if (start && end && isValidYmd(start) && isValidYmd(end) && compareYmd(start, end) <= 0) {
      return toGenDate("BETWEEN", start, end);
    }
    return asText;
  }
  if ((m = upper.match(/^(?:ABT|EST|CAL) (.+)$/))) return withQualifier("ABOUT", m[1]);
  if ((m = upper.match(/^(?:BEF|TO) (.+)$/))) return withQualifier("BEFORE", m[1]);
  if ((m = upper.match(/^(?:AFT|FROM) (.+)$/))) return withQualifier("AFTER", m[1]);
  // „INT 1850 (około Wielkanocy)” – data zinterpretowana z opisem.
  if ((m = upper.match(/^INT (.+?) \(.*\)$/))) {
    const d = withQualifier("EXACT", m[1]);
    return d.dateYear === null ? asText : { ...d, dateText: text };
  }
  return withQualifier("EXACT", upper);
}

function gedcomYmd({ year, month, day }: Ymd) {
  if (month === null) return String(year);
  if (day === null) return `${GEDCOM_MONTHS[month - 1]} ${year}`;
  return `${day} ${GEDCOM_MONTHS[month - 1]} ${year}`;
}

/** Data w formacie GEDCOM 5.5.1 albo null, gdy brak daty. */
export function toGedcomDate(d: GenDate): string | null {
  const start = startOf(d);
  if (!start) {
    // Niezrozumiały zapis eksportujemy jako „frazę daty”: (tekst)
    return d.dateText ? `(${d.dateText.replace(/[()]/g, "")})` : null;
  }
  const s = gedcomYmd(start);
  switch (d.dateQualifier ?? "EXACT") {
    case "EXACT":
      return s;
    case "ABOUT":
      return `ABT ${s}`;
    case "BEFORE":
      return `BEF ${s}`;
    case "AFTER":
      return `AFT ${s}`;
    case "BETWEEN": {
      const end = endOf(d);
      return end ? `BET ${s} AND ${gedcomYmd(end)}` : s;
    }
  }
}
