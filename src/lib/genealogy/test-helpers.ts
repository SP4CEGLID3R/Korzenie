// Pomocnicze funkcje do budowania małych drzew w testach.
import { EMPTY_DATE, parsePolishDate } from "./dates";
import type {
  EventType,
  Sex,
  SnapshotEvent,
  SnapshotPerson,
  SnapshotUnion,
  TreeSnapshot,
} from "./types";

let seq = 0;

export function ev(type: EventType, date: string, place?: string): SnapshotEvent {
  const r = parsePolishDate(date);
  if (!r.ok) throw new Error(r.error);
  return {
    ...EMPTY_DATE,
    ...r.date,
    id: `e${++seq}`,
    type,
    description: null,
    place: place
      ? { id: `pl-${place}`, name: place, jurisdiction: null, parish: null, county: null, province: null, country: null, latitude: null, longitude: null }
      : null,
  };
}

export function person(
  id: string,
  given: string,
  surname: string,
  sex: Sex,
  events: SnapshotEvent[] = [],
  extra: Partial<SnapshotPerson> = {},
): SnapshotPerson {
  return {
    id,
    sex,
    livingStatus: "AUTO",
    notes: null,
    names: [{ type: "BIRTH", isPrimary: true, givenNames: given, surname, birthSurname: null }],
    events,
    ...extra,
  };
}

export function union(id: string, a: string, b: string, events: SnapshotEvent[] = []): SnapshotUnion {
  return { id, partner1Id: a, partner2Id: b, type: "MARRIAGE", events };
}

export function tree(t: Partial<TreeSnapshot>): TreeSnapshot {
  return { persons: [], parentLinks: [], unions: [], ...t };
}
