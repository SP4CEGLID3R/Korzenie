// „Strażnik spójności”: wyszukuje w drzewie daty, które nie mogą być prawdziwe
// (zgon przed urodzeniem, dziecko urodzone po śmierci matki…) albo są bardzo
// mało prawdopodobne (matka miała 8 lat przy porodzie).
//
// Zasada: zgłaszamy problem tylko wtedy, gdy wynika z dat NA PEWNO – daty
// przybliżone („ok. 1850”, „przed 1863”) traktujemy jako przedziały i bierzemy
// najbardziej korzystny wariant. Dzięki temu nie zasypujemy użytkownika
// fałszywymi alarmami.

import {
  DAYS_PER_YEAR,
  dateRange,
  formatYearShort,
  todayDayNumber,
  type DayRange,
} from "./dates";
import { displayName } from "./names";
import type { EventType, SnapshotEvent, SnapshotPerson, TreeSnapshot } from "./types";

export type IssueSeverity = "error" | "warning";

export type ConsistencyIssue = {
  code: string;
  severity: IssueSeverity;
  message: string;
  /** Osoby, których dotyczy problem (pierwsza – „główna”). */
  personIds: string[];
};

/** Progi – w jednym miejscu, żeby łatwo je zmieniać. */
export const LIMITS = {
  maxLifespanYears: 110,
  motherMinAge: 12,
  motherMaxAge: 55,
  fatherMinAge: 13,
  fatherMaxAge: 80,
  minMarriageAge: 14,
  /** Dziecko może urodzić się do ok. 10 miesięcy po śmierci ojca. */
  daysAfterFatherDeath: 300,
};

type Ranges = {
  birth: DayRange | null;
  death: DayRange | null;
};

function eventRange(events: SnapshotEvent[], type: EventType) {
  const e = events.find((x) => x.type === type && x.dateYear !== null);
  return e ? { event: e, range: dateRange(e)! } : null;
}

/** Przedział urodzenia (z aktu chrztu wiemy tylko, że urodzenie było nie później). */
function birthRange(p: SnapshotPerson): DayRange | null {
  const birth = eventRange(p.events, "BIRTH");
  if (birth) return birth.range;
  const baptism = eventRange(p.events, "BAPTISM");
  return baptism ? { min: -Infinity, max: baptism.range.max } : null;
}

/** Przedział zgonu (z pochówku wiemy, że zgon był nie później). */
function deathRange(p: SnapshotPerson): DayRange | null {
  const death = eventRange(p.events, "DEATH");
  if (death) return death.range;
  const burial = eventRange(p.events, "BURIAL");
  return burial ? { min: -Infinity, max: burial.range.max } : null;
}

const years = (days: number) => Math.floor(days / DAYS_PER_YEAR);

/** Końcówka czasownika zależna od płci: „żył” / „żyła” / „żył(a)”. */
function v(p: SnapshotPerson, stem: string) {
  return stem + (p.sex === "MALE" ? "" : p.sex === "FEMALE" ? "a" : "(a)");
}

function yearOf(p: SnapshotPerson, types: EventType[]) {
  for (const t of types) {
    const e = p.events.find((x) => x.type === t && x.dateYear !== null);
    if (e) return formatYearShort(e);
  }
  return "?";
}
const birthYear = (p: SnapshotPerson) => yearOf(p, ["BIRTH", "BAPTISM"]);
const deathYear = (p: SnapshotPerson) => yearOf(p, ["DEATH", "BURIAL"]);

export function checkConsistency(tree: TreeSnapshot, now: Date = new Date()): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const today = todayDayNumber(now);
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const ranges = new Map<string, Ranges>(
    tree.persons.map((p) => [p.id, { birth: birthRange(p), death: deathRange(p) }]),
  );
  const name = (p: SnapshotPerson) => displayName(p.names);
  const add = (severity: IssueSeverity, code: string, message: string, ...personIds: string[]) =>
    issues.push({ severity, code, message, personIds });

  // ── Pojedyncza osoba ─────────────────────────────────────────────────
  for (const p of tree.persons) {
    const { birth, death } = ranges.get(p.id)!;
    const n = name(p);

    if (birth && death && death.max < birth.min) {
      add("error", "DEATH_BEFORE_BIRTH", `${n}: zgon (${deathYear(p)}) wcześniej niż urodzenie (${birthYear(p)}).`, p.id);
    }

    const b = eventRange(p.events, "BIRTH");
    const bap = eventRange(p.events, "BAPTISM");
    if (b && bap && bap.range.max < b.range.min) {
      add("error", "BAPTISM_BEFORE_BIRTH", `${n}: chrzest (${formatYearShort(bap.event)}) wcześniej niż urodzenie (${formatYearShort(b.event)}).`, p.id);
    }

    const d = eventRange(p.events, "DEATH");
    const bur = eventRange(p.events, "BURIAL");
    if (d && bur && bur.range.max < d.range.min) {
      add("error", "BURIAL_BEFORE_DEATH", `${n}: pochówek (${formatYearShort(bur.event)}) wcześniej niż zgon (${formatYearShort(d.event)}).`, p.id);
    }

    if (birth && death && death.min - birth.max > LIMITS.maxLifespanYears * DAYS_PER_YEAR) {
      add("warning", "LIFESPAN_TOO_LONG", `${n}: według dat ${v(p, "żył")} co najmniej ${years(death.min - birth.max)} lat (${birthYear(p)}–${deathYear(p)}).`, p.id);
    }

    if (p.livingStatus === "LIVING" && birth && today - birth.max > LIMITS.maxLifespanYears * DAYS_PER_YEAR) {
      add("warning", "LIVING_TOO_OLD", `${n}: osoba oznaczona jako żyjąca, ale ${v(p, "miał")}by dziś co najmniej ${years(today - birth.max)} lat.`, p.id);
    }

    for (const e of p.events) {
      const r = dateRange(e);
      if (r && r.min > today) {
        add("error", "FUTURE_EVENT", `${n}: wydarzenie z datą w przyszłości (${formatYearShort(e)}).`, p.id);
      }
    }
  }

  // ── Rodzice i dzieci ─────────────────────────────────────────────────
  const biologicalParents = new Map<string, string[]>();
  for (const link of tree.parentLinks) {
    const parent = byId.get(link.parentId);
    const child = byId.get(link.childId);
    if (!parent || !child) continue;
    if (link.type === "BIOLOGICAL") {
      biologicalParents.set(child.id, [...(biologicalParents.get(child.id) ?? []), parent.id]);
    }

    const pr = ranges.get(parent.id)!;
    const cb = ranges.get(child.id)!.birth;
    if (!cb) continue;
    const pn = name(parent);
    const cn = name(child);

    if (pr.birth && pr.birth.min > cb.max) {
      add("error", "PARENT_BORN_AFTER_CHILD", `${pn} (ur. ${birthYear(parent)}) ${v(parent, "urodził")} się później niż dziecko: ${cn} (ur. ${birthYear(child)}).`, parent.id, child.id);
      continue;
    }

    // Wiek przy porodzie i zgon przed urodzeniem dziecka – tylko rodzice biologiczni.
    if (link.type !== "BIOLOGICAL") continue;
    const isMother = parent.sex === "FEMALE";
    const isFather = parent.sex === "MALE";
    const minAge = isFather ? LIMITS.fatherMinAge : LIMITS.motherMinAge;
    const maxAge = isFather ? LIMITS.fatherMaxAge : LIMITS.motherMaxAge;
    const role = isMother ? "matka" : isFather ? "ojciec" : "rodzic";

    if (pr.birth) {
      const oldestPossible = cb.max - pr.birth.min;
      const youngestPossible = cb.min - pr.birth.max;
      if (oldestPossible >= 0 && oldestPossible < minAge * DAYS_PER_YEAR) {
        add("warning", "PARENT_TOO_YOUNG", `${pn} – ${role} – ${v(parent, "miał")} najwyżej ${years(oldestPossible)} lat, gdy urodziło się dziecko: ${cn} (ur. ${birthYear(child)}).`, parent.id, child.id);
      } else if ((isMother || isFather) && youngestPossible > maxAge * DAYS_PER_YEAR) {
        add("warning", "PARENT_TOO_OLD", `${pn} – ${role} – ${v(parent, "miał")} co najmniej ${years(youngestPossible)} lat, gdy urodziło się dziecko: ${cn} (ur. ${birthYear(child)}).`, parent.id, child.id);
      }
    }

    if (pr.death) {
      const grace = isFather ? LIMITS.daysAfterFatherDeath : 0;
      if (cb.min > pr.death.max + grace) {
        add("error", "BORN_AFTER_PARENT_DEATH", `${cn} (ur. ${birthYear(child)}) ${v(child, "urodził")} się po śmierci rodzica: ${pn} (zm. ${deathYear(parent)}).`, child.id, parent.id);
      }
    }
  }

  for (const [childId, parents] of biologicalParents) {
    if (parents.length > 2) {
      add("warning", "TOO_MANY_PARENTS", `${name(byId.get(childId)!)} ma ${parents.length} rodziców biologicznych.`, childId, ...parents);
    }
  }

  // ── Małżeństwa ─────────────────────────────────────────────────
  for (const u of tree.unions) {
    const marriage = u.events.find((e) => e.type === "MARRIAGE" && e.dateYear !== null);
    if (!marriage) continue;
    const mr = dateRange(marriage)!;
    for (const pid of [u.partner1Id, u.partner2Id]) {
      const p = byId.get(pid);
      if (!p) continue;
      const { birth, death } = ranges.get(pid)!;
      const n = name(p);
      const my = formatYearShort(marriage);
      if (birth && mr.max < birth.min) {
        add("error", "MARRIAGE_BEFORE_BIRTH", `${n}: ślub (${my}) wcześniej niż urodzenie (${birthYear(p)}).`, pid);
      } else if (birth && mr.max - birth.min < LIMITS.minMarriageAge * DAYS_PER_YEAR) {
        add("warning", "MARRIED_TOO_YOUNG", `${n}: w dniu ślubu (${my}) ${v(p, "miał")} najwyżej ${years(mr.max - birth.min)} lat.`, pid);
      }
      if (death && mr.min > death.max) {
        add("error", "MARRIAGE_AFTER_DEATH", `${n}: ślub (${my}) później niż zgon (${deathYear(p)}).`, pid);
      }
    }
  }

  // ── Pętle w drzewie (ktoś jest własnym przodkiem) ──────────────────
  const parentsOf = new Map<string, string[]>();
  for (const l of tree.parentLinks) {
    parentsOf.set(l.childId, [...(parentsOf.get(l.childId) ?? []), l.parentId]);
  }
  const reported = new Set<string>();
  for (const start of tree.persons) {
    const stack = [...(parentsOf.get(start.id) ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (id === start.id) {
        if (!reported.has(start.id)) {
          reported.add(start.id);
          add("error", "OWN_ANCESTOR", `${name(start)} jest w drzewie swoim własnym przodkiem – sprawdź relacje rodzic–dziecko.`, start.id);
        }
        break;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(parentsOf.get(id) ?? []));
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
}
