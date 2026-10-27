import { describe, expect, it } from "vitest";
import { ev, person, tree } from "@/lib/genealogy/test-helpers";
import type { TreeSnapshot } from "@/lib/genealogy/types";
import { personFacts } from "./facts";
import { scoreMatch, summarize } from "./score";
import type { RecordFacts } from "./types";

const NOW = new Date("2026-10-27");

/** Jan Kowalski, ur. 1852 w Chęcinach, syn Wojciecha i Jadwigi z d. Nowak. */
function kowalscy(): TreeSnapshot {
  const mother = person("m", "Jadwiga", "Kowalska", "FEMALE");
  mother.names[0].birthSurname = "Nowak";
  mother.names[0].type = "MARRIED";
  return tree({
    persons: [
      person("jan", "Jan", "Kowalski", "MALE", [ev("BIRTH", "1852", "Chęciny"), ev("DEATH", "1910")]),
      person("f", "Wojciech", "Kowalski", "MALE", [ev("DEATH", "1880")]),
      mother,
    ],
    parentLinks: [
      { parentId: "f", childId: "jan", type: "BIOLOGICAL" },
      { parentId: "m", childId: "jan", type: "BIOLOGICAL" },
    ],
  });
}

describe("scoreMatch – akty z metryk", () => {
  it("„Joannes Kowalski, ojciec Adalbertus, matka Hedvigis z Nowaków” pasuje do Jana Kowalskiego", () => {
    const record: RecordFacts = {
      kind: "BAPTISM",
      person: { given: "Joannes", surname: "Kowalski", sex: "MALE" },
      year: 1851,
      place: { name: "Chęciny", parish: "Chęciny" },
      father: { given: "Adalbertus", surname: "Kowalski" },
      mother: { given: "Hedvigis", surname: "z Nowaków" },
    };
    const r = scoreMatch(personFacts(kowalscy(), "jan", NOW), record);
    expect(r.strength).toBe("strong");
    expect(r.score).toBeGreaterThanOrEqual(90);
    const byField = Object.fromEntries(r.items.map((i) => [i.field, i]));
    expect(byField.givenNames.detail).toBe("Joannes → Jan");
    expect(byField.fatherGiven.detail).toBe("Adalbertus → Wojciech");
    expect(byField.motherGiven.detail).toBe("Hedvigis → Jadwiga");
    expect(byField.motherMaiden.status).toBe("match");
    expect(byField.birthYear.status).toBe("partial");
    expect(r.summary).toBe(
      "Zgadza się: nazwisko, imię, miejsce urodzenia, imię ojca, imię matki i nazwisko rodowe matki. Częściowo: rok urodzenia (o 1).",
    );
  });

  it("akt po rosyjsku (cyrylica) też pasuje", () => {
    const record: RecordFacts = {
      kind: "BIRTH",
      person: { given: "Иоанн", surname: "Ковальский", sex: "MALE" },
      year: 1852,
      father: { given: "Войцех", surname: "Ковальский" },
      mother: { given: "Ядвига", surname: "урожденная Новак" },
    };
    const r = scoreMatch(personFacts(kowalscy(), "jan", NOW), record);
    expect(r.strength).toBe("strong");
  });

  it("samo imię, nazwisko i rok to tylko „możliwa” propozycja", () => {
    const record: RecordFacts = { kind: "BIRTH", person: { given: "Jan", surname: "Kowalski" }, year: 1852 };
    const r = scoreMatch(personFacts(kowalscy(), "jan", NOW), record);
    expect(r.strength).toBe("possible");
  });

  it("inna matka (rodowe Wiśniewska) wyraźnie obniża wynik", () => {
    const record: RecordFacts = {
      kind: "BIRTH",
      person: { given: "Jan", surname: "Kowalski" },
      year: 1852,
      father: { given: "Wojciech" },
      mother: { given: "Marianna", surname: "Wiśniewska" },
    };
    const r = scoreMatch(personFacts(kowalscy(), "jan", NOW), record);
    expect(r.score).toBeLessThan(80);
    expect(r.items.find((i) => i.field === "motherMaiden")?.status).toBe("mismatch");
  });

  it("rok różny o 30 lat – nie pokazujemy", () => {
    const record: RecordFacts = { kind: "BIRTH", person: { given: "Jan", surname: "Kowalski" }, year: 1882, father: { given: "Wojciech" } };
    expect(scoreMatch(personFacts(kowalscy(), "jan", NOW), record).strength).toBe("none");
  });

  it("inne nazwisko – nie pokazujemy, nawet przy zgodnych rodzicach", () => {
    const record: RecordFacts = {
      kind: "BIRTH",
      person: { given: "Jan", surname: "Nowak" },
      year: 1852,
      father: { given: "Wojciech" },
      mother: { given: "Jadwiga", surname: "Nowak" },
    };
    expect(scoreMatch(personFacts(kowalscy(), "jan", NOW), record).score).toBeLessThanOrEqual(40);
  });

  it("inna płeć mocno obniża wynik", () => {
    const record: RecordFacts = { kind: "BIRTH", person: { given: "Joanna", surname: "Kowalska", sex: "FEMALE" }, year: 1852 };
    expect(scoreMatch(personFacts(kowalscy(), "jan", NOW), record).strength).toBe("none");
  });

  it("akt zgonu kobiety pod nazwiskiem po mężu", () => {
    const wife = person("w", "Marianna", "Kowalska", "FEMALE", [ev("BIRTH", "1855"), ev("DEATH", "1920", "Kielce")]);
    wife.names[0].birthSurname = "Nowak";
    const husband = person("h", "Jan", "Kowalski", "MALE");
    const t = tree({ persons: [wife, husband], unions: [{ id: "u", partner1Id: "h", partner2Id: "w", type: "MARRIAGE", events: [] }] });
    const record: RecordFacts = {
      kind: "DEATH",
      person: { given: "Marianna", surname: "Kowalska", sex: "FEMALE" },
      year: 1920,
      place: { name: "Kielce" },
      spouses: [{ given: "Jan", surname: "Kowalski" }],
    };
    const r = scoreMatch(personFacts(t, "w", NOW), record);
    expect(r.strength).toBe("strong");
  });
});

describe("summarize", () => {
  it("buduje zdanie z listy pól", () => {
    expect(
      summarize([
        { field: "surname", label: "Nazwisko", status: "match", detail: "" },
        { field: "fatherGiven", label: "Imię ojca", status: "match", detail: "" },
        { field: "birthYear", label: "Rok urodzenia", status: "partial", detail: "różnica 1 rok" },
        { field: "motherGiven", label: "Imię matki", status: "missing", detail: "" },
      ]),
    ).toBe("Zgadza się: nazwisko i imię ojca. Częściowo: rok urodzenia (o 1). Brak danych: imię matki.");
  });
});
