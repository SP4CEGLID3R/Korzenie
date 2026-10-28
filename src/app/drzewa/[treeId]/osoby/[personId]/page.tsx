import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlaceDatalist } from "@/components/tree/fields";
import { db } from "@/lib/db";
import { checkConsistency } from "@/lib/genealogy/consistency";
import { formatGenDate, formatGenDateForInput } from "@/lib/genealogy/dates";
import { displayName, EVENT_LABEL, lifespan, SEX_LABEL } from "@/lib/genealogy/names";
import type { SnapshotEvent, SnapshotPerson } from "@/lib/genealogy/types";
import { livingStatusMap } from "@/lib/privacy/living";
import { getTreeAccess, requirePersonInTree } from "@/lib/trees/access";
import { loadPersonNeighborhood, loadTreePlaces, loadTreeSnapshot } from "@/lib/trees/snapshot";
import {
  addEventAction,
  deleteEventAction,
  deletePersonAction,
  linkExistingAction,
  saveMarriageAction,
  setHomePersonAction,
  setParentTypeAction,
  unlinkParentAction,
  unlinkUnionAction,
  updateEventAction,
} from "../../actions";
import { TaskList } from "@/components/detective/task-list";
import { suggestTasks } from "@/lib/detective/suggest";
import { isGenetekaFetchEnabled } from "@/lib/sources/geneteka";
import { loadConfirmedSources, loadTaskStatuses } from "@/lib/trees/detective";
import { searchPersonAction } from "../../odkrycia/actions";
import { SearchPersonButton } from "../../odkrycia/search-person-button";
import { PARENT_TYPE_LABEL } from "../parent-type-select";
import { ConfirmSubmit, EventForm, LinkExistingForm, type EventDefaults } from "./forms";

export const metadata: Metadata = { title: "Karta osoby" };

export default function PersonPage({ params }: PageProps<"/drzewa/[treeId]/osoby/[personId]">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Wczytywanie karty osoby…</p>}>
      <PersonCard params={params} />
    </Suspense>
  );
}

function eventDefaults(e: SnapshotEvent): EventDefaults {
  return {
    type: e.type,
    date: formatGenDateForInput(e),
    place: e.place?.name,
    placeRegion: e.place?.jurisdiction,
    parish: e.place?.parish,
    description: e.description,
  };
}

function placeLabel(e: SnapshotEvent) {
  if (!e.place) return null;
  const parts = [e.place.name, e.place.jurisdiction].filter(Boolean).join(", ");
  return e.place.parish ? `${parts} (parafia ${e.place.parish})` : parts;
}

async function PersonCard({ params }: { params: Promise<{ treeId: string; personId: string }> }) {
  const { treeId, personId } = await params;
  const { canEdit, tree } = await getTreeAccess(treeId);
  await requirePersonInTree(treeId, personId);
  const [hood, places] = await Promise.all([loadPersonNeighborhood(treeId, personId), loadTreePlaces(treeId)]);

  const byId = new Map(hood.persons.map((p) => [p.id, p]));
  const person = byId.get(personId)!;
  const name = displayName(person.names);
  const living = livingStatusMap(hood).get(personId) ?? true;
  const issues = checkConsistency(hood).filter((i) => i.personIds.includes(personId));

  const parentLinks = hood.parentLinks.filter((l) => l.childId === personId);
  const childLinks = hood.parentLinks.filter((l) => l.parentId === personId);
  const parentIds = new Set(parentLinks.map((l) => l.parentId));
  const siblings = [
    ...new Set(
      hood.parentLinks
        .filter((l) => parentIds.has(l.parentId) && l.childId !== personId)
        .map((l) => l.childId),
    ),
  ]
    .map((id) => byId.get(id))
    .filter((p): p is SnapshotPerson => Boolean(p));
  const hasFather = parentLinks.some((l) => byId.get(l.parentId)?.sex === "MALE");
  const hasMother = parentLinks.some((l) => byId.get(l.parentId)?.sex === "FEMALE");

  const base = `/drzewa/${treeId}`;
  // Id datalisty z miejscami – unikalne dla tej karty (patrz komentarz w fields.tsx).
  const listId = `places-${personId}`;
  const personLink = (p: SnapshotPerson) => (
    <Link href={`${base}/osoby/${p.id}`} className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-accent">
      {displayName(p.names)}
    </Link>
  );
  const years = (p: SnapshotPerson) => {
    const l = lifespan(p);
    return l ? <span className="text-sm text-ink-muted"> ({l})</span> : null;
  };

  return (
    <article className="space-y-8">
      <PlaceDatalist id={listId} places={places} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-semibold tracking-tight">{name}</h2>
          <p className="mt-1 text-ink-muted">
            {[lifespan(person), SEX_LABEL[person.sex] !== "Nieznana" ? SEX_LABEL[person.sex] : null]
              .filter(Boolean)
              .join(" · ")}
            {living && (
              <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-ink">
                osoba żyjąca – ukryta przy udostępnianiu
              </span>
            )}
          </p>
          {person.names.length > 1 && (
            <p className="mt-1 text-sm text-ink-muted">
              Inne formy:{" "}
              {person.names
                .filter((n) => !n.isPrimary)
                .map((n) => [n.givenNames, n.surname].filter(Boolean).join(" "))
                .join(", ")}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/osoby/${personId}/edycja`} className="btn-secondary">
              Edytuj dane
            </Link>
            {tree.homePersonId !== personId && (
              <form action={setHomePersonAction.bind(null, treeId, personId)}>
                <button type="submit" className="btn-ghost">
                  Pokaż drzewo od tej osoby
                </button>
              </form>
            )}
          </div>
        )}
      </header>

      {issues.length > 0 && (
        <section aria-label="Ostrzeżenia" className="rounded-lg border border-danger/40 bg-danger-soft p-4">
          <h3 className="font-semibold text-danger">
            Strażnik spójności: sprawdź daty
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {issues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Wydarzenia ── */}
      <section aria-label="Wydarzenia">
        <h3 className="font-serif text-2xl font-semibold">
          Wydarzenia
        </h3>
        {person.events.length === 0 ? (
          <p className="mt-2 text-ink-muted">Brak wydarzeń.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {person.events.map((e) => (
              <li key={e.id} className="card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p>
                    <span className="font-semibold">{EVENT_LABEL[e.type]}</span>
                    {e.type === "OCCUPATION" && e.description ? `: ${e.description.split("\n")[0]}` : ""}
                    {formatGenDate(e) && <span className="text-ink-muted"> · {formatGenDate(e)}</span>}
                  </p>
                </div>
                {placeLabel(e) && <p className="text-ink-muted">{placeLabel(e)}</p>}
                {e.description && e.type !== "OCCUPATION" && (
                  <p className="mt-1 whitespace-pre-line text-sm">{e.description}</p>
                )}
                {canEdit && (
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    <details className="w-full">
                      <summary className="cursor-pointer text-sm font-semibold text-accent">Edytuj</summary>
                      <div className="mt-3">
                        <EventForm
                          action={updateEventAction.bind(null, treeId, personId, e.id)}
                          listId={listId}
                          defaults={eventDefaults(e)}
                          submitLabel="Zapisz zmiany"
                        />
                      </div>
                    </details>
                    <form action={deleteEventAction.bind(null, treeId, personId, e.id)}>
                      <ConfirmSubmit message="Usunąć to wydarzenie?">Usuń wydarzenie</ConfirmSubmit>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <details className="mt-4 card p-4">
            <summary className="cursor-pointer font-semibold text-accent">Dodaj wydarzenie</summary>
            <div className="mt-4">
              <EventForm
                action={addEventAction.bind(null, treeId, personId)}
                                listId={listId}
                submitLabel="Dodaj wydarzenie"
                resetOnSuccess
              />
            </div>
          </details>
        )}
      </section>

      {/* ── Rodzina ── */}
      <section aria-label="Rodzina" className="space-y-6">
        <h3 className="font-serif text-2xl font-semibold">
          Rodzina
        </h3>

        <div>
          <h4 className="font-semibold">Rodzice</h4>
          {parentLinks.length === 0 && <p className="text-ink-muted">Nie dodano rodziców.</p>}
          <ul className="mt-2 space-y-2">
            {parentLinks.map((l) => {
              const p = byId.get(l.parentId);
              if (!p) return null;
              return (
                <li key={l.parentId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    {personLink(p)}
                    {years(p)}
                    {l.type !== "BIOLOGICAL" && <span className="text-sm text-ink-muted"> – {PARENT_TYPE_LABEL[l.type]}</span>}
                  </span>
                  {canEdit && (
                    <>
                      <form action={setParentTypeAction.bind(null, treeId, l.parentId, personId)} className="flex items-center gap-1">
                        <select aria-label="Pokrewieństwo" name="type" defaultValue={l.type} className="min-h-9 rounded-md border border-line bg-paper-raised px-2 text-sm">
                          {Object.entries(PARENT_TYPE_LABEL).map(([v, label]) => (
                            <option key={v} value={v}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn-ghost min-h-9 px-2 text-sm">
                          Zmień
                        </button>
                      </form>
                      <form action={unlinkParentAction.bind(null, treeId, l.parentId, personId)}>
                        <ConfirmSubmit message="Usunąć powiązanie rodzic–dziecko? Osoby pozostaną w drzewie." className="btn-ghost min-h-9 px-2 text-sm text-danger">
                          Odłącz
                        </ConfirmSubmit>
                      </form>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-2">
              {!hasFather && (
                <Link href={`${base}/osoby/nowa?rel=parent&do=${personId}&plec=M`} className="btn-secondary">
                  + Dodaj ojca
                </Link>
              )}
              {!hasMother && (
                <Link href={`${base}/osoby/nowa?rel=parent&do=${personId}&plec=F`} className="btn-secondary">
                  + Dodaj matkę
                </Link>
              )}
            </div>
          )}
        </div>

        <div>
          <h4 className="font-semibold">Małżonkowie i partnerzy</h4>
          {hood.unions.length === 0 && <p className="text-ink-muted">Brak.</p>}
          <ul className="mt-2 space-y-3">
            {hood.unions.map((u) => {
              const other = byId.get(u.partner1Id === personId ? u.partner2Id : u.partner1Id);
              if (!other) return null;
              const marriage = u.events.find((e) => e.type === "MARRIAGE");
              return (
                <li key={u.id} className="card p-4">
                  <p>
                    {personLink(other)}
                    {years(other)}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {marriage
                      ? `Ślub: ${[formatGenDate(marriage) || "data nieznana", placeLabel(marriage)].filter(Boolean).join(", ")}`
                      : "Brak danych o ślubie."}
                  </p>
                  {canEdit && (
                    <div className="mt-2 flex flex-wrap items-start gap-2">
                      <details className="w-full">
                        <summary className="cursor-pointer text-sm font-semibold text-accent">
                          {marriage ? "Edytuj ślub" : "Dodaj datę i miejsce ślubu"}
                        </summary>
                        <div className="mt-3">
                          <EventForm
                            action={saveMarriageAction.bind(null, treeId, u.id)}
                            listId={listId}
                            defaults={marriage ? eventDefaults(marriage) : {}}
                            fixedType="MARRIAGE"
                            submitLabel="Zapisz ślub"
                          />
                        </div>
                      </details>
                      <form action={unlinkUnionAction.bind(null, treeId, u.id)}>
                        <ConfirmSubmit message="Usunąć ten związek (razem z datą ślubu)? Osoby pozostaną w drzewie." className="btn-ghost min-h-9 px-2 text-sm text-danger">
                          Odłącz
                        </ConfirmSubmit>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <Link href={`${base}/osoby/nowa?rel=spouse&do=${personId}`} className="btn-secondary mt-2">
              + Dodaj małżonka / partnera
            </Link>
          )}
        </div>

        <div>
          <h4 className="font-semibold">Dzieci</h4>
          {childLinks.length === 0 && <p className="text-ink-muted">Brak.</p>}
          <ul className="mt-2 space-y-1">
            {childLinks.map((l) => {
              const c = byId.get(l.childId);
              if (!c) return null;
              return (
                <li key={l.childId}>
                  {personLink(c)}
                  {years(c)}
                  {l.type !== "BIOLOGICAL" && <span className="text-sm text-ink-muted"> – {PARENT_TYPE_LABEL[l.type]}</span>}
                </li>
              );
            })}
          </ul>
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`${base}/osoby/nowa?rel=child&do=${personId}&plec=M`} className="btn-secondary">
                + Dodaj syna
              </Link>
              <Link href={`${base}/osoby/nowa?rel=child&do=${personId}&plec=F`} className="btn-secondary">
                + Dodaj córkę
              </Link>
            </div>
          )}
        </div>

        {siblings.length > 0 && (
          <div>
            <h4 className="font-semibold">Rodzeństwo</h4>
            <ul className="mt-2 space-y-1">
              {siblings.map((s) => (
                <li key={s.id}>
                  {personLink(s)}
                  {years(s)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {canEdit && (
          <Suspense fallback={null}>
            <LinkExisting treeId={treeId} personId={personId} />
          </Suspense>
        )}
      </section>

      <Suspense fallback={null}>
        <NextSteps treeId={treeId} personId={personId} canEdit={canEdit} living={living} />
      </Suspense>

      <Suspense fallback={null}>
        <SourcesSection treeId={treeId} personId={personId} canEdit={canEdit} living={living} />
      </Suspense>

      {person.notes && (
        <section aria-label="Notatki">
          <h3 className="font-serif text-2xl font-semibold">
            Notatki
          </h3>
          <p className="mt-2 whitespace-pre-line">{person.notes}</p>
        </section>
      )}

      {canEdit && (
        <section className="border-t border-line pt-6">
          <form action={deletePersonAction.bind(null, treeId, personId)}>
            <ConfirmSubmit message={`Na pewno usunąć osobę „${name}” razem z jej wydarzeniami i powiązaniami? Tego nie da się cofnąć.`}>
              Usuń osobę z drzewa
            </ConfirmSubmit>
          </form>
        </section>
      )}
    </article>
  );
}

async function LinkExisting({ treeId, personId }: { treeId: string; personId: string }) {
  const snapshot = await loadTreeSnapshot(treeId);
  const options = snapshot.persons
    .filter((p) => p.id !== personId)
    .map((p) => ({ id: p.id, label: [displayName(p.names), lifespan(p)].filter(Boolean).join(", ") }))
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));
  if (options.length === 0) return null;
  return (
    <details className="card p-4">
      <summary className="cursor-pointer font-semibold text-accent">Połącz z osobą, która już jest w drzewie</summary>
      <div className="mt-4">
        <LinkExistingForm action={linkExistingAction.bind(null, treeId, personId)} options={options} />
      </div>
    </details>
  );
}

/** Potwierdzone źródła osoby i propozycje z Odkryć. */
async function SourcesSection({
  treeId,
  personId,
  canEdit,
  living,
}: {
  treeId: string;
  personId: string;
  canEdit: boolean;
  living: boolean;
}) {
  const [citations, pending] = await Promise.all([
    db.citation.findMany({
      where: { personId, recordId: { not: null } },
      include: { record: { include: { source: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.match.count({ where: { personId, status: "PENDING" } }),
  ]);

  return (
    <section aria-label="Źródła" className="space-y-3">
      <h3 className="font-serif text-2xl font-semibold">Źródła i propozycje</h3>
      {citations.length === 0 ? (
        <p className="text-ink-muted">Brak potwierdzonych źródeł.</p>
      ) : (
        <ul className="space-y-2">
          {citations.map((c) => {
            const title = (c.record!.normalized as { title?: string } | null)?.title ?? c.record!.url;
            return (
              <li key={c.id} className="card p-3">
                <a href={c.record!.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
                  {title} ↗
                </a>
                <p className="text-xs text-ink-muted">{c.record!.source.citationText ?? c.record!.source.title}</p>
              </li>
            );
          })}
        </ul>
      )}
      {pending > 0 && (
        <p>
          <Link href={`/drzewa/${treeId}/odkrycia?osoba=${personId}`} className="btn-primary">
            Nowe propozycje do sprawdzenia: {pending}
          </Link>
        </p>
      )}
      {canEdit &&
        (living ? (
          <p className="text-sm text-ink-muted">
            To osoba żyjąca – nie szukamy jej w zewnętrznych źródłach, żeby chronić jej prywatność.
          </p>
        ) : (
          <SearchPersonButton action={searchPersonAction.bind(null, treeId, personId)} />
        ))}
    </section>
  );
}

/** „Następne kroki” Tropiciela dla tej osoby. */
async function NextSteps({ treeId, personId, canEdit, living }: { treeId: string; personId: string; canEdit: boolean; living: boolean }) {
  if (living) return null;
  const [snapshot, confirmed, statuses] = await Promise.all([
    loadTreeSnapshot(treeId),
    loadConfirmedSources(treeId),
    loadTaskStatuses(treeId),
  ]);
  const tasks = suggestTasks(snapshot, personId, confirmed);
  if (tasks.length === 0) return null;
  return (
    <section aria-label="Następne kroki" className="space-y-3">
      <h3 className="font-serif text-2xl font-semibold">Następne kroki – Tropiciel</h3>
      <p className="text-sm text-ink-muted">Gotowe wyszukiwania w Genetece (indeksy PTG) – otwórz link i sprawdź wyniki.</p>
      <TaskList treeId={treeId} tasks={tasks} statuses={statuses} canEdit={canEdit} autoEnabled={isGenetekaFetchEnabled()} />
    </section>
  );
}
