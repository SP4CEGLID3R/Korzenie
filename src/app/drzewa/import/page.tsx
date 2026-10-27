import type { Metadata } from "next";
import Link from "next/link";
import { MAX_GEDCOM_BYTES, MAX_IMPORT_PERSONS } from "@/lib/gedcom/import";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import GEDCOM" };

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <nav aria-label="Ścieżka" className="text-sm text-ink-muted">
        <Link href="/drzewa" className="underline underline-offset-4 hover:text-ink">
          Moje drzewa
        </Link>{" "}
        / <span className="text-ink">Import GEDCOM</span>
      </nav>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">Import drzewa z pliku GEDCOM</h1>
      <p className="mt-3 text-ink-muted">
        GEDCOM to standardowy format plików z drzewami genealogicznymi. Eksportuje go większość serwisów
        i programów genealogicznych – szukaj opcji „Eksportuj drzewo” lub „Export GEDCOM”. Plik ma
        rozszerzenie <code>.ged</code>.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
        <li>Import tworzy <strong className="text-ink">nowe, prywatne drzewo</strong> – nie zmienia istniejących.</li>
        <li>
          Przenosimy osoby, imiona i nazwiska (także rodowe), płeć, wydarzenia z datami i miejscami, zawody,
          notatki oraz relacje rodzinne.
        </li>
        <li>Cytowania źródeł i zdjęcia pominiemy – ich import pojawi się później.</li>
        <li>
          Limit: {MAX_GEDCOM_BYTES / 1024 / 1024} MB i {MAX_IMPORT_PERSONS.toLocaleString("pl-PL")} osób.
        </li>
      </ul>
      <ImportForm />
    </div>
  );
}
