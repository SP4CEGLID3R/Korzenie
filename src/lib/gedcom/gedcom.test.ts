import { describe, expect, it } from "vitest";
import { ev, person, tree, union } from "@/lib/genealogy/test-helpers";
import type { TreeSnapshot } from "@/lib/genealogy/types";
import { exportGedcom } from "./export";
import { importGedcom } from "./import";
import { decodeGedcom, parseGedcom } from "./parse";

const utf8 = (s: string) => new TextEncoder().encode(s);

const SAMPLE = `0 HEAD
1 SOUR SomeGenealogyApp
2 NAME Some Genealogy App
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Jan /Kowalski/
2 GIVN Jan
2 SURN Kowalski
1 SEX M
1 BIRT
2 DATE ABT 1850
2 PLAC Chęciny, kielecki, świętokrzyskie, Polska
3 MAP
4 LATI N50.7997
4 LONG E20.4627
1 OCCU rolnik
1 DEAT
2 DATE 3 MAR 1910
1 FAMS @F1@
1 NOTE Gospodarz na
2 CONC  roli we wsi.
2 CONT Druga linia.
1 SOUR @S1@
0 @I2@ INDI
1 NAME Marianna /Nowak/
2 _MARNM Kowalska
1 SEX F
1 CHR
2 DATE 12 JAN 1855
2 PLAC Chęciny, kielecki, świętokrzyskie, Polska
1 FAMS @F1@
0 @I3@ INDI
1 NAME Józef /Kowalski/
1 SEX M
1 BIRT
2 DATE BET 1880 AND 1882
1 FAMC @F1@
2 PEDI birth
0 @I4@ INDI
1 NAME Anna /Kowalska/
1 SEX F
1 FAMC @F1@
2 PEDI adopted
1 NOTE @N1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1878
2 PLAC Chęciny, kielecki, świętokrzyskie, Polska
1 CHIL @I3@
1 CHIL @I4@
0 @N1@ NOTE Przybrana córka.
0 @S1@ SOUR
1 TITL Księga metrykalna
0 TRLR
`;

describe("parseGedcom", () => {
  it("łączy CONC i CONT", () => {
    const { records } = parseGedcom(SAMPLE);
    const jan = records.find((r) => r.xref === "@I1@")!;
    expect(jan.children.find((c) => c.tag === "NOTE")!.value).toBe("Gospodarz na roli we wsi.\nDruga linia.");
  });

  it("zgłasza niepoprawne linie", () => {
    const { warnings } = parseGedcom("0 HEAD\nto nie jest gedcom\n0 TRLR");
    expect(warnings[0]).toContain("Pominięto 1");
  });
});

describe("decodeGedcom", () => {
  it("rozpoznaje BOM UTF-8", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("0 HEAD\n1 CHAR UTF-8\n")]);
    expect(decodeGedcom(bytes).encoding).toBe("UTF-8");
  });

  it("czyta polskie znaki w Windows-1250", () => {
    // „Łódź” w Windows-1250: A3 F3 64 9F
    const head = utf8("0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME ");
    const bytes = new Uint8Array([...head, 0xa3, 0xf3, 0x64, 0x9f, 0x0a]);
    const { text, encoding } = decodeGedcom(bytes);
    expect(encoding).toBe("WINDOWS-1250");
    expect(text).toContain("Łódź");
  });

  it("plik udający UTF-8, a zapisany w Windows-1250", () => {
    const bytes = new Uint8Array([...utf8("0 HEAD\n1 CHAR UTF-8\n1 NOTE "), 0xb9, 0xe6, 0x0a]); // „ąć”
    const r = decodeGedcom(bytes);
    expect(r.text).toContain("ąć");
    expect(r.warnings).toHaveLength(1);
  });
});

describe("importGedcom", () => {
  const result = importGedcom(utf8(SAMPLE));
  const byXref = (x: string) => result.persons.find((p) => p.xref === x)!;

  it("czyta osoby, płeć i nazwiska (z nazwiskiem po ślubie)", () => {
    expect(result.persons).toHaveLength(4);
    expect(byXref("@I1@")).toMatchObject({ sex: "MALE" });
    expect(byXref("@I1@").names[0]).toMatchObject({ givenNames: "Jan", surname: "Kowalski", birthSurname: null });
    expect(byXref("@I2@").names[0]).toMatchObject({
      type: "MARRIED",
      givenNames: "Marianna",
      surname: "Kowalska",
      birthSurname: "Nowak",
    });
  });

  it("czyta wydarzenia z datami, miejscami i współrzędnymi", () => {
    const jan = byXref("@I1@");
    const birth = jan.events.find((e) => e.type === "BIRTH")!;
    expect(birth).toMatchObject({ dateQualifier: "ABOUT", dateYear: 1850 });
    expect(birth.place).toMatchObject({
      name: "Chęciny",
      jurisdiction: "kielecki, świętokrzyskie, Polska",
      latitude: 50.7997,
      longitude: 20.4627,
    });
    expect(jan.events.find((e) => e.type === "OCCUPATION")!.description).toBe("rolnik");
    expect(jan.notes).toContain("Gospodarz na roli");
    expect(byXref("@I2@").events[0].type).toBe("BAPTISM");
  });

  it("czyta rodziny, ślub i rodzaj pokrewieństwa", () => {
    expect(result.families).toHaveLength(1);
    const f = result.families[0];
    expect(f).toMatchObject({ husband: "@I1@", wife: "@I2@" });
    expect(f.events[0]).toMatchObject({ type: "MARRIAGE", dateYear: 1878 });
    expect(byXref("@I4@").childOf).toEqual([{ familyXref: "@F1@", type: "ADOPTIVE" }]);
    expect(byXref("@I4@").notes).toBe("Przybrana córka.");
  });

  it("informuje o pominiętych źródłach", () => {
    expect(result.sourceSystem).toBe("Some Genealogy App");
    expect(result.warnings.some((w) => w.includes("cytowań źródeł"))).toBe(true);
  });
});

describe("exportGedcom", () => {
  const sample: TreeSnapshot = tree({
    persons: [
      person("jan", "Jan", "Kowalski", "MALE", [ev("BIRTH", "ok. 1850", "Chęciny"), ev("DEATH", "3.03.1910")], {
        notes: "Gospodarz.\nDruga linia z @ małpą.",
      }),
      {
        ...person("maria", "Marianna", "Kowalska", "FEMALE", [ev("BAPTISM", "12.01.1855")]),
        names: [{ type: "MARRIED", isPrimary: true, givenNames: "Marianna", surname: "Kowalska", birthSurname: "Nowak" }],
      },
      person("jozef", "Józef", "Kowalski", "MALE", [ev("BIRTH", "1880–1882")]),
      person("anna", "Anna", "Kowalska", "FEMALE", [ev("BIRTH", "1995")]),
    ],
    parentLinks: [
      { parentId: "jan", childId: "jozef", type: "BIOLOGICAL" },
      { parentId: "maria", childId: "jozef", type: "BIOLOGICAL" },
      { parentId: "jozef", childId: "anna", type: "ADOPTIVE" },
    ],
    unions: [union("u", "jan", "maria", [ev("MARRIAGE", "1878")])],
  });

  it("tworzy poprawny nagłówek i zakończenie", () => {
    const out = exportGedcom(sample);
    expect(out.startsWith("0 HEAD\r\n1 SOUR KORZENIE")).toBe(true);
    expect(out).toContain("2 VERS 5.5.1");
    expect(out).toContain("1 CHAR UTF-8");
    expect(out.trimEnd().endsWith("0 TRLR")).toBe(true);
    expect(out).toContain("@@ małpą");
  });

  it("eksport → import zachowuje osoby, daty i rodziny", () => {
    const back = importGedcom(utf8(exportGedcom(sample)));
    expect(back.persons).toHaveLength(4);
    const jan = back.persons[0];
    expect(jan.names[0]).toMatchObject({ givenNames: "Jan", surname: "Kowalski" });
    expect(jan.events.find((e) => e.type === "BIRTH")).toMatchObject({ dateQualifier: "ABOUT", dateYear: 1850 });
    expect(jan.notes).toBe("Gospodarz.\nDruga linia z @ małpą.");
    expect(back.persons[1].names[0]).toMatchObject({ surname: "Kowalska", birthSurname: "Nowak" });
    expect(back.persons[2].events[0]).toMatchObject({ dateQualifier: "BETWEEN", dateYear: 1880, dateEndYear: 1882 });

    const parentsFamily = back.families.find((f) => f.husband === "@I1@")!;
    expect(parentsFamily.wife).toBe("@I2@");
    expect(parentsFamily.children.map((c) => c.xref)).toEqual(["@I3@"]);
    expect(parentsFamily.events[0]).toMatchObject({ type: "MARRIAGE", dateYear: 1878 });
    expect(back.persons[3].childOf[0].type).toBe("ADOPTIVE");
  });

  it("dzieli długie notatki na CONC (linie ≤ 255 znaków)", () => {
    const long = "Bardzo długa notatka. ".repeat(40).trim();
    const out = exportGedcom(tree({ persons: [person("a", "Jan", "K", "MALE", [], { notes: long })] }));
    expect(out.split("\r\n").every((l) => l.length <= 255)).toBe(true);
    expect(importGedcom(utf8(out)).persons[0].notes).toBe(long);
  });

  it("opcja ukrycia osób żyjących", () => {
    const out = exportGedcom(sample, { hideLiving: true, now: new Date("2026-10-27") });
    expect(out).toContain("1 NAME Osoba żyjąca");
    expect(out).not.toContain("1995");
    expect(out).toContain("Jan /Kowalski/");
  });
});
