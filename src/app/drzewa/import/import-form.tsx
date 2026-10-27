"use client";

import { startTransition, useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { importGedcomAction, type ImportState } from "./actions";

export function ImportForm() {
  const [state, dispatch, pending] = useActionState<ImportState, FormData>(importGedcomAction, {});

  return (
    <form
      className="card mt-6 space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      <div>
        <label htmlFor="file" className="field-label">
          Plik GEDCOM (.ged)
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".ged,.gedcom,text/plain"
          required
          className="block w-full text-base file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line file:bg-paper-sunken file:px-4 file:font-semibold file:text-ink"
        />
      </div>
      <div>
        <label htmlFor="name" className="field-label">
          Nazwa nowego drzewa
        </label>
        <input id="name" name="name" type="text" maxLength={120} placeholder="domyślnie: nazwa pliku" className="field-input" />
      </div>
      <FormStatus error={state.error} />
      {state.warnings && state.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-ink-muted">
          {state.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Importowanie… (duże drzewa mogą zająć minutę)" : "Importuj drzewo"}
      </button>
    </form>
  );
}
