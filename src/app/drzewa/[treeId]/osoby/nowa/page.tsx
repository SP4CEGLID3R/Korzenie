import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { displayName, masculineSurname, primaryName, surnameForSex } from "@/lib/genealogy/names";
import type { Sex } from "@/lib/genealogy/types";
import { getTreeAccess, requirePersonInTree } from "@/lib/trees/access";
import { loadPersonNeighborhood, loadTreePlaces } from "@/lib/trees/snapshot";
import { createPersonAction } from "../../actions";
import { NewPersonForm } from "./new-person-form";

export const metadata: Metadata = { title: "Nowa osoba" };

export default function NewPersonPage({ params, searchParams }: PageProps<"/drzewa/[treeId]/osoby/nowa">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Wczytywanie…</p>}>
      <NewPerson params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const relSchema = z.enum(["parent", "child", "spouse"]);
const sexSchema = z.enum(["M", "F"]);

async function NewPerson({
  params,
  searchParams,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { treeId } = await params;
  const sp = await searchParams;
  const { canEdit } = await getTreeAccess(treeId);
  if (!canEdit) return <p className="text-ink-muted">Nie masz uprawnień do edycji tego drzewa.</p>;

  const rel = relSchema.safeParse(sp.rel);
  const relToId = z.uuid().safeParse(sp.do);
  const sexParam = sexSchema.safeParse(sp.plec);
  const places = await loadTreePlaces(treeId);

  let relation: { kind: "parent" | "child" | "spouse"; personId: string; personName: string } | null = null;
  let coParents: { id: string; name: string }[] = [];
  let defaultSurname: string | null = null;
  let defaultSex: Sex = sexParam.success ? (sexParam.data === "M" ? "MALE" : "FEMALE") : "UNKNOWN";

  if (rel.success && relToId.success) {
    await requirePersonInTree(treeId, relToId.data);
    const hood = await loadPersonNeighborhood(treeId, relToId.data);
    const relTo = hood.persons.find((p) => p.id === relToId.data)!;
    relation = { kind: rel.data, personId: relTo.id, personName: displayName(relTo.names) };
    const relName = primaryName(relTo.names);

    if (rel.data === "child") {
      // Drugi rodzic: małżonkowie osoby oraz współrodzice jej dotychczasowych dzieci.
      const ids = new Set<string>();
      for (const u of hood.unions) ids.add(u.partner1Id === relTo.id ? u.partner2Id : u.partner1Id);
      const childIds = hood.parentLinks.filter((l) => l.parentId === relTo.id).map((l) => l.childId);
      for (const l of hood.parentLinks) {
        if (childIds.includes(l.childId) && l.parentId !== relTo.id) ids.add(l.parentId);
      }
      coParents = hood.persons.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, name: displayName(p.names) }));
      // Dziecko zwykle nosi nazwisko ojca – w formie zgodnej z płcią (Nowicki → Nowicka).
      const father = relTo.sex === "MALE" ? relTo : hood.persons.find((p) => ids.has(p.id) && p.sex === "MALE");
      const fatherSurname = father ? (primaryName(father.names)?.surname ?? null) : null;
      defaultSurname = surnameForSex(fatherSurname, defaultSex);
    }
    if (rel.data === "parent" && defaultSex === "MALE") {
      const childSurname = relName?.birthSurname ?? relName?.surname;
      defaultSurname = childSurname ? masculineSurname(childSurname) : null;
    }
    if (rel.data === "spouse") {
      if (relTo.sex !== "UNKNOWN" && defaultSex === "UNKNOWN") defaultSex = relTo.sex === "MALE" ? "FEMALE" : "MALE";
      // Żona zwykle przyjmowała nazwisko męża; mąż ma nazwisko, które żona nosi po ślubie.
      if (defaultSex === "FEMALE" && relTo.sex === "MALE") defaultSurname = surnameForSex(relName?.surname, "FEMALE");
      if (defaultSex === "MALE" && relTo.sex === "FEMALE" && relName?.birthSurname) {
        defaultSurname = surnameForSex(relName.surname, "MALE");
      }
    }
  }

  const title = !relation
    ? "Nowa osoba"
    : relation.kind === "parent"
      ? defaultSex === "MALE"
        ? `Ojciec osoby: ${relation.personName}`
        : defaultSex === "FEMALE"
          ? `Matka osoby: ${relation.personName}`
          : `Rodzic osoby: ${relation.personName}`
      : relation.kind === "child"
        ? `${defaultSex === "MALE" ? "Syn" : defaultSex === "FEMALE" ? "Córka" : "Dziecko"} osoby: ${relation.personName}`
        : `Małżonek / partner osoby: ${relation.personName}`;

  return (
    <section className="max-w-3xl">
      <h2 className="font-serif text-2xl font-semibold">{title}</h2>
      <NewPersonForm
        action={createPersonAction.bind(null, treeId)}
        relation={relation}
        coParents={coParents}
        defaults={{ surname: defaultSurname, sex: defaultSex }}
        places={places}
      />
    </section>
  );
}
