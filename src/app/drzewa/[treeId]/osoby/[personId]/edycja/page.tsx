import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { displayName, primaryName } from "@/lib/genealogy/names";
import { getTreeAccess, requirePersonInTree } from "@/lib/trees/access";
import { loadPersonNeighborhood } from "@/lib/trees/snapshot";
import { updatePersonAction } from "../../../actions";
import { EditPersonForm } from "./edit-person-form";

export const metadata: Metadata = { title: "Edycja osoby" };

export default function EditPersonPage({ params }: PageProps<"/drzewa/[treeId]/osoby/[personId]/edycja">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Wczytywanie…</p>}>
      <EditPerson params={params} />
    </Suspense>
  );
}

async function EditPerson({ params }: { params: Promise<{ treeId: string; personId: string }> }) {
  const { treeId, personId } = await params;
  const { canEdit } = await getTreeAccess(treeId);
  if (!canEdit) return <p className="text-ink-muted">Nie masz uprawnień do edycji tego drzewa.</p>;
  await requirePersonInTree(treeId, personId);
  const hood = await loadPersonNeighborhood(treeId, personId);
  const person = hood.persons.find((p) => p.id === personId)!;
  const name = primaryName(person.names);

  return (
    <section className="max-w-3xl">
      <p className="text-sm">
        <Link href={`/drzewa/${treeId}/osoby/${personId}`} className="text-ink-muted underline underline-offset-4 hover:text-ink">
          ← Wróć do karty osoby
        </Link>
      </p>
      <h2 className="mt-2 font-serif text-2xl font-semibold">Edycja: {displayName(person.names)}</h2>
      <p className="mt-1 text-ink-muted">Daty i miejsca zmieniasz w sekcji „Wydarzenia” na karcie osoby.</p>
      <EditPersonForm
        action={updatePersonAction.bind(null, treeId, personId)}
        defaults={{
          givenNames: name?.givenNames ?? "",
          surname: name?.surname,
          birthSurname: name?.birthSurname,
          sex: person.sex,
          livingStatus: person.livingStatus,
          notes: person.notes,
        }}
      />
    </section>
  );
}
