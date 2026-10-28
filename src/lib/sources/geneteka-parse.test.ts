import { describe, expect, it } from "vitest";
import { ev, person, tree } from "@/lib/genealogy/test-helpers";
import { personFacts } from "@/lib/matching/facts";
import { scoreMatch } from "@/lib/matching/score";
import fixture from "./__fixtures__/geneteka-getact.json";
import { actToCandidate, isAllowed, parseGetAct, parseParents, parseRobots, type GetActResponse } from "./geneteka-parse";

const births = parseGetAct(fixture.B as GetActResponse, "B");
const marriages = parseGetAct(fixture.S as GetActResponse, "S");
const deaths = parseGetAct(fixture.D as GetActResponse, "D");

describe("Geneteka – odczyt aktów", () => {
  it("akt urodzenia: osoba, rodzice, parafia, dokładna data, skan, wolontariusz", () => {
    expect(births[0]).toMatchObject({
      kind: "B",
      gid: "1000001",
      region: "13sk",
      parishId: "1234",
      year: 1851,
      actNumber: "45",
      parish: "Chęciny",
      locality: "Chęciny",
      exactDate: [1851, 10, 4],
      person: { given: "Jan", surname: "Testowski" },
      father: { given: "Wojciech" },
      mother: { given: "Jadwiga", surname: "Przykładowa" },
      archive: "Archiwum Państwowe w Kielcach",
      indexedBy: "wolontariusz1 Weryfikował: wolontariusz2",
    });
    // Link do skanu z metryki.genealodzy.pl – a linków do serwisów komercyjnych nie przenosimy.
    expect(births[0].scanUrl).toBe("https://metryki.genealodzy.pl/metryki.php?op=kt&ar=10&zs=0000x&sy=101&kt=1");
    expect(births[1]).toMatchObject({ father: null, mother: null, remarks: ["nieślubna"], locality: "Dyminy" });
  });

  it("akt ślubu: pan młody, panna młoda i rodzice obojga", () => {
    expect(marriages[0]).toMatchObject({
      year: 1849,
      parish: "Chęciny",
      locality: "Bolmin",
      exactDate: [1849, 6, 9],
      person: { given: "Wojciech", surname: "Testowski" },
      bride: { given: "Jadwiga", surname: "Przykładowa" },
      groomFather: { given: "Jan" },
      groomMother: { given: "Katarzyna", surname: "Kowalkowska" },
      brideFather: { given: "Maciej" },
      brideMother: { given: "Anna", surname: "Dybała" },
    });
  });

  it("akt zgonu: wiek → przybliżony rok urodzenia", () => {
    expect(deaths[0]).toMatchObject({ ageAtDeath: 39, exactDate: [1890, 2, 1], parish: "Chęciny" });
    expect(actToCandidate(deaths[0]).facts.birth).toEqual({ min: 1850, max: 1851 });
  });

  it("rodzice zapisani jednym polem", () => {
    expect(parseParents("Jan, Katarzyna Kowalkowska")).toEqual({
      father: { given: "Jan" },
      mother: { given: "Katarzyna", surname: "Kowalkowska" },
    });
    expect(parseParents("")).toEqual({ father: null, mother: null });
  });

  it("rekord ma stały identyfikator i link zawężony do parafii i roku", () => {
    const c = actToCandidate(births[0]);
    expect(c.externalId).toBe("B-1000001");
    const url = new URL(c.url);
    expect(url.searchParams.get("rid")).toBe("1234");
    expect(url.searchParams.get("from_date")).toBe("1851");
    expect(url.searchParams.get("to_date")).toBe("1851");
  });
});

describe("Geneteka – dopasowanie do drzewa", () => {
  const t = () => {
    const mother = person("m", "Jadwiga", "Testowska", "FEMALE");
    mother.names[0].birthSurname = "Przykładowa";
    return tree({
      persons: [person("jan", "Jan", "Testowski", "MALE", [ev("BIRTH", "1851", "Chęciny")]), person("f", "Wojciech", "Testowski", "MALE"), mother],
      parentLinks: [
        { parentId: "f", childId: "jan", type: "BIOLOGICAL" },
        { parentId: "m", childId: "jan", type: "BIOLOGICAL" },
      ],
      unions: [{ id: "u", partner1Id: "f", partner2Id: "m", type: "MARRIAGE", events: [] }],
    });
  };

  it("akt urodzenia pasuje silnie", () => {
    expect(scoreMatch(personFacts(t(), "jan"), actToCandidate(births[0]).facts).strength).toBe("strong");
  });

  it("akt ślubu – spojrzenie pana młodego i panny młodej", () => {
    const c = actToCandidate(marriages[0]);
    expect(scoreMatch(personFacts(t(), "f"), c.facts).score).toBeGreaterThanOrEqual(50);
    expect(scoreMatch(personFacts(t(), "m"), c.altFacts!).score).toBeGreaterThanOrEqual(50);
    // Panna młoda porównana jako pan młody – nie pasuje.
    expect(scoreMatch(personFacts(t(), "m"), c.facts).strength).toBe("none");
  });
});

describe("robots.txt", () => {
  it("czyta opóźnienie i zakazy dla wszystkich automatów", () => {
    const r = parseRobots("User-agent: *\nDisallow: \nCrawl-delay: 120\nDisallow: /cgi-bin/\n\nUser-agent: ZlyBot\nDisallow: /\n");
    expect(r).toEqual({ crawlDelaySeconds: 120, disallow: ["/cgi-bin/"] });
    expect(isAllowed(r, "/api/getAct.php")).toBe(true);
    expect(isAllowed(r, "/cgi-bin/x")).toBe(false);
  });
});
