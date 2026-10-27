import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { displayName, lifespan, sortName } from "@/lib/genealogy/names";
import { getTreeAccess } from "@/lib/trees/access";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";
import { PersonList } from "./person-list";

export const metadata: Metadata = { title: "Osoby" };

export default function PersonsPage({ params, searchParams }: PageProps<"/drzewa/[treeId]/osoby">) {
  return (
    <>
      <Suspense fallback={null}>
        <ImportBanner searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="text-ink-muted">Wczytywanie osób…</p>}>
        <Persons params={params} />
      </Suspense>
    </>
  );
}

/** Podsumowanie po imporcie GEDCOM (parametry dodaje akcja importu). */
async function ImportBanner({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const count = typeof sp.zaimportowano === "string" ? Number(sp.zaimportowano) : NaN;
  if (!Number.isFinite(count)) return null;
  const notes = typeof sp.uwagi === "string" ? sp.uwagi.split("\n").filter(Boolean) : [];
  return (
    <div role="status" className="mb-6 rounded-lg border border-moss/40 bg-paper-raised p-4">
      <p className="font-semibold">Import zakończony. Liczba zaimportowanych osób: {count.toLocaleString("pl-PL")}.</p>
      <p className="mt-1 text-sm text-ink-muted">
        Zajrzyj do zakładki „Spójność” – importowane drzewa często zawierają drobne błędy w datach.
      </p>
      {notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-ink-muted">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function Persons({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const { canEdit } = await getTreeAccess(treeId);
  const snapshot = await loadTreeSnapshot(treeId);
  const items = snapshot.persons
    .map((p) => ({
      id: p.id,
      name: displayName(p.names),
      lifespan: lifespan(p),
      sort: sortName(p.names),
      sex: p.sex,
    }))
    .sort((a, b) => a.sort.localeCompare(b.sort, "pl"));

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold">Osoby w drzewie</h2>
        {canEdit && (
          <Link href={`/drzewa/${treeId}/osoby/nowa`} className="btn-primary">
            Dodaj osobę
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-ink-muted">Nie ma jeszcze żadnych osób.</p>
      ) : (
        <PersonList treeId={treeId} items={items} />
      )}
    </section>
  );
}
