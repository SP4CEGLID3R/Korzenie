import { describe, expect, it } from "vitest";
import {
  dateRange,
  dateSortKey,
  formatGenDate,
  formatGenDateForInput,
  parseGedcomDate,
  parsePolishDate,
  toGedcomDate,
  type GenDate,
} from "./dates";

function parsed(text: string): GenDate {
  const r = parsePolishDate(text);
  if (!r.ok) throw new Error(r.error);
  return r.date;
}

describe("parsePolishDate", () => {
  it.each([
    ["1850", { dateQualifier: "EXACT", dateYear: 1850, dateMonth: null, dateDay: null }],
    ["03.1850", { dateYear: 1850, dateMonth: 3, dateDay: null }],
    ["12.03.1850", { dateYear: 1850, dateMonth: 3, dateDay: 12 }],
    ["12/3/1850", { dateYear: 1850, dateMonth: 3, dateDay: 12 }],
    ["1850-03-12", { dateYear: 1850, dateMonth: 3, dateDay: 12 }],
    ["12 marca 1850", { dateYear: 1850, dateMonth: 3, dateDay: 12 }],
    ["12 marca 1850 r.", { dateYear: 1850, dateMonth: 3, dateDay: 12 }],
    ["marzec 1850", { dateYear: 1850, dateMonth: 3, dateDay: null }],
    ["12 III 1850", { dateYear: 1850, dateMonth: 3, dateDay: 12 }],
    ["III.1850", { dateYear: 1850, dateMonth: 3, dateDay: null }],
    ["5 października 1863", { dateYear: 1863, dateMonth: 10, dateDay: 5 }],
    ["5 pazdziernika 1863", { dateYear: 1863, dateMonth: 10, dateDay: 5 }],
    ["15 Augusti 1801", { dateYear: 1801, dateMonth: 8, dateDay: 15 }],
  ])("„%s”", (text, expected) => {
    expect(parsed(text)).toMatchObject(expected);
  });

  it("rozumie określenia przybliżone", () => {
    expect(parsed("ok. 1850")).toMatchObject({ dateQualifier: "ABOUT", dateYear: 1850 });
    expect(parsed("około 1850")).toMatchObject({ dateQualifier: "ABOUT", dateYear: 1850 });
    expect(parsed("~1850")).toMatchObject({ dateQualifier: "ABOUT", dateYear: 1850 });
    expect(parsed("przed 1863")).toMatchObject({ dateQualifier: "BEFORE", dateYear: 1863 });
    expect(parsed("po 3.1900")).toMatchObject({ dateQualifier: "AFTER", dateYear: 1900, dateMonth: 3 });
  });

  it("rozumie zakresy", () => {
    for (const t of ["1850–1855", "1850-1855", "między 1850 a 1855", "od 1850 do 1855"]) {
      expect(parsed(t)).toMatchObject({ dateQualifier: "BETWEEN", dateYear: 1850, dateEndYear: 1855 });
    }
  });

  it("pusty tekst to brak daty", () => {
    expect(parsed("  ")).toMatchObject({ dateYear: null, dateQualifier: null });
  });

  it("odrzuca daty niemożliwe i niezrozumiałe", () => {
    for (const t of ["31.02.1850", "13.1850", "jakoś dawno", "1855–1850", "0850", "3000"]) {
      expect(parsePolishDate(t).ok, t).toBe(false);
    }
  });

  it("29 lutego tylko w roku przestępnym", () => {
    expect(parsePolishDate("29.02.1852").ok).toBe(true);
    expect(parsePolishDate("29.02.1851").ok).toBe(false);
    expect(parsePolishDate("29.02.1900").ok).toBe(false);
  });
});

describe("formatGenDate", () => {
  it.each([
    ["12.03.1850", "12 marca 1850"],
    ["03.1850", "marzec 1850"],
    ["1850", "1850"],
    ["ok. 1850", "ok. 1850"],
    ["przed 1863", "przed 1863"],
    ["po 1900", "po 1900"],
    ["1850–1855", "1850–1855"],
  ])("%s → %s", (input, out) => {
    expect(formatGenDate(parsed(input))).toBe(out);
  });

  it("zapis do formularza da się wczytać z powrotem", () => {
    for (const t of ["12.03.1850", "03.1850", "ok. 1850", "przed 1863", "1850–1855", "po 1.05.1901"]) {
      const d = parsed(t);
      expect(parsed(formatGenDateForInput(d))).toEqual(d);
    }
  });
});

describe("GEDCOM", () => {
  it.each([
    ["12 MAR 1850", { dateQualifier: "EXACT", dateYear: 1850, dateMonth: 3, dateDay: 12 }],
    ["MAR 1850", { dateYear: 1850, dateMonth: 3, dateDay: null }],
    ["1850", { dateYear: 1850, dateMonth: null }],
    ["ABT 1850", { dateQualifier: "ABOUT", dateYear: 1850 }],
    ["EST 1850", { dateQualifier: "ABOUT", dateYear: 1850 }],
    ["BEF 1863", { dateQualifier: "BEFORE", dateYear: 1863 }],
    ["AFT 1900", { dateQualifier: "AFTER", dateYear: 1900 }],
    ["BET 1850 AND 1855", { dateQualifier: "BETWEEN", dateYear: 1850, dateEndYear: 1855 }],
    ["FROM 1850 TO 1855", { dateQualifier: "BETWEEN", dateYear: 1850, dateEndYear: 1855 }],
    ["@#DGREGORIAN@ 1 JAN 1801", { dateYear: 1801, dateMonth: 1, dateDay: 1 }],
    ["11 FEB 1750/51", { dateYear: 1750, dateMonth: 2, dateDay: 11 }],
    ["abt 1850", { dateQualifier: "ABOUT", dateYear: 1850 }],
  ])("czyta „%s”", (text, expected) => {
    expect(parseGedcomDate(text)).toMatchObject(expected);
  });

  it("niezrozumiałą datę zachowuje jako tekst", () => {
    expect(parseGedcomDate("w czasie powstania")).toMatchObject({
      dateYear: null,
      dateText: "w czasie powstania",
    });
    expect(parseGedcomDate("INT 1863 (w czasie powstania)")).toMatchObject({
      dateYear: 1863,
      dateText: "INT 1863 (w czasie powstania)",
    });
  });

  it("zapisuje i odczytuje bez strat", () => {
    for (const t of ["12.03.1850", "03.1850", "1850", "ok. 1850", "przed 1863", "po 1900", "1850–1855"]) {
      const d = parsed(t);
      expect(parseGedcomDate(toGedcomDate(d))).toEqual(d);
    }
  });

  it("tekst bez daty eksportuje jako frazę w nawiasie", () => {
    expect(toGedcomDate(parseGedcomDate("w czasie powstania"))).toBe("(w czasie powstania)");
  });
});

describe("dateRange i sortowanie", () => {
  it("sam rok obejmuje cały rok", () => {
    const r = dateRange(parsed("1850"))!;
    expect(r.max - r.min).toBe(364);
  });

  it("„przed” i „po” są otwarte z jednej strony", () => {
    expect(dateRange(parsed("przed 1863"))!.min).toBe(-Infinity);
    expect(dateRange(parsed("po 1863"))!.max).toBe(Infinity);
  });

  it("brak daty → brak przedziału", () => {
    expect(dateRange(parsed(""))).toBeNull();
  });

  it("klucz sortowania", () => {
    expect(dateSortKey(parsed("12.03.1850"))).toBe(18500312);
    expect(dateSortKey(parsed("1850"))).toBe(18500000);
  });
});
