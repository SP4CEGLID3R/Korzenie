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
