import { describe, expect, it } from "vitest";
import { ev, person, tree } from "@/lib/genealogy/test-helpers";
import type { TreeSnapshot } from "@/lib/genealogy/types";
import { suggestByGeneration, suggestTasks } from "./suggest";

const NOW = new Date("2026-10-28");

/** Jan Kowalski ur. 1852 w Chęcinach, syn Wojciecha i Jadwigi z d. Nowak; Józef – syn Jana. */
function family(): TreeSnapshot {
  const mother = person("m", "Jadwiga", "Kowalska", "FEMALE");
  mother.names[0].birthSurname = "Nowak";
  return tree({
    persons: [
      person("jozef", "Józef", "Kowalski", "MALE", [ev("BIRTH", "1880", "Chęciny")]),
      person("jan", "Jan", "Kowalski", "MALE", [ev("BIRTH", "12.03.1852", "Chęciny")]),
      person("f", "Wojciech", "Kowalski", "MALE"),
      mother,
      person("ja", "Adam", "Kowalski", "MALE", [ev("BIRTH", "1990")]),
    ],
    parentLinks: [
      { parentId: "f", childId: "jan", type: "BIOLOGICAL" },
      { parentId: "m", childId: "jan", type: "BIOLOGICAL" },
      { parentId: "jan", childId: "jozef", type: "BIOLOGICAL" },
      { parentId: "jozef", childId: "ja", type: "BIOLOGICAL" },
    ],
  });
}

const byKind = (t: TreeSnapshot, id: string) => Object.fromEntries(suggestTasks(t, id, new Map(), NOW).map((s) => [s.kind, s]));

describe("Tropiciel – propozycje dla osoby", () => {
  it("akt urodzenia ±2 lata w województwie świętokrzyskim", () => {
    const s = byKind(family(), "jan").FIND_BIRTH;
    expect(s.years).toEqual({ min: 1850, max: 1854 });
    expect(s.region).toBe("13sk");
    const url = new URL(s.searches[0].url);
    expect(url.searchParams.get("bdm")).toBe("B");
    expect(url.searchParams.get("search_lastname")).toBe("Kowalski");
    expect(url.searchParams.get("search_name")).toBe("Jan");
    expect(url.searchParams.get("w")).toBe("13sk");
  });

  it("ślub rodziców 0–15 lat przed urodzeniem dziecka, z nazwiskiem rodowym matki", () => {
    const s = byKind(family(), "jan").FIND_MARRIAGE;
    expect(s.years).toEqual({ min: 1837, max: 1852 });
    expect(s.title).toBe("Znajdź akt ślubu rodziców: Wojciech Kowalski i Jadwiga Kowalska z d. Nowak");
    const url = new URL(s.searches[0].url);
    expect(Object.fromEntries(["bdm", "search_lastname", "search_name", "search_lastname2", "search_name2", "pair"].map((k) => [k, url.searchParams.get(k)]))).toEqual({
      bdm: "S",
      search_lastname: "Kowalski",
      search_name: "Wojciech",
      search_lastname2: "Nowak",
      search_name2: "Jadwiga",
      pair: "1",
    });
    expect(s.searches).toHaveLength(2);
  });

  it("rodzeństwo i zgon", () => {
    const k = byKind(family(), "jan");
    expect(k.FIND_SIBLINGS.years).toEqual({ min: 1832, max: 1857 });
    expect(k.FIND_DEATH.searches[0].query).toMatchObject({ kind: "D", lastname: "Kowalski", name: "Jan" });
    // Zgonu szukamy od narodzin ostatniego znanego dziecka.
    expect(k.FIND_DEATH.years.min).toBe(1880);
  });

  it("szacuje rok urodzenia ojca z daty urodzenia dziecka", () => {
    const s = byKind(family(), "f").FIND_BIRTH;
    expect(s.years).toEqual({ min: 1807, max: 1832 });
    expect(s.why).toContain("szacujemy");
  });

  it("potwierdzony akt urodzenia zamyka zadanie", () => {
    const confirmed = new Map([["jan", new Set(["BAPTISM"])]]);
    expect(suggestTasks(family(), "jan", confirmed, NOW).map((s) => s.kind)).not.toContain("FIND_BIRTH");
  });

  it("dla osób żyjących nic nie proponujemy", () => {
    expect(suggestTasks(family(), "ja", new Map(), NOW)).toEqual([]);
  });

  it("kobieta – akt zgonu także pod nazwiskiem rodowym", () => {
    const t = family();
    t.persons.find((p) => p.id === "m")!.events.push(ev("BIRTH", "1830"));
    const s = byKind(t, "m").FIND_DEATH;
    expect(s.searches.map((x) => x.query.lastname)).toEqual(["Kowalska", "Nowak"]);
  });

  it("nie proponuje lat, z których akty nie są jeszcze indeksowane", () => {
    const t = tree({ persons: [person("x", "Anna", "Nowak", "FEMALE", [ev("BIRTH", "1935"), ev("DEATH", "1990")])] });
    expect(suggestTasks(t, "x", new Map(), NOW).map((s) => s.kind)).toEqual([]);
  });
});

describe("Tropiciel – pokolenie po pokoleniu", () => {
  it("grupuje propozycje od osoby startowej w górę i nie powtarza zadań", () => {
    const groups = suggestByGeneration(family(), "ja", new Map(), NOW);
    expect(groups.map((g) => g.label)).toEqual(["Rodzice", "Dziadkowie", "Pradziadkowie"]);
    const keys = groups.flatMap((g) => g.suggestions.map((s) => s.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(groups[1].suggestions.map((s) => s.kind)).toContain("FIND_MARRIAGE");
  });
});
