import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { toChartData } from "@/lib/genealogy/chart";
import { getTreeAccess } from "@/lib/trees/access";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";
import { startFromSelfAction } from "./actions";
import { StartForm } from "./start-form";
import { TreeChart } from "./tree-chart";

export const metadata: Metadata = { title: "Drzewo" };

export default function TreePage({ params }: PageProps<"/drzewa/[treeId]">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Wczytywanie drzewa…</p>}>
      <TreeView params={params} />
    </Suspense>
  );
}

async function TreeView({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const { tree, canEdit } = await getTreeAccess(treeId);
  const snapshot = await loadTreeSnapshot(treeId);

  if (snapshot.persons.length === 0) {
    if (!canEdit) return <p className="text-ink-muted">To drzewo jest jeszcze puste.</p>;
    return (
      <section className="max-w-3xl">
        <h2 className="font-serif text-2xl font-semibold">Zacznij od siebie</h2>
        <p className="mt-2 text-ink-muted">
          Wpisz to, co wiesz – wystarczy Twoje imię. Rodziców i dziadków możesz pominąć albo uzupełnić
          później. Wszystkie pola poza Twoim imieniem są opcjonalne.
        </p>
        <StartForm action={startFromSelfAction.bind(null, treeId)} />
        <p className="mt-6 text-sm text-ink-muted">
          Masz już drzewo w innym programie lub serwisie?{" "}
          <Link href="/drzewa/import" className="font-semibold text-accent underline underline-offset-4">
            Zaimportuj plik GEDCOM
          </Link>{" "}
          jako nowe drzewo.
        </p>
      </section>
    );
  }

  const data = toChartData(snapshot);
  const mainId = data.some((d) => d.id === tree.homePersonId) ? tree.homePersonId! : data[0].id;

  return (
    <>
      <TreeChart treeId={treeId} data={data} mainId={mainId} />
      {canEdit && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/drzewa/${treeId}/osoby/nowa`} className="btn-primary">
            Dodaj osobę
          </Link>
          <Link href={`/drzewa/${treeId}/osoby`} className="btn-secondary">
            Lista osób
          </Link>
        </div>
      )}
    </>
  );
}
