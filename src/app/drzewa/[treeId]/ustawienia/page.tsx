import type { Metadata } from "next";
import { Suspense } from "react";
import { getTreeAccess } from "@/lib/trees/access";
import { deleteTreeAction, renameTreeAction } from "./actions";
import { DeleteTreeForm, RenameTreeForm } from "./settings-forms";

export const metadata: Metadata = { title: "Ustawienia drzewa" };

export default function SettingsPage({ params }: PageProps<"/drzewa/[treeId]/ustawienia">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Wczytywanie…</p>}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const { tree, isOwner, canEdit } = await getTreeAccess(treeId);

  return (
    <div className="max-w-3xl space-y-8">
      <section className="card p-5">
        <h2 className="font-serif text-2xl font-semibold">Eksport GEDCOM</h2>
        <p className="mt-2 text-ink-muted">
          Pobierz całe drzewo w formacie GEDCOM 5.5.1 (UTF-8). Otworzysz go w każdym programie
          genealogicznym. To Twoje dane – możesz je zabrać w każdej chwili.
        </p>
        {canEdit ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`/drzewa/${treeId}/eksport`} className="btn-primary" download>
              Pobierz pełne drzewo (.ged)
            </a>
            <a href={`/drzewa/${treeId}/eksport?zyjace=ukryj`} className="btn-secondary" download>
              Pobierz bez danych osób żyjących
            </a>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Eksport jest dostępny dla właściciela i edytorów drzewa.</p>
        )}
        <p className="mt-3 text-sm text-ink-muted">
          Wersja „bez danych osób żyjących” zastępuje je wpisem „Osoba żyjąca” – przyda się, gdy chcesz
          przekazać plik komuś spoza rodziny.
        </p>
      </section>

      {isOwner && (
        <section className="card p-5">
          <h2 className="font-serif text-2xl font-semibold">Nazwa drzewa</h2>
          <RenameTreeForm action={renameTreeAction.bind(null, treeId)} name={tree.name} />
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-serif text-2xl font-semibold">Prywatność</h2>
        <p className="mt-2 text-ink-muted">
          To drzewo jest <strong className="text-ink">prywatne</strong> – widzisz je tylko Ty
          {tree.visibility === "PRIVATE" ? "" : " i osoby z linkiem"}. Udostępnianie rodzinie pojawi się w
          kolejnym etapie budowy serwisu.
        </p>
      </section>

      {isOwner && (
        <section className="rounded-lg border border-danger/40 p-5">
          <h2 className="font-serif text-2xl font-semibold text-danger">Usuń drzewo</h2>
          <p className="mt-2 text-ink-muted">
            Usuwa na zawsze wszystkie osoby, wydarzenia, miejsca i relacje w tym drzewie. Zanim to zrobisz,
            pobierz kopię w GEDCOM.
          </p>
          <DeleteTreeForm action={deleteTreeAction.bind(null, treeId)} name={tree.name} />
        </section>
      )}
    </div>
  );
}
