import { describe, expect, it } from "vitest";
import { isPresumedLiving, latestPossibleBirthYear } from "./living";

const YEAR = 2026;

describe("isPresumedLiving", () => {
  it("osoba urodzona 99 lat temu bez daty śmierci jest traktowana jako żyjąca", () => {
    expect(
      isPresumedLiving(
        { livingStatus: "AUTO", events: [{ type: "BIRTH", dateYear: 1927 }] },
        YEAR,
      ),
    ).toBe(true);
  });

  it("osoba urodzona 100 lat temu lub dawniej nie jest traktowana jako żyjąca", () => {
    expect(
      isPresumedLiving(
        { livingStatus: "AUTO", events: [{ type: "BIRTH", dateYear: 1926 }] },
        YEAR,
      ),
    ).toBe(false);
  });

  it("zgon lub pochówek, nawet bez daty, oznacza osobę zmarłą", () => {
    expect(
      isPresumedLiving(
        {
          livingStatus: "AUTO",
          events: [{ type: "BIRTH", dateYear: 1990 }, { type: "DEATH" }],
        },
        YEAR,
      ),
    ).toBe(false);
    expect(
      isPresumedLiving({ livingStatus: "AUTO", events: [{ type: "BURIAL" }] }, YEAR),
    ).toBe(false);
  });

  it("brak jakichkolwiek dat – zakładamy, że osoba żyje", () => {
    expect(isPresumedLiving({ livingStatus: "AUTO", events: [] }, YEAR)).toBe(true);
    expect(
      isPresumedLiving({ livingStatus: "AUTO", events: [{ type: "BIRTH" }] }, YEAR),
    ).toBe(true);
  });

  it("chrzest liczy się jak urodzenie", () => {
    expect(
      isPresumedLiving(
        { livingStatus: "AUTO", events: [{ type: "BAPTISM", dateYear: 1850 }] },
        YEAR,
      ),
    ).toBe(false);
  });

  it("ręczne ustawienie użytkownika ma pierwszeństwo", () => {
    expect(
      isPresumedLiving(
        { livingStatus: "DECEASED", events: [{ type: "BIRTH", dateYear: 1990 }] },
        YEAR,
      ),
    ).toBe(false);
    expect(
      isPresumedLiving(
        { livingStatus: "LIVING", events: [{ type: "BIRTH", dateYear: 1900 }] },
        YEAR,
      ),
    ).toBe(true);
  });

  it("data przybliżona na granicy jest rozstrzygana ostrożnie (na korzyść prywatności)", () => {
    // „ok. 1925” → mogło być 1927 → mniej niż 100 lat → żyjąca
    expect(
      isPresumedLiving(
        {
          livingStatus: "AUTO",
          events: [{ type: "BIRTH", dateQualifier: "ABOUT", dateYear: 1925 }],
        },
        YEAR,
      ),
    ).toBe(true);
  });

  it("„urodzony po 1850” bez innych danych – zakładamy, że osoba żyje", () => {
    expect(
      isPresumedLiving(
        {
          livingStatus: "AUTO",
          events: [{ type: "BIRTH", dateQualifier: "AFTER", dateYear: 1850 }],
        },
        YEAR,
      ),
    ).toBe(true);
  });
});

describe("latestPossibleBirthYear", () => {
  it("zakres lat – bierzemy koniec zakresu", () => {
    expect(
      latestPossibleBirthYear({
        type: "BIRTH",
        dateQualifier: "BETWEEN",
        dateYear: 1850,
        dateEndYear: 1855,
      }),
    ).toBe(1855);
  });

  it("„przed 1863” – najpóźniej 1863", () => {
    expect(
      latestPossibleBirthYear({ type: "BIRTH", dateQualifier: "BEFORE", dateYear: 1863 }),
    ).toBe(1863);
  });
});
