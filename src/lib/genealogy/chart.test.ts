import { describe, expect, it } from "vitest";
import { toChartData } from "./chart";
import { ev, person, tree } from "./test-helpers";

describe("toChartData", () => {
  it("rodzice wspólnego dziecka stają się parą, nawet bez zapisanego ślubu", () => {
    const data = toChartData(
      tree({
        persons: [
          person("f", "Jan", "Kowalski", "MALE", [ev("BIRTH", "1850"), ev("DEATH", "1910")]),
          person("m", "Anna", "Nowak", "FEMALE"),
          person("c", "Józef", "Kowalski", "UNKNOWN"),
        ],
        parentLinks: [
          { parentId: "f", childId: "c", type: "BIOLOGICAL" },
          { parentId: "m", childId: "c", type: "BIOLOGICAL" },
        ],
      }),
      new Date("2026-01-01"),
    );
    const byId = Object.fromEntries(data.map((d) => [d.id, d]));
    expect(byId.f.rels).toEqual({ parents: [], spouses: ["m"], children: ["c"] });
    expect(byId.c.rels.parents.sort()).toEqual(["f", "m"]);
    expect(byId.c.data.gender).toBe("U");
    expect(byId.f.data).toMatchObject({ name: "Jan Kowalski", lifespan: "1850–1910", living: false });
    // Brak dat → traktujemy jako żyjącą.
    expect(byId.m.data.living).toBe(true);
  });
});
