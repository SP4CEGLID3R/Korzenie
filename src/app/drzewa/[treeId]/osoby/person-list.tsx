"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";

type Item = { id: string; name: string; lifespan: string; sort: string; sex: string };

const MAX_SHOWN = 300;

/** Porównanie bez polskich znaków i wielkości liter („lodz” znajdzie „Łódź”). */
function fold(s: string) {
  return s
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l");
}

export function PersonList({ treeId, items }: { treeId: string; items: Item[] }) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const q = fold(deferred.trim());
  const filtered = q ? items.filter((i) => fold(`${i.name} ${i.lifespan}`).includes(q)) : items;

  return (
    <div className="mt-4">
      <label htmlFor="person-search" className="field-label">
        Szukaj osoby
      </label>
      <input
        id="person-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="imię, nazwisko lub rok"
        className="field-input max-w-md"
      />
      <p className="mt-2 text-sm text-ink-muted" aria-live="polite">
        {q ? `Znaleziono: ${filtered.length}` : `Wszystkich: ${items.length}`}
      </p>
      <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-paper-raised">
        {filtered.slice(0, MAX_SHOWN).map((i) => (
          <li key={i.id}>
            <Link
              href={`/drzewa/${treeId}/osoby/${i.id}`}
              className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 hover:bg-paper-sunken"
            >
              <span className="font-semibold">{i.name}</span>
              <span className="shrink-0 text-sm text-ink-muted">{i.lifespan}</span>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length > MAX_SHOWN && (
        <p className="mt-2 text-sm text-ink-muted">
          Pokazano pierwsze {MAX_SHOWN}. Zawęź wyszukiwanie, aby zobaczyć pozostałe.
        </p>
      )}
    </div>
  );
}
