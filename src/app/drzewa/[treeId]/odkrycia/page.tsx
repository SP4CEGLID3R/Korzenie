import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/lib/db";
import { displayName, lifespan } from "@/lib/genealogy/names";
import { MATCH_CONFIG } from "@/lib/matching/config";
import { personFacts } from "@/lib/matching/facts";
import type { ExplanationItem, NameFact, PlaceFact, RecordFacts, YearRange } from "@/lib/matching/types";
import { getTreeAccess } from "@/lib/trees/access";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";
import { decideMatchAction, searchTreeBatchAction } from "./actions";
import { TreeSearch } from "./tree-search";

export const metadata: Metadata = { title: "Odkrycia" };

const STATUS = { oczekujace: "PENDING", potwierdzone: "CONFIRMED", odrzucone: "REJECTED" } as const;
type StatusKey = keyof typeof STATUS;

export default function DiscoveriesPage({ params, searchParams }: PageProps<"/drzewa/[treeId]/odkrycia">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Wczytywanie propozycji…</p>}>
      <Discoveries params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const ICON: Record<ExplanationItem["status"], { icon: string; className: string; sr: string }> = {
  match: { icon: "✓", className: "text-moss", sr: "Zgadza się" },
  partial: { icon: "≈", className: "text-accent", sr: "Częściowo" },
  mismatch: { icon: "✗", className: "text-danger", sr: "Nie zgadza się" },
  missing: { icon: "–", className: "text-ink-muted", sr: "Brak danych" },
};

const years = (r?: YearRange | null) => (!r ? null : r.min === r.max ? String(r.min) : `${r.min}–${r.max}`);
const nameOf = (n?: NameFact | null) => (n ? [n.given, n.surname].filter(Boolean).join(" ") : null);
const placeOf = (p?: PlaceFact | null) => (p ? [p.name, p.parish && `parafia ${p.parish}`].filter(Boolean).join(", ") : null);

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-32 shrink-0 text-ink-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

async function Discoveries({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { treeId } = await params;
  const sp = await searchParams;
  const { canEdit } = await getTreeAccess(treeId);
  const statusKey: StatusKey = z.enum(["oczekujace", "potwierdzone", "odrzucone"]).catch("oczekujace").parse(sp.status);
  const personFilter = z.uuid().safeParse(sp.osoba);

  const [tree, counts, matches] = await Promise.all([
    loadTreeSnapshot(treeId),
    db.match.groupBy({ by: ["status"], where: { person: { treeId } }, _count: true }),
    db.match.findMany({
      where: {
        person: { treeId },
        status: STATUS[statusKey],
        ...(personFilter.success ? { personId: personFilter.data } : {}),
      },
      include: { record: { include: { source: true } } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const filteredPerson = personFilter.success ? byId.get(personFilter.data) : undefined;
  const base = `/drzewa/${treeId}/odkrycia`;
  const withPerson = personFilter.success ? `&osoba=${personFilter.data}` : "";

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Odkrycia – Tropy w źródłach</h2>
        <p className="mt-1 max-w-3xl text-ink-muted">
          Propozycje rekordów, które mogą dotyczyć osób z Twojego drzewa. Każda ma wynik i wyjaśnienie.
          Nic nie trafia do drzewa samo – Ty decydujesz. Odrzuconych propozycji nie pokażemy ponownie.
          Szukamy tylko osób, które nie żyją – danych osób żyjących nie wysyłamy nigdzie.
        </p>
      </div>

      {canEdit && <TreeSearch action={searchTreeBatchAction.bind(null, treeId)} />}

      <nav aria-label="Rodzaj propozycji" className="flex flex-wrap gap-2">
        {(Object.keys(STATUS) as StatusKey[]).map((k) => (
          <Link
            key={k}
            href={`${base}?status=${k}${withPerson}`}
            aria-current={k === statusKey ? "page" : undefined}
            className={k === statusKey ? "btn-primary" : "btn-secondary"}
          >
            {{ oczekujace: "Do decyzji", potwierdzone: "Potwierdzone", odrzucone: "Odrzucone" }[k]} ({count(STATUS[k])})
          </Link>
        ))}
      </nav>
      {filteredPerson && (
        <p className="text-sm">
          Tylko: <strong>{displayName(filteredPerson.names)}</strong> ·{" "}
          <Link href={`${base}?status=${statusKey}`} className="text-accent underline underline-offset-4">
            pokaż wszystkie osoby
          </Link>
        </p>
      )}

      {matches.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-ink-muted">
          {statusKey === "oczekujace"
            ? "Brak propozycji do decyzji. Uruchom wyszukiwanie powyżej albo z karty osoby."
            : "Nic tu jeszcze nie ma."}
        </p>
      ) : (
        <ul className="space-y-6">
          {matches.map((m) => {
            const p = byId.get(m.personId);
            if (!p) return null;
            const facts = personFacts(tree, p.id);
            const rec = m.record.normalized as unknown as RecordFacts & { title?: string };
            const expl = m.explanation as unknown as { items: ExplanationItem[]; summary: string };
            const strong = m.score >= MATCH_CONFIG.thresholds.strong;
            return (
              <li key={m.id} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper-sunken/60 px-4 py-3">
                  <p className="font-semibold">
                    <span className={`mr-2 rounded-full px-2.5 py-1 text-sm ${strong ? "bg-moss text-paper" : "bg-accent-soft text-ink"}`}>
                      {m.score}%
                    </span>
                    {strong ? "Silna propozycja" : "Możliwa propozycja"}
                  </p>
                  <p className="text-sm text-ink-muted">{expl.summary}</p>
                </div>

                <div className="grid gap-4 p-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Osoba w Twoim drzewie</h3>
                    <p className="mt-1 font-serif text-xl font-semibold">
                      <Link href={`/drzewa/${treeId}/osoby/${p.id}`} className="underline decoration-line underline-offset-4 hover:decoration-accent">
                        {displayName(p.names)}
                      </Link>
                    </p>
                    <dl className="mt-2 space-y-1">
                      <Row label="Lata życia" value={lifespan(p)} />
                      <Row label="Urodzenie" value={facts.birthPlaces.map((x) => placeOf(x)).join("; ")} />
                      <Row label="Zgon" value={facts.deathPlaces.map((x) => placeOf(x)).join("; ")} />
                      <Row label="Ojciec" value={nameOf(facts.father)} />
                      <Row label="Matka" value={nameOf(facts.mother)} />
                      <Row label="Małżonkowie" value={facts.spouses.map(nameOf).filter(Boolean).join(", ")} />
                    </dl>
                  </div>
                  <div className="md:border-l md:border-line md:pl-4">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Rekord: {m.record.source.title}
                    </h3>
                    <p className="mt-1 font-serif text-xl font-semibold">{nameOf(rec.person)}</p>
                    {rec.description && <p className="text-sm text-ink-muted">{rec.description}</p>}
                    <dl className="mt-2 space-y-1">
                      <Row
                        label="Lata życia"
                        value={[years(rec.birth) ?? (rec.year ? String(rec.year) : null), years(rec.death)].filter(Boolean).join("–") || null}
                      />
                      <Row label="Urodzenie" value={placeOf(rec.birthPlace ?? (rec.kind === "BIRTH" || rec.kind === "BAPTISM" ? rec.place : null))} />
                      <Row label="Zgon" value={placeOf(rec.deathPlace ?? (rec.kind === "DEATH" || rec.kind === "BURIAL" ? rec.place : null))} />
                      <Row label="Ojciec" value={nameOf(rec.father)} />
                      <Row label="Matka" value={nameOf(rec.mother)} />
                      <Row label="Małżonkowie" value={(rec.spouses ?? []).map(nameOf).filter(Boolean).join(", ")} />
                    </dl>
                    <p className="mt-3 text-sm">
                      <a href={m.record.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
                        Zobacz oryginał w: {m.record.source.title} ↗
                      </a>
                      <span className="block text-xs text-ink-muted">{m.record.source.citationText}</span>
                    </p>
                  </div>
                </div>

                <details className="border-t border-line px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-accent">Dlaczego taki wynik?</summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {expl.items.map((i) => (
                      <li key={i.field} className="flex gap-2">
                        <span aria-hidden="true" className={`w-4 shrink-0 text-center font-bold ${ICON[i.status].className}`}>
                          {ICON[i.status].icon}
                        </span>
                        <span>
                          <span className="sr-only">{ICON[i.status].sr}: </span>
                          <strong className="font-semibold">{i.label}:</strong> {i.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>

                {canEdit && (
                  <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                    {m.status === "PENDING" ? (
                      <>
                        <form action={decideMatchAction.bind(null, treeId, m.id, "CONFIRMED")}>
                          <button type="submit" className="btn-primary">
                            Potwierdź – to ta osoba
                          </button>
                        </form>
                        <form action={decideMatchAction.bind(null, treeId, m.id, "REJECTED")}>
                          <button type="submit" className="btn-secondary">
                            Odrzuć
                          </button>
                        </form>
                      </>
                    ) : (
                      <form action={decideMatchAction.bind(null, treeId, m.id, "PENDING")}>
                        <button type="submit" className="btn-ghost">
                          Cofnij decyzję
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
