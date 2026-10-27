// Reguła prywatności (RODO): osobę urodzoną mniej niż 100 lat temu, bez daty
// śmierci, traktujemy jako żyjącą. W udostępnionych drzewach pokazujemy ją
// wyłącznie jako „Osoba żyjąca”.
//
// Gdy nie da się ustalić roku urodzenia, zakładamy, że osoba żyje – lepiej
// ukryć za dużo niż ujawnić dane żyjącej osoby.

export const LIVING_THRESHOLD_YEARS = 100;

export type LivingStatus = "AUTO" | "LIVING" | "DECEASED";
export type DateQualifier = "EXACT" | "ABOUT" | "BEFORE" | "AFTER" | "BETWEEN";

export type LivingCheckEvent = {
  type: string; // EventType z bazy, np. "BIRTH", "DEATH"
  dateQualifier?: DateQualifier | null;
  dateYear?: number | null;
  dateEndYear?: number | null;
};

export type LivingCheckPerson = {
  livingStatus: LivingStatus;
  events: LivingCheckEvent[];
};

const BIRTH_EVENTS = new Set(["BIRTH", "BAPTISM"]);
const DEATH_EVENTS = new Set(["DEATH", "BURIAL"]);

/** Margines dla dat przybliżonych („ok. 1925” mogło oznaczać 1927). */
const ABOUT_MARGIN_YEARS = 2;

/**
 * Najpóźniejszy możliwy rok urodzenia wynikający z wydarzenia
 * albo null, gdy data nic nie mówi o górnej granicy.
 */
export function latestPossibleBirthYear(event: LivingCheckEvent): number | null {
  const year = event.dateYear ?? null;
  switch (event.dateQualifier ?? "EXACT") {
    case "EXACT":
      return year;
    case "ABOUT":
      return year === null ? null : year + ABOUT_MARGIN_YEARS;
    case "BEFORE":
      return year;
    case "BETWEEN":
      return event.dateEndYear ?? year;
    case "AFTER":
      // „Urodzony po 1900” – mógł urodzić się dowolnie później.
      return null;
  }
}

/** Czy osobę należy traktować jako żyjącą (i ukrywać jej dane przed obcymi). */
export function isPresumedLiving(
  person: LivingCheckPerson,
  currentYear: number = new Date().getFullYear(),
): boolean {
  if (person.livingStatus === "LIVING") return true;
  if (person.livingStatus === "DECEASED") return false;

  // Jakiekolwiek wydarzenie zgonu lub pochówku (nawet bez daty) przesądza sprawę.
  if (person.events.some((e) => DEATH_EVENTS.has(e.type))) return false;

  const birthYears = person.events
    .filter((e) => BIRTH_EVENTS.has(e.type))
    .map(latestPossibleBirthYear)
    .filter((y): y is number => y !== null);

  if (birthYears.length === 0) return true;

  // Przy kilku sprzecznych datach bierzemy najwcześniejszą górną granicę:
  // chrzest „przed 1900” mówi, że osoba urodziła się najpóźniej w 1900.
  const latestBirth = Math.min(...birthYears);
  return currentYear - latestBirth < LIVING_THRESHOLD_YEARS;
}

/**
 * Dziecko urodzone tyle lat temu oznacza, że rodzic na pewno nie żyje
 * (miałby dziś co najmniej ~122 lata). Dzięki temu dziadkowie i pradziadkowie
 * bez własnych dat nie są uznawani za żyjących.
 */
export const DESCENDANT_BIRTH_YEARS_AGO = 110;

type TreeLike = {
  persons: (LivingCheckPerson & { id: string })[];
  parentLinks: { parentId: string; childId: string }[];
};

/** Status „żyjąca” dla każdej osoby w drzewie – z uwzględnieniem dat potomków. */
export function livingStatusMap(tree: TreeLike, currentYear: number = new Date().getFullYear()): Map<string, boolean> {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const children = new Map<string, string[]>();
  for (const l of tree.parentLinks) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l.childId]);

  // Najwcześniejszy pewny (najpóźniejszy możliwy) rok urodzenia wśród potomków.
  const memo = new Map<string, number | null>();
  const earliestDescendantBirth = (id: string, seen: Set<string>): number | null => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return null; // pętla w danych – przerywamy
    seen.add(id);
    let best: number | null = null;
    for (const c of children.get(id) ?? []) {
      const child = byId.get(c);
      if (!child) continue;
      const own = child.events
        .filter((e) => BIRTH_EVENTS.has(e.type))
        .map(latestPossibleBirthYear)
        .filter((y): y is number => y !== null);
      const candidates = [...own, earliestDescendantBirth(c, seen)].filter((y): y is number => y !== null);
      for (const y of candidates) best = best === null ? y : Math.min(best, y);
    }
    memo.set(id, best);
    return best;
  };

  const result = new Map<string, boolean>();
  for (const p of tree.persons) {
    let living = isPresumedLiving(p, currentYear);
    // Tylko dla osób bez znanej daty urodzenia – reguła 100 lat zawsze ma pierwszeństwo.
    const hasBirthYear = p.events.some((e) => BIRTH_EVENTS.has(e.type) && latestPossibleBirthYear(e) !== null);
    if (living && p.livingStatus === "AUTO" && !hasBirthYear) {
      const d = earliestDescendantBirth(p.id, new Set());
      if (d !== null && currentYear - d >= DESCENDANT_BIRTH_YEARS_AGO) living = false;
    }
    result.set(p.id, living);
  }
  return result;
}
