import { describe, expect, it } from "vitest";
import { GIVEN_NAMES } from "./data/given-names";
import {
  canonicalGivenNames,
  fold,
  latinGenitives,
  sharesKey,
  surnameKeys,
  transliterateCyrillic,
} from "./normalize";
import { daitchMokotoff, jaroWinkler, sharesSoundex } from "./phonetic";

const canon = (s: string, sex?: "MALE" | "FEMALE") => canonicalGivenNames(s, sex).flatMap((t) => t.canonical);

describe("słownik imion", () => {
  it("ma co najmniej 150 imion i żadnych powtórzeń", () => {
    expect(GIVEN_NAMES.length).toBeGreaterThanOrEqual(150);
    const names = GIVEN_NAMES.map(([n]) => n);
    expect(new Set(names).size).toBe(names.length);
    // Imiona polskie tylko alfabetem łacińskim (wykrywa przypadkowe litery z cyrylicy).
    for (const n of names) expect(n, n).toMatch(/^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+$/);
  });
});

describe("fold i transliteracja", () => {
  it("usuwa polskie znaki", () => {
    expect(fold("Łódź Świętokrzyska")).toBe("lodz swietokrzyska");
  });

  it.each([
    ["Иоанн", "Ioann"],
    ["Ковальский", "Kowalskij"],
    ["Ядвига", "Jadwiga"],
    ["Щепан", "Szczepan"],
    ["Мария", "Marija"],
    ["Хенрык", "Chenryk"],
    ["Пётр", "Piotr"],
  ])("%s → %s", (cyr, lat) => {
    expect(transliterateCyrillic(cyr)).toBe(lat);
  });
});

describe("canonicalGivenNames – formy z metryk", () => {
  it.each([
    ["Joannes", "Jan"],
    ["Ioannes", "Jan"],
    ["Johann", "Jan"],
    ["Иоанн", "Jan"],
    ["Ян", "Jan"],
    ["Adalbertus", "Wojciech"],
    ["Laurentius", "Wawrzyniec"],
    ["Hedvigis", "Jadwiga"],
    ["Hedwigis", "Jadwiga"],
    ["Ядвига", "Jadwiga"],
    ["Catharina", "Katarzyna"],
    ["Екатерина", "Katarzyna"],
    ["Josephus", "Józef"],
    ["Иосиф", "Józef"],
    ["Stanislaus", "Stanisław"],
    ["Hyacinthus", "Jacek"],
    ["Sophia", "Zofia"],
    ["Marianna", "Marianna"],
    ["Woyciech", "Wojciech"],
  ])("%s → %s", (input, polish) => {
    expect(canon(input)).toContain(polish);
  });

  it("Albertus to Wojciech albo Albert", () => {
    expect(canon("Albertus").sort()).toEqual(["Albert", "Wojciech"]);
  });

  it("rozumie łaciński dopełniacz (filius Adalberti et Hedvigis)", () => {
    expect(latinGenitives("Adalbertus")).toContain("Adalberti");
    expect(canon("Adalberti")).toEqual(["Wojciech"]);
    expect(canon("Joannis")).toEqual(["Jan"]);
    expect(canon("Mariae")).toContain("Maria");
    expect(canon("Catharinae")).toEqual(["Katarzyna"]);
    expect(canon("Thomae")).toEqual(["Tomasz"]);
  });

  it("rozumie polski dopełniacz (syn Wojciecha i Jadwigi)", () => {
    expect(canon("Wojciecha")).toEqual(["Wojciech"]);
    expect(canon("Jadwigi")).toEqual(["Jadwiga"]);
    expect(canon("Marianny", "FEMALE")).toEqual(["Marianna"]);
    expect(canon("Jerzego")).toEqual(["Jerzy"]);
    expect(canon("Antoniego")).toEqual(["Antoni"]);
    expect(canon("Pawła")).toEqual(["Paweł"]);
    expect(canon("Wawrzyńca")).toEqual(["Wawrzyniec"]);
  });

  it("„Józefa” u ojca to Józef, u matki – Józefa", () => {
    expect(canon("Józefa", "MALE")).toEqual(["Józef"]);
    expect(canon("Józefa", "FEMALE")).toEqual(["Józefa"]);
  });

  it("kilka imion", () => {
    expect(canonicalGivenNames("Joannes Baptista Adalbertus").map((t) => t.canonical[0])).toEqual([
      "Jan",
      undefined,
      "Wojciech",
    ]);
  });
});

describe("surnameKeys – formy nazwisk", () => {
  const same = (a: string, b: string) => sharesKey(surnameKeys(a), surnameKeys(b));

  it.each([
    ["Kowalska", "Kowalski"],
    ["Nowicka", "Nowicki"],
    ["Zawadzka", "Zawadzki"],
    ["Nowakowa", "Nowak"],
    ["Nowakówna", "Nowak"],
    ["Wronianka", "Wrona"],
    ["Wronina", "Wrona"],
    ["Czarna", "Czarny"],
    ["Kowalsky", "Kowalski"],
    ["Ковальский", "Kowalski"],
    ["Ковальская", "Kowalska"],
    ["z Nowaków", "Nowak"],
    ["z Kowalskich", "Kowalska"],
    ["de domo Nowak", "Nowak"],
    ["z d. Nowak", "Nowak"],
    ["Novak", "Nowak"],
    ["Kowalska-Nowak", "Nowak"],
  ])("%s ≈ %s", (a, b) => {
    expect(same(a, b)).toBe(true);
  });

  it("różne nazwiska się nie łączą", () => {
    expect(same("Kowalski", "Nowak")).toBe(false);
    expect(same("Nowakowski", "Nowak")).toBe(false);
  });
});

describe("Daitch–Mokotoff i Jaro–Winkler", () => {
  it("znane przykłady z opisu algorytmu", () => {
    expect(daitchMokotoff("Moskowitz")).toEqual(["645740"]);
    expect(daitchMokotoff("Auerbach").sort()).toEqual(["097400", "097500"]);
  });

  it("warianty pisowni nazwisk słowiańskich mają wspólny kod", () => {
    expect(sharesSoundex("Kowalski", "Kovalsky")).toBe(true);
    expect(sharesSoundex("Szymański", "Szymanski")).toBe(true);
    expect(sharesSoundex("Wiśniewski", "Wisniewsky")).toBe(true);
    expect(sharesSoundex("Grzybowski", "Gzybowski")).toBe(true);
    expect(sharesSoundex("Kowalski", "Nowak")).toBe(false);
  });

  it("Jaro–Winkler", () => {
    expect(jaroWinkler("Kowalski", "Kowalski")).toBe(1);
    expect(jaroWinkler("MARTHA", "MARHTA")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("Kowalski", "Kowalsky")).toBeGreaterThanOrEqual(0.95);
    // Jaro–Winkler bywa wysoki dla różnych nazwisk – dlatego w punktacji progi są wysokie.
    expect(jaroWinkler("Kowalski", "Nowak")).toBeLessThan(0.8);
  });
});
