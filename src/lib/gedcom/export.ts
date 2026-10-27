// Eksport drzewa do GEDCOM 5.5.1 (UTF-8) – żeby użytkownik w każdej chwili
// mógł zabrać swoje dane do innego programu.

import { toGedcomDate } from "@/lib/genealogy/dates";
import { livingStatusMap } from "@/lib/privacy/living";
import type {
  EventType,
  ParentChildType,
  SnapshotEvent,
  SnapshotPerson,
  TreeSnapshot,
} from "@/lib/genealogy/types";

export type ExportOptions = {
  /** Osoby żyjące jako „Osoba żyjąca”, bez dat i miejsc (do przekazania pliku innym). */
  hideLiving?: boolean;
  treeName?: string;
  now?: Date;
};

const EVENT_TAG: Record<EventType, string> = {
  BIRTH: "BIRT",
  BAPTISM: "CHR",
  DEATH: "DEAT",
  BURIAL: "BURI",
  RESIDENCE: "RESI",
  EMIGRATION: "EMIG",
  OCCUPATION: "OCCU",
  OTHER: "EVEN",
  MARRIAGE: "MARR",
  DIVORCE: "DIV",
};

const PEDI: Partial<Record<ParentChildType, string>> = {
  BIOLOGICAL: "birth",
  ADOPTIVE: "adopted",
  FOSTER: "foster",
};

const MAX_LINE = 240;

class Writer {
  lines: string[] = [];

  /** Linia GEDCOM; długie i wielowierszowe teksty dzieli na CONT/CONC. */
  line(level: number, tag: string, value?: string | null, xref?: string) {
    const prefix = xref ? `${level} ${xref} ${tag}` : `${level} ${tag}`;
    if (value === undefined || value === null || value === "") {
      this.lines.push(prefix);
      return;
    }
    const clean = value.replace(/\r\n?/g, "\n");
    const [first, ...more] = clean.split("\n");
    this.chunked(prefix, first, level + 1);
    for (const l of more) this.chunked(`${level + 1} CONT`, l, level + 1);
  }

  private chunked(prefix: string, text: string, concLevel: number) {
    // „@” w tekście trzeba podwoić (inaczej wygląda jak odnośnik).
    const t = text.replace(/@/g, "@@");
    if (t.length <= MAX_LINE) {
      this.lines.push(t ? `${prefix} ${t}` : prefix);
      return;
    }
    let rest = t;
    let p = prefix;
    while (rest.length > 0) {
      // Nie tniemy w środku „@@” ani tuż przed spacją (część programów ją gubi).
      let cut = Math.min(MAX_LINE, rest.length);
      while (cut < rest.length && cut > 1 && (rest[cut - 1] === "@" || rest[cut] === " ")) cut--;
      this.lines.push(`${p} ${rest.slice(0, cut)}`);
      rest = rest.slice(cut);
      p = `${concLevel} CONC`;
    }
  }

  toString() {
    return this.lines.join("\r\n") + "\r\n";
  }
}

function placeText(e: SnapshotEvent) {
  if (!e.place) return null;
  return [e.place.name, e.place.jurisdiction].filter(Boolean).join(", ");
}

function coord(n: number, pos: string, neg: string) {
  return `${n < 0 ? neg : pos}${Math.abs(n)}`;
}

function writeEvent(w: Writer, level: number, e: SnapshotEvent) {
  const tag = EVENT_TAG[e.type];
  if (e.type === "OCCUPATION") {
    // Zawód: treść jest wartością tagu OCCU.
    w.line(level, tag, e.description?.split("\n")[0] ?? "");
  } else {
    w.line(level, tag, e.type === "DEATH" && e.dateYear === null && !e.place ? "Y" : undefined);
    if (e.type === "OTHER") w.line(level + 1, "TYPE", e.description?.split("\n")[0] || "Inne");
  }
  const date = toGedcomDate(e);
  if (date) w.line(level + 1, "DATE", date);
  const plac = placeText(e);
  if (plac) {
    w.line(level + 1, "PLAC", plac);
    if (e.place?.latitude != null && e.place.longitude != null) {
      w.line(level + 2, "MAP");
      w.line(level + 3, "LATI", coord(e.place.latitude, "N", "S"));
      w.line(level + 3, "LONG", coord(e.place.longitude, "E", "W"));
    }
  }
  if (e.place?.parish) w.line(level + 1, "NOTE", `Parafia: ${e.place.parish}`);
  const note =
    e.type === "OCCUPATION" || e.type === "OTHER"
      ? e.description?.split("\n").slice(1).join("\n")
      : e.description;
  if (note) w.line(level + 1, "NOTE", note);
}

type Family = {
  xref: string;
  husband: string | null;
  wife: string | null;
  children: string[];
  events: SnapshotEvent[];
};

export function exportGedcom(tree: TreeSnapshot, options: ExportOptions = {}): string {
  const now = options.now ?? new Date();
  const w = new Writer();
  const personXref = new Map<string, string>();
  tree.persons.forEach((p, i) => personXref.set(p.id, `@I${i + 1}@`));
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const living = livingStatusMap(tree, now.getFullYear());
  const hidden = new Set(options.hideLiving ? tree.persons.filter((p) => living.get(p.id)).map((p) => p.id) : []);

  // ── Rodziny: pary z tabeli związków + rodzice wspólnych dzieci ──
  const families = new Map<string, Family>();
  const familyOfChild = new Map<string, { family: Family; type: ParentChildType }[]>();
  const keyOf = (ids: string[]) => [...ids].sort().join("+");
  const getFamily = (parentIds: string[]) => {
    const key = keyOf(parentIds);
    let f = families.get(key);
    if (!f) {
      f = { xref: `@F${families.size + 1}@`, husband: null, wife: null, children: [], events: [] };
      // HUSB/WIFE według płci; przy nieznanej płci – wolne miejsce.
      for (const id of parentIds) {
        const sex = byId.get(id)?.sex;
        if (sex === "FEMALE" && !f.wife) f.wife = id;
        else if (sex === "MALE" && !f.husband) f.husband = id;
        else if (!f.husband) f.husband = id;
        else f.wife = id;
      }
      families.set(key, f);
    }
    return f;
  };

  for (const u of tree.unions) {
    if (!byId.has(u.partner1Id) || !byId.has(u.partner2Id)) continue;
    getFamily([u.partner1Id, u.partner2Id]).events.push(...u.events);
  }

  const parentsOf = new Map<string, { id: string; type: ParentChildType }[]>();
  for (const l of tree.parentLinks) {
    if (!byId.has(l.parentId) || !byId.has(l.childId)) continue;
    parentsOf.set(l.childId, [...(parentsOf.get(l.childId) ?? []), { id: l.parentId, type: l.type }]);
  }
  for (const [childId, parents] of parentsOf) {
    // Najpierw para rodziców (biologicznych, jeśli są), pozostali – osobne rodziny.
    const sorted = [...parents].sort((a, b) => Number(b.type === "BIOLOGICAL") - Number(a.type === "BIOLOGICAL"));
    const groups = [sorted.slice(0, 2), ...sorted.slice(2).map((p) => [p])];
    for (const g of groups) {
      const f = getFamily(g.map((p) => p.id));
      f.children.push(childId);
      familyOfChild.set(childId, [...(familyOfChild.get(childId) ?? []), { family: f, type: g[0].type }]);
    }
  }

  const spouseFamilies = new Map<string, Family[]>();
  for (const f of families.values()) {
    for (const id of [f.husband, f.wife]) {
      if (id) spouseFamilies.set(id, [...(spouseFamilies.get(id) ?? []), f]);
    }
  }

  // ── Nagłówek ──
  w.line(0, "HEAD");
  w.line(1, "SOUR", "KORZENIE");
  w.line(2, "NAME", "Korzenie");
  w.line(1, "DATE", toGedcomDate({
    dateQualifier: "EXACT",
    dateYear: now.getUTCFullYear(),
    dateMonth: now.getUTCMonth() + 1,
    dateDay: now.getUTCDate(),
    dateEndYear: null,
    dateEndMonth: null,
    dateEndDay: null,
    dateText: null,
  }));
  if (options.treeName) w.line(1, "FILE", `${options.treeName}.ged`);
  w.line(1, "GEDC");
  w.line(2, "VERS", "5.5.1");
  w.line(2, "FORM", "LINEAGE-LINKED");
  w.line(1, "CHAR", "UTF-8");
  w.line(1, "SUBM", "@U1@");
  w.line(0, "SUBM", undefined, "@U1@");
  w.line(1, "NAME", "Użytkownik serwisu Korzenie");

  // ── Osoby ──
  for (const p of tree.persons) {
    writePerson(w, p, personXref.get(p.id)!, hidden.has(p.id));
    for (const { family, type } of familyOfChild.get(p.id) ?? []) {
      w.line(1, "FAMC", family.xref);
      const pedi = PEDI[type];
      if (pedi && !hidden.has(p.id)) w.line(2, "PEDI", pedi);
    }
    for (const f of spouseFamilies.get(p.id) ?? []) w.line(1, "FAMS", f.xref);
  }

  // ── Rodziny ──
  for (const f of families.values()) {
    w.line(0, "FAM", undefined, f.xref);
    if (f.husband) w.line(1, "HUSB", personXref.get(f.husband)!);
    if (f.wife) w.line(1, "WIFE", personXref.get(f.wife)!);
    const anyHidden = [f.husband, f.wife].some((id) => id && hidden.has(id));
    if (!anyHidden) for (const e of f.events) writeEvent(w, 1, e);
    for (const c of f.children) w.line(1, "CHIL", personXref.get(c)!);
  }

  w.line(0, "TRLR");
  return w.toString();
}

function writePerson(w: Writer, p: SnapshotPerson, xref: string, hidden: boolean) {
  w.line(0, "INDI", undefined, xref);
  if (hidden) {
    w.line(1, "NAME", "Osoba żyjąca");
    w.line(1, "SEX", p.sex === "MALE" ? "M" : p.sex === "FEMALE" ? "F" : "U");
    return;
  }

  const gedName = (given: string, surname: string | null) =>
    surname ? `${given} /${surname}/`.trim() : given;
  const writeName = (given: string, surname: string | null, type?: string) => {
    w.line(1, "NAME", gedName(given, surname));
    if (type) w.line(2, "TYPE", type);
    if (given) w.line(2, "GIVN", given);
    if (surname) w.line(2, "SURN", surname);
  };

  const primary = p.names.find((n) => n.isPrimary) ?? p.names[0];
  if (primary) {
    if (primary.birthSurname && primary.birthSurname !== primary.surname) {
      // Najpierw nazwisko rodowe (tak oczekuje większość programów), potem po ślubie.
      writeName(primary.givenNames, primary.birthSurname, "birth");
      writeName(primary.givenNames, primary.surname, "married");
    } else {
      writeName(primary.givenNames, primary.surname, primary.type === "MARRIED" ? "married" : undefined);
    }
  }
  for (const n of p.names) {
    if (n === primary) continue;
    writeName(n.givenNames, n.surname, n.type === "MARRIED" ? "married" : n.type === "BIRTH" ? "birth" : "aka");
  }

  w.line(1, "SEX", p.sex === "MALE" ? "M" : p.sex === "FEMALE" ? "F" : "U");
  for (const e of p.events) writeEvent(w, 1, e);
  if (p.livingStatus === "DECEASED" && !p.events.some((e) => e.type === "DEATH")) w.line(1, "DEAT", "Y");
  if (p.notes) w.line(1, "NOTE", p.notes);
}
