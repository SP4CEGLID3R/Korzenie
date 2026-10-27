import { describe, expect, it } from "vitest";
import { checkConsistency } from "./consistency";
import { ev, person, tree, union } from "./test-helpers";

const NOW = new Date("2026-10-27T12:00:00Z");
const codes = (t: Parameters<typeof checkConsistency>[0]) => checkConsistency(t, NOW).map((i) => i.code);

describe("checkConsistency – pojedyncza osoba", () => {
  it("poprawne drzewo nie ma ostrzeżeń", () => {
    const t = tree({
      persons: [
        person("jan", "Jan", "Kowalski", "MALE", [ev("BIRTH", "1850"), ev("DEATH", "1910")]),
        person("maria", "Marianna", "Nowak", "FEMALE", [ev("BIRTH", "1855"), ev("DEATH", "1920")]),
        person("syn", "Józef", "Kowalski", "MALE", [ev("BIRTH", "1880")]),
      ],
      parentLinks: [
        { parentId: "jan", childId: "syn", type: "BIOLOGICAL" },
        { parentId: "maria", childId: "syn", type: "BIOLOGICAL" },
      ],
      unions: [union("u", "jan", "maria", [ev("MARRIAGE", "1878")])],
    });
    expect(codes(t)).toEqual([]);
  });

  it("zgon przed urodzeniem", () => {
    const t = tree({ persons: [person("a", "Jan", "K", "MALE", [ev("BIRTH", "1850"), ev("DEATH", "1840")])] });
    const issues = checkConsistency(t, NOW);
    expect(issues.map((i) => i.code)).toContain("DEATH_BEFORE_BIRTH");
    expect(issues[0].message).toBe("Jan K: zgon (1840) wcześniej niż urodzenie (1850).");
  });

  it("daty przybliżone nie dają fałszywych alarmów", () => {
    // „ok. 1850” urodzenie i zgon w 1849 – możliwe przy marginesie przybliżenia
    const t = tree({
      persons: [person("a", "Jan", "K", "MALE", [ev("BIRTH", "ok. 1850"), ev("DEATH", "1849")])],
    });
    expect(codes(t)).toEqual([]);
  });

  it("pochówek przed zgonem i chrzest przed urodzeniem", () => {
    const t = tree({
      persons: [
        person("a", "Jan", "K", "MALE", [
          ev("BIRTH", "12.03.1850"),
          ev("BAPTISM", "1.03.1850"),
          ev("DEATH", "5.05.1900"),
          ev("BURIAL", "1.05.1900"),
        ]),
      ],
    });
    expect(codes(t)).toEqual(expect.arrayContaining(["BAPTISM_BEFORE_BIRTH", "BURIAL_BEFORE_DEATH"]));
  });

  it("osoba żyła ponad 110 lat", () => {
    const t = tree({ persons: [person("a", "Jan", "K", "MALE", [ev("BIRTH", "1790"), ev("DEATH", "1910")])] });
    const [issue] = checkConsistency(t, NOW);
    expect(issue.code).toBe("LIFESPAN_TOO_LONG");
    expect(issue.message).toContain("żył co najmniej 119 lat");
  });

  it("ręcznie oznaczona jako żyjąca, choć urodzona 130 lat temu", () => {
    const t = tree({
      persons: [person("a", "Anna", "K", "FEMALE", [ev("BIRTH", "1896")], { livingStatus: "LIVING" })],
    });
    expect(codes(t)).toEqual(["LIVING_TOO_OLD"]);
  });

  it("wydarzenie w przyszłości", () => {
    const t = tree({ persons: [person("a", "Jan", "K", "MALE", [ev("BIRTH", "2030")])] });
    expect(codes(t)).toEqual(["FUTURE_EVENT"]);
  });
});

describe("checkConsistency – rodzice i dzieci", () => {
  const base = (motherBirth: string, childBirth: string, motherDeath?: string) =>
    tree({
      persons: [
        person("m", "Marianna", "Nowak", "FEMALE", [
          ev("BIRTH", motherBirth),
          ...(motherDeath ? [ev("DEATH", motherDeath)] : []),
        ]),
        person("c", "Józef", "Kowalski", "MALE", [ev("BIRTH", childBirth)]),
      ],
      parentLinks: [{ parentId: "m", childId: "c", type: "BIOLOGICAL" }],
    });

  it("matka miała 8 lat przy porodzie", () => {
    const issues = checkConsistency(base("1850", "1858"), NOW);
    expect(issues.map((i) => i.code)).toEqual(["PARENT_TOO_YOUNG"]);
    expect(issues[0].message).toContain("matka");
    expect(issues[0].message).toContain("miała najwyżej 8 lat");
  });

  it("matka po sześćdziesiątce", () => {
    expect(codes(base("1800", "1862"))).toEqual(["PARENT_TOO_OLD"]);
  });

  it("dziecko urodzone po śmierci matki", () => {
    expect(codes(base("1850", "1880", "1875"))).toEqual(["BORN_AFTER_PARENT_DEATH"]);
  });

  it("dziecko urodzone kilka miesięcy po śmierci ojca jest w porządku", () => {
    const t = tree({
      persons: [
        person("f", "Jan", "Kowalski", "MALE", [ev("BIRTH", "1850"), ev("DEATH", "10.01.1880")]),
        person("c", "Józef", "Kowalski", "MALE", [ev("BIRTH", "15.06.1880")]),
      ],
      parentLinks: [{ parentId: "f", childId: "c", type: "BIOLOGICAL" }],
    });
    expect(codes(t)).toEqual([]);
  });

  it("dziecko urodzone dwa lata po śmierci ojca", () => {
    const t = tree({
      persons: [
        person("f", "Jan", "Kowalski", "MALE", [ev("BIRTH", "1850"), ev("DEATH", "1880")]),
        person("c", "Józef", "Kowalski", "MALE", [ev("BIRTH", "1882")]),
      ],
      parentLinks: [{ parentId: "f", childId: "c", type: "BIOLOGICAL" }],
    });
    expect(codes(t)).toEqual(["BORN_AFTER_PARENT_DEATH"]);
  });

  it("rodzic urodzony po dziecku (także przy adopcji)", () => {
    const t = tree({
      persons: [
        person("p", "Jan", "K", "MALE", [ev("BIRTH", "1900")]),
        person("c", "Józef", "K", "MALE", [ev("BIRTH", "1880")]),
      ],
      parentLinks: [{ parentId: "p", childId: "c", type: "ADOPTIVE" }],
    });
    expect(codes(t)).toEqual(["PARENT_BORN_AFTER_CHILD"]);
  });

  it("wiek przy porodzie nie dotyczy rodziców adopcyjnych", () => {
    const t = tree({
      persons: [
        person("m", "Anna", "K", "FEMALE", [ev("BIRTH", "1800")]),
        person("c", "Józef", "K", "MALE", [ev("BIRTH", "1870")]),
      ],
      parentLinks: [{ parentId: "m", childId: "c", type: "ADOPTIVE" }],
    });
    expect(codes(t)).toEqual([]);
  });

  it("więcej niż dwoje rodziców biologicznych", () => {
    const t = tree({
      persons: ["a", "b", "c", "d"].map((id) => person(id, id, "K", "UNKNOWN")),
      parentLinks: ["a", "b", "c"].map((p) => ({ parentId: p, childId: "d", type: "BIOLOGICAL" as const })),
    });
    expect(codes(t)).toEqual(["TOO_MANY_PARENTS"]);
  });

  it("osoba jest własnym przodkiem", () => {
    const t = tree({
      persons: ["a", "b", "c"].map((id) => person(id, id, "K", "MALE")),
      parentLinks: [
        { parentId: "a", childId: "b", type: "BIOLOGICAL" },
        { parentId: "b", childId: "c", type: "BIOLOGICAL" },
        { parentId: "c", childId: "a", type: "BIOLOGICAL" },
      ],
    });
    expect(codes(t).filter((c) => c === "OWN_ANCESTOR")).toHaveLength(3);
  });
});

describe("checkConsistency – małżeństwa", () => {
  it("ślub przed urodzeniem, za młodo i po zgonie", () => {
    const t = tree({
      persons: [
        person("a", "Jan", "K", "MALE", [ev("BIRTH", "1860"), ev("DEATH", "1870")]),
        person("b", "Anna", "N", "FEMALE", [ev("BIRTH", "1868")]),
        person("c", "Ewa", "N", "FEMALE", [ev("BIRTH", "1880")]),
      ],
      unions: [union("u1", "a", "b", [ev("MARRIAGE", "1875")]), union("u2", "a", "c", [ev("MARRIAGE", "1878")])],
    });
    expect(codes(t)).toEqual(
      expect.arrayContaining(["MARRIAGE_AFTER_DEATH", "MARRIED_TOO_YOUNG", "MARRIAGE_BEFORE_BIRTH"]),
    );
  });
});
