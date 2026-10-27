"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { AccessError, requirePersonInTree, requireTreeEditor } from "@/lib/trees/access";
import {
  formValues,
  isEventEmpty,
  PARENT_CHILD_TYPES,
  parseEventForm,
  parsePersonForm,
  type ActionState,
} from "@/lib/trees/forms";
import {
  addPersonalEvent,
  createPerson,
  dateColumns,
  deletePerson,
  ensureUnion,
  isAncestor,
  linkParent,
  primaryNameData,
  resolvePlace,
} from "@/lib/trees/write";

const RELATIONS = ["parent", "child", "spouse"] as const;
type Relation = (typeof RELATIONS)[number];
const parentTypeSchema = z.enum(PARENT_CHILD_TYPES).catch("BIOLOGICAL");
const uuid = z.uuid();

const personUrl = (treeId: string, personId: string) => `/drzewa/${treeId}/osoby/${personId}`;

/**
 * Przed przekierowaniem odświeżamy całe drzewo (także nagłówek z liczbą osób
 * i ostrzeżeń, który jest w układzie strony i sam by się nie przeładował).
 */
function revalidateTree(treeId: string) {
  revalidatePath(`/drzewa/${treeId}`, "layout");
}

/** Zamienia brak uprawnień na komunikat w formularzu (zamiast strony błędu). */
async function guarded(fd: FormData, fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    if (e instanceof AccessError) return { error: e.message, values: formValues(fd) };
    throw e;
  }
}

/** Łączy dwie osoby relacją, pilnując, żeby nie powstała pętla przodków. */
async function relate(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  treeId: string,
  personId: string,
  relation: Relation,
  otherId: string,
  parentType: (typeof PARENT_CHILD_TYPES)[number],
) {
  if (personId === otherId) return "Nie można połączyć osoby z nią samą.";
  if (relation === "spouse") {
    await ensureUnion(tx, treeId, personId, otherId);
    return null;
  }
  const [parentId, childId] = relation === "parent" ? [otherId, personId] : [personId, otherId];
  if (await isAncestor(tx, childId, parentId)) {
    return "Ta relacja utworzyłaby pętlę – dziecko byłoby przodkiem własnego rodzica.";
  }
  const parents = await tx.parentChild.count({ where: { childId, parentId: { not: parentId } } });
  if (parentType === "BIOLOGICAL" && parents >= 2) {
    const bio = await tx.parentChild.count({ where: { childId, type: "BIOLOGICAL", parentId: { not: parentId } } });
    if (bio >= 2) return "Ta osoba ma już dwoje rodziców biologicznych.";
  }
  await linkParent(tx, parentId, childId, parentType);
  return null;
}

// ─────────────────────────────── Osoby ───────────────────────────────

export async function createPersonAction(treeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(fd, async () => {
    await requireTreeEditor(treeId);
    const values = formValues(fd);
    const person = parsePersonForm(fd);
    if (!person.ok) return { error: person.error, values };
    const birth = parseEventForm(fd, "birth_", "BIRTH");
    if (!birth.ok) return { error: `Urodzenie – ${birth.error}`, values };
    const death = parseEventForm(fd, "death_", "DEATH");
    if (!death.ok) return { error: `Zgon – ${death.error}`, values };

    const relation = z.enum(RELATIONS).safeParse(fd.get("rel"));
    const relTo = uuid.safeParse(fd.get("relTo"));
    const secondParent = uuid.safeParse(fd.get("secondParent"));
    const parentType = parentTypeSchema.parse(fd.get("parentType"));
    if (relation.success && relTo.success) await requirePersonInTree(treeId, relTo.data);
    if (secondParent.success) await requirePersonInTree(treeId, secondParent.data);

    let error: string | null = null;
    const created = await db.$transaction(async (tx) => {
      const p = await createPerson(tx, treeId, person.data);
      if (!isEventEmpty(birth.data)) await addPersonalEvent(tx, treeId, p.id, birth.data);
      if (!isEventEmpty(death.data)) await addPersonalEvent(tx, treeId, p.id, death.data);
      if (person.data.livingStatus === "AUTO" && !isEventEmpty(death.data)) {
        await tx.person.update({ where: { id: p.id }, data: { livingStatus: "DECEASED" } });
      }
      if (relation.success && relTo.success) {
        // „rel” opisuje, kim NOWA osoba jest dla osoby relTo.
        const kind: Relation =
          relation.data === "parent" ? "child" : relation.data === "child" ? "parent" : "spouse";
        error = await relate(tx, treeId, p.id, kind, relTo.data, parentType);
        if (!error && relation.data === "child" && secondParent.success && secondParent.data !== relTo.data) {
          error = await relate(tx, treeId, p.id, "parent", secondParent.data, parentType);
        }
        if (error) throw new RelationError(error);
      }
      const homeless = await tx.tree.findUnique({ where: { id: treeId }, select: { homePersonId: true } });
      if (!homeless?.homePersonId) {
        await tx.tree.update({ where: { id: treeId }, data: { homePersonId: p.id } });
      }
      return p;
    }).catch((e) => {
      if (e instanceof RelationError) {
        error = e.message;
        return null;
      }
      throw e;
    });

    if (!created) return { error: error ?? "Nie udało się zapisać osoby.", values };
    revalidateTree(treeId);
    redirect(personUrl(treeId, created.id));
  });
}

class RelationError extends Error {}

export async function updatePersonAction(
  treeId: string,
  personId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return guarded(fd, async () => {
    await requireTreeEditor(treeId);
    await requirePersonInTree(treeId, personId);
    const values = formValues(fd);
    const person = parsePersonForm(fd);
    if (!person.ok) return { error: person.error, values };

    await db.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: personId },
        data: { sex: person.data.sex, livingStatus: person.data.livingStatus, notes: person.data.notes },
      });
      const primary = await tx.personName.findFirst({ where: { personId, isPrimary: true } });
      const data = primaryNameData(person.data);
      if (primary) await tx.personName.update({ where: { id: primary.id }, data });
      else await tx.personName.create({ data: { ...data, personId } });
    });
    revalidateTree(treeId);
    redirect(personUrl(treeId, personId));
  });
}

export async function deletePersonAction(treeId: string, personId: string) {
  await requireTreeEditor(treeId);
  await requirePersonInTree(treeId, personId);
  await db.$transaction((tx) => deletePerson(tx, treeId, personId));
  revalidateTree(treeId);
  redirect(`/drzewa/${treeId}/osoby`);
}

export async function setHomePersonAction(treeId: string, personId: string) {
  await requireTreeEditor(treeId);
  await requirePersonInTree(treeId, personId);
  await db.tree.update({ where: { id: treeId }, data: { homePersonId: personId } });
  revalidateTree(treeId);
  redirect(`/drzewa/${treeId}`);
}

// ─────────────────────────────── Wydarzenia ───────────────────────────────

export async function addEventAction(
  treeId: string,
  personId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return guarded(fd, async () => {
    await requireTreeEditor(treeId);
    await requirePersonInTree(treeId, personId);
    const values = formValues(fd);
    const event = parseEventForm(fd);
    if (!event.ok) return { error: event.error, values };
    await db.$transaction(async (tx) => {
      await addPersonalEvent(tx, treeId, personId, event.data);
      if (event.data.type === "DEATH" || event.data.type === "BURIAL") {
        await tx.person.updateMany({ where: { id: personId, livingStatus: "AUTO" }, data: { livingStatus: "DECEASED" } });
      }
    });
    refresh();
    return { message: "Dodano wydarzenie.", savedAt: Date.now() };
  });
}

async function requireOwnEvent(treeId: string, personId: string, eventId: string) {
  if (!uuid.safeParse(eventId).success) throw new AccessError("Nie znaleziono wydarzenia.");
  const event = await db.event.findFirst({
    where: { id: eventId, treeId, unionId: null, participants: { some: { personId, role: "PRINCIPAL" } } },
    select: { id: true },
  });
  if (!event) throw new AccessError("Nie znaleziono wydarzenia.");
}

export async function updateEventAction(
  treeId: string,
  personId: string,
  eventId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return guarded(fd, async () => {
    await requireTreeEditor(treeId);
    await requireOwnEvent(treeId, personId, eventId);
    const values = formValues(fd);
    const event = parseEventForm(fd);
    if (!event.ok) return { error: event.error, values };
    await db.$transaction(async (tx) => {
      const placeId = await resolvePlace(tx, treeId, event.data.place);
      await tx.event.update({
        where: { id: eventId },
        data: { type: event.data.type, ...dateColumns(event.data.date), placeId, description: event.data.description },
      });
    });
    refresh();
    return { message: "Zapisano zmiany.", savedAt: Date.now() };
  });
}

export async function deleteEventAction(treeId: string, personId: string, eventId: string) {
  await requireTreeEditor(treeId);
  await requireOwnEvent(treeId, personId, eventId);
  await db.event.delete({ where: { id: eventId } });
  refresh();
}

// ─────────────────────────────── Relacje ───────────────────────────────

export async function linkExistingAction(
  treeId: string,
  personId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return guarded(fd, async () => {
    await requireTreeEditor(treeId);
    await requirePersonInTree(treeId, personId);
    const values = formValues(fd);
    const relation = z.enum(RELATIONS).safeParse(fd.get("relation"));
    const other = uuid.safeParse(fd.get("otherId"));
    if (!relation.success) return { error: "Wybierz rodzaj relacji.", values };
    if (!other.success) return { error: "Wybierz osobę z listy.", values };
    await requirePersonInTree(treeId, other.data);

    // „relation” opisuje, kim WYBRANA osoba jest dla bieżącej.
    const error = await db.$transaction((tx) =>
      relate(tx, treeId, personId, relation.data, other.data, parentTypeSchema.parse(fd.get("parentType"))),
    );
    if (error) return { error, values };
    refresh();
    return { message: "Połączono osoby.", savedAt: Date.now() };
  });
}

export async function unlinkParentAction(treeId: string, parentId: string, childId: string) {
  await requireTreeEditor(treeId);
  await requirePersonInTree(treeId, parentId);
  await requirePersonInTree(treeId, childId);
  await db.parentChild.deleteMany({ where: { parentId, childId } });
  refresh();
}

export async function setParentTypeAction(treeId: string, parentId: string, childId: string, fd: FormData) {
  await requireTreeEditor(treeId);
  await requirePersonInTree(treeId, childId);
  await db.parentChild.updateMany({
    where: { parentId, childId, child: { treeId } },
    data: { type: parentTypeSchema.parse(fd.get("type")) },
  });
  refresh();
}

export async function unlinkUnionAction(treeId: string, unionId: string) {
  await requireTreeEditor(treeId);
  await db.union.deleteMany({ where: { id: unionId, treeId } });
  refresh();
}

/** Data i miejsce ślubu (jedno wydarzenie „ślub” na związek). */
export async function saveMarriageAction(
  treeId: string,
  unionId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  return guarded(fd, async () => {
    await requireTreeEditor(treeId);
    const values = formValues(fd);
    const union = await db.union.findFirst({ where: { id: unionId, treeId }, select: { id: true } });
    if (!union) return { error: "Nie znaleziono związku.", values };
    const event = parseEventForm(fd, "", "MARRIAGE");
    if (!event.ok) return { error: event.error, values };

    await db.$transaction(async (tx) => {
      const existing = await tx.event.findFirst({ where: { unionId, type: "MARRIAGE" }, select: { id: true } });
      if (isEventEmpty(event.data)) {
        if (existing) await tx.event.delete({ where: { id: existing.id } });
        return;
      }
      const placeId = await resolvePlace(tx, treeId, event.data.place);
      const data = { ...dateColumns(event.data.date), placeId, description: event.data.description };
      if (existing) await tx.event.update({ where: { id: existing.id }, data });
      else await tx.event.create({ data: { ...data, treeId, unionId, type: "MARRIAGE" } });
    });
    refresh();
    return { message: "Zapisano ślub.", savedAt: Date.now() };
  });
}

// ─────────────────────────── „Zacznij od siebie” ───────────────────────────

const START_PEOPLE = [
  { key: "me", sex: null, label: "Ty" },
  { key: "father", sex: "MALE", label: "Tata" },
  { key: "mother", sex: "FEMALE", label: "Mama" },
  { key: "ff", sex: "MALE", label: "Dziadek ze strony taty" },
  { key: "fm", sex: "FEMALE", label: "Babcia ze strony taty" },
  { key: "mf", sex: "MALE", label: "Dziadek ze strony mamy" },
  { key: "mm", sex: "FEMALE", label: "Babcia ze strony mamy" },
] as const;

/** Tworzy pierwsze osoby drzewa: Ciebie, rodziców i dziadków (wypełnione pola). */
export async function startFromSelfAction(treeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  return guarded(fd, async () => {
    const { tree } = await requireTreeEditor(treeId);
    const values = formValues(fd);
    if (await db.person.count({ where: { treeId } })) {
      return { error: "To drzewo ma już osoby – dodawaj kolejne z karty osoby.", values };
    }

    type Entry = { key: string; person: ReturnType<typeof parsePersonForm>; birth: ReturnType<typeof parseEventForm> };
    const entries: Entry[] = [];
    for (const { key, sex, label } of START_PEOPLE) {
      const given = String(fd.get(`${key}_givenNames`) ?? "").trim();
      const surname = String(fd.get(`${key}_surname`) ?? "").trim();
      if (key !== "me" && !given && !surname) continue;
      if (sex) fd.set(`${key}_sex`, sex);
      if (!given) fd.set(`${key}_givenNames`, key === "me" ? "" : "NN");
      const person = parsePersonForm(fd, `${key}_`);
      if (!person.ok) return { error: `${label}: ${person.error}`, values };
      const birth = parseEventForm(fd, `${key}_birth_`, "BIRTH");
      if (!birth.ok) return { error: `${label}: ${birth.error}`, values };
      entries.push({ key, person, birth });
    }

    await db.$transaction(async (tx) => {
      const ids: Record<string, string> = {};
      for (const e of entries) {
        if (!e.person.ok || !e.birth.ok) continue;
        const p = await createPerson(tx, treeId, e.person.data);
        ids[e.key] = p.id;
        if (!isEventEmpty(e.birth.data)) await addPersonalEvent(tx, treeId, p.id, e.birth.data);
      }
      const pairs: [string, string, string][] = [
        ["father", "mother", "me"],
        ["ff", "fm", "father"],
        ["mf", "mm", "mother"],
      ];
      for (const [a, b, childKey] of pairs) {
        const childId = ids[childKey];
        for (const parentKey of [a, b]) {
          if (ids[parentKey] && childId) await linkParent(tx, ids[parentKey], childId);
        }
        if (ids[a] && ids[b]) await ensureUnion(tx, treeId, ids[a], ids[b]);
      }
      await tx.tree.update({ where: { id: tree.id }, data: { homePersonId: ids.me } });
    });
    revalidateTree(treeId);
    redirect(`/drzewa/${treeId}`);
  });
}
