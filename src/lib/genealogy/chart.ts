// Zamiana drzewa na format biblioteki family-chart
// (https://github.com/donatso/family-chart): lista osób z relacjami
// { parents, spouses, children }.

import { isPresumedLiving } from "@/lib/privacy/living";
import { displayName, lifespan } from "./names";
import type { TreeSnapshot } from "./types";

export type ChartDatum = {
  id: string;
  data: {
    /** family-chart rozróżnia „M” i „F”; „U” = płeć nieznana (szara karta). */
    gender: "M" | "F" | "U";
    name: string;
    lifespan: string;
    living: boolean;
  };
  rels: { parents: string[]; spouses: string[]; children: string[] };
};

export function toChartData(tree: TreeSnapshot, now: Date = new Date()): ChartDatum[] {
  const ids = new Set(tree.persons.map((p) => p.id));
  const rels = new Map(
    tree.persons.map((p) => [p.id, { parents: new Set<string>(), spouses: new Set<string>(), children: new Set<string>() }]),
  );

  for (const l of tree.parentLinks) {
    if (!ids.has(l.parentId) || !ids.has(l.childId)) continue;
    rels.get(l.childId)!.parents.add(l.parentId);
    rels.get(l.parentId)!.children.add(l.childId);
  }

  const linkSpouses = (a: string, b: string) => {
    if (a === b || !ids.has(a) || !ids.has(b)) return;
    rels.get(a)!.spouses.add(b);
    rels.get(b)!.spouses.add(a);
  };
  for (const u of tree.unions) linkSpouses(u.partner1Id, u.partner2Id);
  // Rodzice wspólnego dziecka muszą być „parą”, inaczej wykres nie narysuje dziecka pod obojgiem.
  for (const [, r] of rels) {
    const parents = [...r.parents];
    if (parents.length === 2) linkSpouses(parents[0], parents[1]);
  }

  return tree.persons.map((p) => {
    const r = rels.get(p.id)!;
    return {
      id: p.id,
      data: {
        gender: p.sex === "MALE" ? "M" : p.sex === "FEMALE" ? "F" : "U",
        name: displayName(p.names),
        lifespan: lifespan(p),
        living: isPresumedLiving(p, now.getFullYear()),
      },
      rels: { parents: [...r.parents], spouses: [...r.spouses], children: [...r.children] },
    };
  });
}
