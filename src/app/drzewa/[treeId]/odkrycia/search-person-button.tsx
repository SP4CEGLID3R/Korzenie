"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import type { SearchState } from "./actions";

export function SearchPersonButton({ action }: { action: (prev: SearchState) => Promise<SearchState> }) {
  const [state, dispatch, pending] = useActionState<SearchState>(action, {});
  return (
    <form action={dispatch} className="space-y-2">
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Szukanie w Wikidata…" : "Szukaj tej osoby w Wikidata"}
      </button>
      <FormStatus error={state.error} message={state.message} />
    </form>
  );
}
