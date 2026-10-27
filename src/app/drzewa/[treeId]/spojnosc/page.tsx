import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { checkConsistency, LIMITS } from "@/lib/genealogy/consistency";
import { displayName } from "@/lib/genealogy/names";
import { getTreeAccess } from "@/lib/trees/access";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";

export const metadata: Metadata = { title: "Spójność drzewa" };

export default function ConsistencyPage({ params }: PageProps<"/drzewa/[treeId]/spojnosc">) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Sprawdzanie drzewa…</p>}>
      <Consistency params={params} />
    </Suspense>
  );
}

async function Consistency({ params }: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await params;
  await getTreeAccess(treeId);
  const snapshot = await loadTreeSnapshot(treeId);
  const issues = checkConsistency(snapshot);
  const names = new Map(snapshot.persons.map((p) => [p.id, displayName(p.names)]));
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <section className="max-w-3xl">
      <h2 className="font-serif text-2xl font-semibold">Strażnik spójności</h2>
      <p className="mt-2 text-ink-muted">
        Sprawdzamy daty, które nie mogą być prawdziwe, i takie, które są bardzo mało prawdopodobne.
        Daty przybliżone („ok. 1850”, „przed 1863”) traktujemy łagodnie – zgłaszamy tylko pewne problemy.
      </p>

      {issues.length === 0 ? (
        <p className="mt-6 rounded-lg border border-moss/40 bg-paper-raised p-4">
          ✓ Nie znaleziono problemów w {snapshot.persons.length} osobach.
        </p>
      ) : (
        <>
          <IssueList title={`Błędy (${errors.length})`} tone="error" issues={errors} names={names} treeId={treeId} />
          <IssueList title={`Do sprawdzenia (${warnings.length})`} tone="warning" issues={warnings} names={names} treeId={treeId} />
        </>
      )}

      <details className="mt-8 text-sm text-ink-muted">
        <summary className="cursor-pointer font-semibold">Co sprawdzamy?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>zgon, pochówek lub ślub przed urodzeniem; chrzest przed urodzeniem; pochówek przed zgonem,</li>
          <li>dziecko urodzone po śmierci matki lub ponad 10 miesięcy po śmierci ojca,</li>
          <li>rodzic urodzony później niż dziecko; osoba będąca własnym przodkiem,</li>
          <li>
            matka młodsza niż {LIMITS.motherMinAge} lub starsza niż {LIMITS.motherMaxAge} lat przy porodzie, ojciec młodszy niż{" "}
            {LIMITS.fatherMinAge} lub starszy niż {LIMITS.fatherMaxAge},
          </li>
          <li>ślub przed {LIMITS.minMarriageAge}. rokiem życia lub po zgonie,</li>
          <li>życie dłuższe niż {LIMITS.maxLifespanYears} lat, daty z przyszłości, więcej niż dwoje rodziców biologicznych.</li>
        </ul>
      </details>
    </section>
  );
}

function IssueList({
  title,
  tone,
  issues,
  names,
  treeId,
}: {
  title: string;
  tone: "error" | "warning";
  issues: ReturnType<typeof checkConsistency>;
  names: Map<string, string>;
  treeId: string;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className={`font-semibold ${tone === "error" ? "text-danger" : "text-accent"}`}>{title}</h3>
      <ul className="mt-2 space-y-2">
        {issues.map((i, n) => (
          <li key={n} className={`card border-l-4 p-3 ${tone === "error" ? "border-l-danger" : "border-l-accent"}`}>
            <p>{i.message}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 text-sm">
              {i.personIds.map((id) => (
                <Link key={id} href={`/drzewa/${treeId}/osoby/${id}`} className="text-accent underline underline-offset-4">
                  {names.get(id) ?? "osoba"}
                </Link>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
