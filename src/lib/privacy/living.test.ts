import { describe, expect, it } from "vitest";
import { isPresumedLiving, latestPossibleBirthYear, livingStatusMap } from "./living";

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

describe("livingStatusMap – wnioskowanie z dat potomków", () => {
  const p = (id: string, events: { type: string; dateYear?: number }[] = [], livingStatus: "AUTO" | "LIVING" = "AUTO") => ({
    id,
    livingStatus,
    events,
  });

  it("rodzic i dziadek osoby urodzonej w 1746 r. nie żyją, choć nie mają dat", () => {
    const m = livingStatusMap(
      {
        persons: [p("dziadek"), p("ojciec"), p("syn", [{ type: "BIRTH", dateYear: 1746 }])],
        parentLinks: [
          { parentId: "dziadek", childId: "ojciec" },
          { parentId: "ojciec", childId: "syn" },
        ],
      },
      2026,
    );
    expect(m.get("ojciec")).toBe(false);
    expect(m.get("dziadek")).toBe(false);
  });

  it("rodzic dziecka urodzonego 60 lat temu – bez dat nadal traktowany jako żyjący", () => {
    const m = livingStatusMap(
      { persons: [p("ojciec"), p("syn", [{ type: "BIRTH", dateYear: 1966 }])], parentLinks: [{ parentId: "ojciec", childId: "syn" }] },
      2026,
    );
    expect(m.get("ojciec")).toBe(true);
  });

  it("ręczne „żyje” ma pierwszeństwo, a pętla w danych nie zawiesza programu", () => {
    const m = livingStatusMap(
      {
        persons: [p("a", [], "LIVING"), p("b"), p("c", [{ type: "BIRTH", dateYear: 1800 }])],
        parentLinks: [
          { parentId: "a", childId: "c" },
          { parentId: "b", childId: "a" },
          { parentId: "a", childId: "b" },
        ],
      },
      2026,
    );
    expect(m.get("a")).toBe(true);
    expect(m.get("b")).toBe(false);
  });
});
