"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/form-status";
import { createTree, type CreateTreeState } from "./actions";

export function CreateTreeForm() {
  const [state, action, pending] = useActionState<CreateTreeState, FormData>(createTree, {});

  return (
    <form action={action} className="card space-y-3 p-4 sm:p-5" noValidate>
      <div>
        <label htmlFor="tree-name" className="field-label">
          Nazwa nowego drzewa
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            // Po udanym zapisie czyścimy pole, zmieniając klucz.
            key={state.savedId ?? "tree-name"}
            id="tree-name"
            name="name"
            type="text"
            maxLength={120}
            required
            placeholder="np. Rodzina Kowalskich z Kielecczyzny"
            className="field-input"
          />
          <button type="submit" className="btn-primary shrink-0" disabled={pending}>
            {pending ? "Tworzenie…" : "Utwórz drzewo"}
          </button>
        </div>
      </div>
      <FormStatus error={state.error} />
    </form>
  );
}
