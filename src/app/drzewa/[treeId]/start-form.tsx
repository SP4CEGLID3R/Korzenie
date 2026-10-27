"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DateInput } from "@/components/forms/date-input";
import { SexField, TextField } from "@/components/tree/fields";
import type { ActionState } from "@/lib/trees/forms";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

function RelativeFields({ prefix, title, surnameLabel = "Nazwisko" }: { prefix: string; title: string; surnameLabel?: string }) {
  return (
    <fieldset className="card p-4">
      <legend className="px-1 font-serif text-lg font-semibold">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name={`${prefix}_givenNames`} label="Imię" />
        <TextField name={`${prefix}_surname`} label={surnameLabel} />
        <div className="sm:col-span-2">
          <DateInput name={`${prefix}_birth_date`} label="Data urodzenia (jeśli znasz)" placeholder="np. 1932, ok. 1930" />
        </div>
      </div>
    </fieldset>
  );
}

export function StartForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} className="mt-6 space-y-6">
      <fieldset className="card p-4 sm:p-5">
        <legend className="px-1 font-serif text-lg font-semibold">Ty</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="me_givenNames" label="Imię" required autoFocus />
          <TextField name="me_surname" label="Nazwisko" />
          <TextField name="me_birthSurname" label="Nazwisko rodowe" hint="Jeśli zmieniło się po ślubie." />
          <SexField name="me_sex" />
          <DateInput name="me_birth_date" label="Data urodzenia" placeholder="np. 12.05.1990" />
          <TextField name="me_birth_place" label="Miejsce urodzenia" placeholder="np. Kielce" />
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <RelativeFields prefix="father" title="Tata" />
        <RelativeFields prefix="mother" title="Mama" surnameLabel="Nazwisko (najlepiej rodowe)" />
      </div>

      <details className="group">
        <summary className="cursor-pointer font-semibold text-accent">Dodaj też dziadków</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <RelativeFields prefix="ff" title="Dziadek ze strony taty" />
          <RelativeFields prefix="fm" title="Babcia ze strony taty" surnameLabel="Nazwisko (najlepiej rodowe)" />
          <RelativeFields prefix="mf" title="Dziadek ze strony mamy" />
          <RelativeFields prefix="mm" title="Babcia ze strony mamy" surnameLabel="Nazwisko (najlepiej rodowe)" />
        </div>
      </details>

      <SubmitButton pendingText="Tworzenie drzewa…">Utwórz drzewo</SubmitButton>
    </ActionForm>
  );
}
