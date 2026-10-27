import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateTreeForm } from "./create-tree-form";

export const metadata: Metadata = { title: "Moje drzewa" };

const VISIBILITY_LABEL = {
  PRIVATE: "Prywatne",
  LINK: "Dostępne z linkiem",
  PUBLIC: "Publiczne",
} as const;

const ROLE_LABEL = {
  OWNER: "Właściciel",
  EDITOR: "Edytor",
  VIEWER: "Czytelnik",
} as const;

const dateFormat = new Intl.DateTimeFormat("pl-PL", { dateStyle: "long" });

export default function TreesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Moje drzewa</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Tu znajdziesz wszystkie drzewa, które prowadzisz albo które ktoś Ci udostępnił.
      </p>

      <div className="mt-8">
        <CreateTreeForm />
        <p className="mt-3 text-sm text-ink-muted">
          Masz drzewo w innym serwisie lub programie?{" "}
          <Link href="/drzewa/import" className="font-semibold text-accent underline underline-offset-4">
            Zaimportuj plik GEDCOM
          </Link>
        </p>
      </div>

      <Suspense fallback={<p className="mt-8 text-ink-muted">Wczytywanie drzew…</p>}>
        <TreeList />
      </Suspense>
    </div>
  );
}

async function TreeList() {
  const user = await requireUser();
  const memberships = await db.treeMember.findMany({
    where: { userId: user.id },
    include: { tree: { include: { _count: { select: { persons: true } } } } },
    orderBy: { tree: { createdAt: "desc" } },
  });

  if (memberships.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-dashed border-line p-8 text-center">
        <p className="font-serif text-xl">Nie masz jeszcze żadnego drzewa.</p>
        <p className="mt-2 text-ink-muted">
          Nadaj mu nazwę powyżej, a potem zacznij od siebie – wpisz siebie, rodziców i dziadków.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2">
      {memberships.map(({ tree, role }) => (
        <li key={tree.id} className="card relative p-5 hover:border-accent">
          <h2 className="font-serif text-xl font-semibold">
            {/* Cała karta jest klikalna dzięki rozciągniętemu linkowi. */}
            <Link href={`/drzewa/${tree.id}`} className="after:absolute after:inset-0">
              {tree.name}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Założone {dateFormat.format(tree.createdAt)} · {tree._count.persons}{" "}
            {personWord(tree._count.persons)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-ink">
              {VISIBILITY_LABEL[tree.visibility]}
            </span>
            <span className="rounded-full border border-line px-2.5 py-1 text-ink-muted">
              {ROLE_LABEL[role]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Polska odmiana: 1 osoba, 2–4 osoby, 5+ osób (ale 22–24 osoby). */
function personWord(n: number) {
  if (n === 1) return "osoba";
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "osoby";
  return "osób";
}
