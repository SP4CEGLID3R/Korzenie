"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import type { SearchState } from "./actions";

/** Fakty z potwierdzonego rekordu – użytkownik zaznacza, co dodać do drzewa. */
export function AdoptFactsForm({
  action,
  proposals,
}: {
  action: (prev: SearchState, fd: FormData) => Promise<SearchState>;
  proposals: { key: string; label: string }[];
}) {
  const [state, dispatch, pending] = useActionState<SearchState, FormData>(action, {});
  return (
    <form action={dispatch} className="space-y-2">
      <p className="font-semibold">Dodać do drzewa z tego rekordu?</p>
      <ul className="space-y-1">
        {proposals.map((p) => (
          <li key={p.key}>
            <label className="flex min-h-9 cursor-pointer items-start gap-2">
              <input type="checkbox" name="fact" value={p.key} defaultChecked className="mt-1 accent-[var(--accent)]" />
              <span>{p.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-muted">Każdy dodany fakt dostanie przypis do tego rekordu. Niczego nie dodajemy bez Twojej zgody.</p>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Dodawanie…" : "Dodaj zaznaczone"}
      </button>
      <FormStatus error={state.error} message={state.message} />
    </form>
  );
}
