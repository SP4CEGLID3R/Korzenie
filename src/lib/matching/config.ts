// Wszystkie wagi i progi silnika dopasowań w jednym miejscu.
// Zmieniając je, uruchom `npm test` – testy na realistycznych przykładach
// pokażą, czy propozycje nadal mają sens. Każda zmiana = nowa wersja algorytmu
// (zapisujemy ją przy dopasowaniu, żeby wiedzieć, czym je policzono).

export const MATCH_ALGORITHM_VERSION = "2026-10-a";

export const MATCH_CONFIG = {
  /** Ile „waży” zgodność danego pola (dowolne jednostki, liczą się proporcje). */
  weights: {
    surname: 22,
    givenNames: 20,
    birthYear: 16,
    deathYear: 10,
    eventYear: 12, // np. rok ślubu – czy pasuje do wieku osoby
    birthPlace: 12,
    deathPlace: 8,
    fatherGiven: 14,
    motherGiven: 10,
    /** Nazwisko rodowe matki – bardzo silny sygnał w polskich metrykach. */
    motherMaiden: 18,
    spouseGiven: 10,
    spouseSurname: 8,
  },

  /**
   * Ile łącznej wagi porównanych pól uznajemy za „pełny obraz”. Gdy porównać
   * da się mniej (np. tylko imię, nazwisko i rok), wynik jest odpowiednio niższy –
   * samo „Jan Kowalski, 1850” to za mało, żeby mówić o silnej propozycji.
   */
  coverageReference: 100,
  /** Jaka część wyniku zależy od zakresu porównanych danych (reszta – od zgodności). */
  coverageShare: 0.7,

  years: {
    /** Różnica do tylu lat nie obniża wyniku (daty w metrykach bywają nieprecyzyjne). */
    noPenalty: 2,
    /** Od tylu lat różnicy pole uznajemy za niezgodne. */
    zeroAt: 10,
  },

  places: {
    sameParish: 1,
    /** Miejscowość w promieniu `nearbyKm` (gdy znamy współrzędne). */
    nearby: 0.7,
    nearbyKm: 15,
    sameRegion: 0.4,
  },

  names: {
    /** Jaro–Winkler od tej wartości traktujemy jako wariant pisowni. */
    jaroWinklerVariant: 0.92,
    /** Przy wspólnym kodzie Daitch–Mokotoff wystarczy niższe podobieństwo. */
    jaroWinklerWithSoundex: 0.82,
  },

  /** Niezgodna płeć mnoży wynik przez tę wartość. */
  sexMismatchFactor: 0.3,
  /** Maksymalny wynik, gdy imię lub nazwisko się nie zgadza. */
  capOnNameMismatch: 40,
  /** Maksymalny wynik, gdy oprócz imienia i nazwiska nie ma czego porównać. */
  capWithoutContext: 45,

  thresholds: {
    strong: 80,
    possible: 50,
  },
} as const;

export type MatchConfig = typeof MATCH_CONFIG;
