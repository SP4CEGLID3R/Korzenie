import { describe, expect, it } from "vitest";
import { ev, person, tree } from "@/lib/genealogy/test-helpers";
import { proposeFacts } from "./adopt";
import type { RecordFacts } from "./types";

const birthRecord: RecordFacts = {
  kind: "BIRTH",
  person: { given: "Jan", surname: "Kowalski" },
  year: 1851,
  date: [1851, 10, 4],
  place: { name: "Bolmin", parish: "Chęciny", region: "świętokrzyskie" },
  father: { given: "Wojciech", surname: "Kowalski" },
  mother: { given: "Jadwiga", surname: "Nowak" },
};

describe("proposeFacts", () => {
  it("osoba bez dat i rodziców – urodzenie, ojciec i matka z nazwiskiem rodowym", () => {
    const t = tree({ persons: [person("jan", "Jan", "Kowalski", "MALE")] });
    const p = proposeFacts(t, "jan", birthRecord);
    expect(p.map((x) => x.label)).toEqual([
      "Dodaj urodzenie: 4 października 1851, Bolmin (parafia Chęciny)",
      "Dodaj ojca: Wojciech Kowalski",
      "Dodaj matkę: Jadwiga Kowalska z d. Nowak",
    ]);
    const mother = p.find((x) => x.key === "mother");
    expect(mother?.kind === "parent" && mother.person).toEqual({
      givenNames: "Jadwiga",
      surname: "Kowalska",
      birthSurname: "Nowak",
      sex: "FEMALE",
    });
  });

  it("uzupełnia tylko to, czego brakuje", () => {
    const t = tree({
      persons: [person("jan", "Jan", "Kowalski", "MALE", [ev("BIRTH", "1851")]), person("f", "Wojciech", "Kowalski", "MALE")],
      parentLinks: [{ parentId: "f", childId: "jan", type: "BIOLOGICAL" }],
    });
    const p = proposeFacts(t, "jan", birthRecord);
    expect(p.map((x) => x.key)).toEqual(["birth", "mother"]);
    expect(p[0].label).toBe("Uzupełnij urodzenie: 4 października 1851, Bolmin (parafia Chęciny)");
  });

  it("nic nie proponuje, gdy drzewo ma już te dane", () => {
    const t = tree({
      persons: [person("jan", "Jan", "Kowalski", "MALE", [ev("BIRTH", "4.10.1851", "Bolmin")])],
    });
    expect(proposeFacts(t, "jan", { ...birthRecord, father: null, mother: null })).toEqual([]);
  });

  it("akt zgonu – zgon i przybliżony rok urodzenia z wieku", () => {
    const t = tree({ persons: [person("jan", "Jan", "Kowalski", "MALE")] });
    const p = proposeFacts(t, "jan", {
      kind: "DEATH",
      person: { given: "Jan", surname: "Kowalski" },
      year: 1890,
      birth: { min: 1850, max: 1851 },
      place: { name: "Chęciny", parish: "Chęciny" },
    });
    expect(p.map((x) => x.label)).toEqual([
      "Dodaj zgon: 1890, parafia Chęciny",
      "Dodaj urodzenie: 1850–1851 (wyliczone z wieku w akcie zgonu)",
    ]);
  });

  it("akt ślubu – istniejący małżonek dostaje datę ślubu, a nowy jest proponowany do dodania", () => {
    const record: RecordFacts = {
      kind: "MARRIAGE",
      person: { given: "Wojciech", surname: "Kowalski", sex: "MALE" },
      year: 1849,
      date: [1849, 6, 9],
      place: { name: "Chęciny", parish: "Chęciny" },
      spouses: [{ given: "Hedvigis", surname: "Nowak" }],
    };
    const withWife = tree({
      persons: [person("w", "Wojciech", "Kowalski", "MALE"), person("j", "Jadwiga", "Kowalska", "FEMALE")],
      unions: [{ id: "u", partner1Id: "w", partner2Id: "j", type: "MARRIAGE", events: [] }],
    });
    const p1 = proposeFacts(withWife, "w", record);
    expect(p1).toMatchObject([{ key: "marriage", spouseId: "j", newSpouse: null }]);
    expect(p1[0].label).toBe("Dodaj ślub z: Jadwiga Kowalska – 9 czerwca 1849, parafia Chęciny");

    const alone = tree({ persons: [person("w", "Wojciech", "Kowalski", "MALE")] });
    const p2 = proposeFacts(alone, "w", record);
    expect(p2[0]).toMatchObject({
      spouseId: null,
      newSpouse: { givenNames: "Hedvigis", surname: "Kowalska", birthSurname: "Nowak", sex: "FEMALE" },
    });
  });
});
