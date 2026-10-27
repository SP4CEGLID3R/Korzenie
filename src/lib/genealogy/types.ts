// Uproszczony obraz drzewa, niezależny od bazy danych. Na nim działają
// sprawdzanie spójności, wizualizacja i eksport GEDCOM – dzięki temu da się
// je łatwo testować bez bazy.

import type { GenDate } from "./dates";

export type Sex = "MALE" | "FEMALE" | "UNKNOWN";
export type LivingStatus = "AUTO" | "LIVING" | "DECEASED";
export type NameType = "BIRTH" | "MARRIED" | "RECORDED" | "ALIAS";
export type PersonalEventType =
  | "BIRTH"
  | "BAPTISM"
  | "DEATH"
  | "BURIAL"
  | "RESIDENCE"
  | "EMIGRATION"
  | "OCCUPATION"
  | "OTHER";
export type CoupleEventType = "MARRIAGE" | "DIVORCE";
export type EventType = PersonalEventType | CoupleEventType;
export type ParentChildType = "BIOLOGICAL" | "ADOPTIVE" | "FOSTER" | "STEP" | "UNKNOWN";
export type UnionType = "MARRIAGE" | "PARTNERSHIP" | "UNKNOWN";

export type SnapshotName = {
  type: NameType;
  isPrimary: boolean;
  givenNames: string;
  surname: string | null;
  birthSurname: string | null;
};

export type SnapshotPlace = {
  id: string;
  name: string;
  jurisdiction: string | null;
  parish: string | null;
  county: string | null;
  province: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type SnapshotEvent = GenDate & {
  id: string;
  type: EventType;
  place: SnapshotPlace | null;
  description: string | null;
};

export type SnapshotPerson = {
  id: string;
  sex: Sex;
  livingStatus: LivingStatus;
  notes: string | null;
  names: SnapshotName[];
  /** Wydarzenia osobiste (osoba jest ich „bohaterem”). */
  events: SnapshotEvent[];
};

export type SnapshotParentLink = {
  parentId: string;
  childId: string;
  type: ParentChildType;
};

export type SnapshotUnion = {
  id: string;
  partner1Id: string;
  partner2Id: string;
  type: UnionType;
  /** Ślub, rozwód. */
  events: SnapshotEvent[];
};

export type TreeSnapshot = {
  persons: SnapshotPerson[];
  parentLinks: SnapshotParentLink[];
  unions: SnapshotUnion[];
};
