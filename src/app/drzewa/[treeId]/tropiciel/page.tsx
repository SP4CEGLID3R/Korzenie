import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TaskList } from "@/components/detective/task-list";
import { suggestByGeneration } from "@/lib/detective/suggest";
import { displayName } from "@/lib/genealogy/names";
import { isGenetekaFetchEnabled } from "@/lib/sources/geneteka";
import { getTreeAccess } from "@/lib/trees/access";
import { loadConfirmedSources, loadTaskStatuses } from "@/lib/trees/detective";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";

export const metadata: Metadata = { title: "Tropiciel" };

export default function DetectivePage({ params, searchParams }: PageProps<"/drzewa/[treeId]/tropiciel">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Tropiciel przegląda drzewo…</p>}>
      <Detective params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detective({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { treeId } = await params;
  const showDone = (await searchParams).wszystkie === "1";
  const { tree, canEdit } = await getTreeAccess(treeId);
  const [snapshot, confirmed, statuses] = await Promise.all([
    loadTreeSnapshot(treeId),
    loadConfirmedSources(treeId),
    loadTaskStatuses(treeId),
  ]);
  const groups = suggestByGeneration(snapshot, tree.homePersonId, confirmed);
  const labels = new Map(snapshot.persons.map((p) => [p.id, displayName(p.names)]));
  const autoEnabled = isGenetekaFetchEnabled();

  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-serif text-2xl font-semibold">Tropiciel – następne kroki</h2>
        <p className="mt-1 max-w-3xl text-ink-muted">
          Propozycje, czego szukać dalej – pokolenie po pokoleniu w górę drzewa. Każdy link otwiera
          wyszukiwarkę Geneteki z wpisanymi danymi; wyniki sprawdzasz sam. Geneteka to praca wolontariuszy
          Polskiego Towarzystwa Genealogicznego.
        </p>
        <p className="mt-2 text-sm">
          <Link href={`/drzewa/${treeId}/tropiciel${showDone ? "" : "?wszystkie=1"}`} className="text-accent underline underline-offset-4">
            {showDone ? "Ukryj zrobione i pominięte" : "Pokaż także zrobione i pominięte"}
          </Link>
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line p-6 text-ink-muted">
          Brak propozycji. Tropiciel potrzebuje osób, które nie żyją, z imieniem, nazwiskiem i choć jedną datą
          (albo datami najbliższej rodziny). Dla osób żyjących niczego nie szukamy.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.generation}>
            <h3 className="font-serif text-xl font-semibold">{g.label}</h3>
            <div className="mt-3">
              <TaskList
                treeId={treeId}
                tasks={g.suggestions}
                statuses={statuses}
                canEdit={canEdit}
                autoEnabled={autoEnabled}
                showDone={showDone}
                personLabels={labels}
              />
            </div>
          </div>
        ))
      )}
    </section>
  );
}
