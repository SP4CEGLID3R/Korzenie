import { describe, expect, it } from "vitest";
import { ev, person, tree } from "@/lib/genealogy/test-helpers";
import { personFacts } from "@/lib/matching/facts";
import { scoreMatch } from "@/lib/matching/score";
import fixture from "./__fixtures__/kosciuszko.sparql.json";
import {
  buildDetailsSparql,
  buildPersonSearchSparql,
  filterByItems,
  parseSearchIds,
  nameVariants,
  parseSparqlPersons,
  splitLabel,
  toCandidate,
  yearRangeFromTime,
  type SparqlJson,
} from "./wikidata-sparql";

describe("Wikidata – zapytania", () => {
  it("warianty imienia i nazwiska", () => {
    expect(nameVariants({ givenNames: "Andrzej Tadeusz", surnames: ["Kościuszko"] })).toEqual(["Andrzej Kościuszko"]);
    expect(nameVariants({ givenNames: "Marianna", surnames: ["Nowak", "Kowalska"] })).toEqual([
      "Marianna Nowak",
      "Marianna Kowalska",
    ]);
  });

  it("usuwa znaki specjalne wyszukiwarki", () => {
    expect(nameVariants({ givenNames: "Jan insource:/.*/", surnames: ["Kowal\"ski"] })).toEqual(["Jan Kowal ski"]);
  });

  it("bezpiecznie wstawia tekst do SPARQL", () => {
    const q = buildPersonSearchSparql(['Jan "X" \\ Kowalski']);
    expect(q).toContain('"Jan \\"X\\" \\\\ Kowalski"');
    expect(q).toContain("haswbstatement:P31=Q5");
  });

  it("krok 2 pobiera szczegóły tylko poprawnych identyfikatorów", () => {
    const q = buildDetailsSparql(["Q191479", "Q1; DROP", "Q42"]);
    expect(q).toContain("VALUES ?item { wd:Q191479 wd:Q42 }");
    expect(q).toContain("wdt:P31 wd:Q5");
  });

  it("odczyt wyników wyszukiwarki i filtrowanie po osobach", () => {
    const ids = parseSearchIds({
      results: {
        bindings: [
          { name: { type: "literal", value: "Jan Kowalski" }, item: { type: "uri", value: "http://www.wikidata.org/entity/Q1" } },
          { name: { type: "literal", value: "Jan Kowalski" }, item: { type: "uri", value: "http://www.wikidata.org/entity/Q2" } },
          { name: { type: "literal", value: "Ewa Nowak" }, item: { type: "uri", value: "http://www.wikidata.org/entity/Q3" } },
        ],
      },
    });
    expect(ids.get("Jan Kowalski")).toEqual(["Q1", "Q2"]);
    expect(filterByItems(fixture as SparqlJson, ["Q42"]).results.bindings).toHaveLength(0);
    expect(filterByItems(fixture as SparqlJson, ["Q191479"]).results.bindings.length).toBeGreaterThan(0);
  });
});

describe("Wikidata – odczyt wyników (prawdziwa odpowiedź dla Q191479)", () => {
  const [p] = parseSparqlPersons(fixture as SparqlJson);

  it("łączy wiersze w jedną osobę", () => {
    expect(parseSparqlPersons(fixture as SparqlJson)).toHaveLength(1);
    expect(p).toMatchObject({
      qid: "Q191479",
      label: "Tadeusz Kościuszko",
      sex: "MALE",
      birth: { min: 1746, max: 1746 },
      death: { min: 1817, max: 1817 },
      father: { name: "Ludwik Tadeusz Kościuszko" },
      mother: { name: "Tekla Ratomska" },
    });
    expect(p.birthPlace).toMatchObject({ name: "Mereczowszczyzna", latitude: 52.765533333, longitude: 25.123752777 });
  });

  it("zamienia na rekord z linkiem do oryginału", () => {
    const c = toCandidate(p);
    expect(c.url).toBe("https://www.wikidata.org/wiki/Q191479");
    expect(c.facts.person).toEqual({ given: "Tadeusz", surname: "Kościuszko", sex: "MALE" });
    expect(c.facts.mother).toEqual({ given: "Tekla", surname: "Ratomska" });
  });

  it("dokładność dat: dzień, rok, dekada, wiek", () => {
    expect(yearRangeFromTime("1746-02-12T00:00:00Z", 11)).toEqual({ min: 1746, max: 1746 });
    expect(yearRangeFromTime("1740-01-01T00:00:00Z", 8)).toEqual({ min: 1740, max: 1749 });
    expect(yearRangeFromTime("1800-01-01T00:00:00Z", 7)).toEqual({ min: 1701, max: 1800 });
    expect(yearRangeFromTime("-0500-01-01T00:00:00Z", 9)).toBeNull();
  });

  it("dzieli etykietę na imię i nazwisko", () => {
    expect(splitLabel("Jan III Sobieski")).toEqual({ given: "Jan III", surname: "Sobieski" });
    expect(splitLabel("Mieszko")).toEqual({ given: "Mieszko", surname: null });
  });

  it("Kościuszko z drzewa dopasowuje się silnie", () => {
    const mother = person("m", "Tekla", "Kościuszko", "FEMALE");
    mother.names[0].birthSurname = "Ratomska";
    const t = tree({
      persons: [
        person("t", "Tadeusz", "Kościuszko", "MALE", [ev("BIRTH", "1746"), ev("DEATH", "15.10.1817")]),
        person("f", "Ludwik", "Kościuszko", "MALE"),
        mother,
      ],
      parentLinks: [
        { parentId: "f", childId: "t", type: "BIOLOGICAL" },
        { parentId: "m", childId: "t", type: "BIOLOGICAL" },
      ],
    });
    const r = scoreMatch(personFacts(t, "t"), toCandidate(p).facts);
    expect(r.strength).toBe("strong");
  });
});
