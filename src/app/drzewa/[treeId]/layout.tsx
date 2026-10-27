import Link from "next/link";
import { Suspense } from "react";
import { checkConsistency } from "@/lib/genealogy/consistency";
import { getTreeAccess } from "@/lib/trees/access";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";
import { TreeTabs } from "./tree-tabs";

const ROLE_LABEL = { OWNER: "Właściciel", EDITOR: "Edytor", VIEWER: "Czytelnik" } as const;

export default function TreeLayout({ children, params }: LayoutProps<"/drzewa/[treeId]">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <Suspense fallback={<div className="h-24" aria-hidden="true" />}>
        <TreeHeader params={params} />
      </Suspense>
      <div className="mt-6">{children}</div>
    </div>
  );
}

async function TreeHeader({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  const { tree, role } = await getTreeAccess(treeId);
  const snapshot = await loadTreeSnapshot(treeId);
  const issues = checkConsistency(snapshot);

  return (
    <header>
      <nav aria-label="Ścieżka" className="text-sm text-ink-muted">
        <Link href="/drzewa" className="underline underline-offset-4 hover:text-ink">
          Moje drzewa
        </Link>{" "}
        / <span className="text-ink">{tree.name}</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{tree.name}</h1>
        <p className="text-sm text-ink-muted">
          {snapshot.persons.length} {personWord(snapshot.persons.length)} · {ROLE_LABEL[role]}
        </p>
      </div>
      <TreeTabs treeId={treeId} issueCount={issues.length} />
    </header>
  );
}

function personWord(n: number) {
  if (n === 1) return "osoba";
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && !(t >= 12 && t <= 14) ? "osoby" : "osób";
}
