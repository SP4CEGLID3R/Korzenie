"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DateInput } from "@/components/forms/date-input";
import { useId } from "react";
import {
  DescriptionField,
  LivingField,
  PersonFields,
  PlaceDatalist,
  PlaceFields,
  SelectField,
  type PersonDefaults,
  type PlaceOption,
} from "@/components/tree/fields";
import type { ActionState } from "@/lib/trees/forms";
import { ParentTypeSelect } from "../parent-type-select";

export function NewPersonForm({
  action,
  relation,
  coParents,
  defaults,
  places,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  relation: { kind: "parent" | "child" | "spouse"; personId: string; personName: string } | null;
  coParents: { id: string; name: string }[];
  defaults: PersonDefaults;
  places: PlaceOption[];
}) {
  const listId = useId();
  return (
    <ActionForm action={action} className="mt-6 space-y-6">
      <PlaceDatalist id={listId} places={places} />
      {relation && (
        <>
          <input type="hidden" name="rel" value={relation.kind} />
          <input type="hidden" name="relTo" value={relation.personId} />
        </>
      )}

      <fieldset className="card space-y-4 p-4 sm:p-5">
        <legend className="px-1 font-serif text-lg font-semibold">Dane osoby</legend>
        <PersonFields defaults={defaults} autoFocus />
        {relation && relation.kind !== "spouse" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <ParentTypeSelect name="parentType" />
            {relation.kind === "child" && coParents.length > 0 && (
              <SelectField
                name="secondParent"
                label="Drugi rodzic"
                defaultValue={coParents[0].id}
                options={[...coParents.map((p): [string, string] => [p.id, p.name]), ["", "— brak / nieznany —"]]}
              />
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="card space-y-4 p-4 sm:p-5">
        <legend className="px-1 font-serif text-lg font-semibold">Urodzenie</legend>
        <DateInput name="birth_date" label="Data urodzenia" />
        <PlaceFields prefix="birth_" listId={listId} />
      </fieldset>

      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer font-serif text-lg font-semibold">Zgon (jeśli osoba nie żyje)</summary>
        <div className="mt-4 space-y-4">
          <DateInput name="death_date" label="Data zgonu" />
          <PlaceFields prefix="death_" listId={listId} />
        </div>
      </details>

      <details className="card p-4 sm:p-5">
        <summary className="cursor-pointer font-serif text-lg font-semibold">Więcej: notatki, czy żyje</summary>
        <div className="mt-4 space-y-4">
          <LivingField />
          <DescriptionField name="notes" label="Notatki" />
        </div>
      </details>

      <SubmitButton pendingText="Zapisywanie…">Zapisz osobę</SubmitButton>
    </ActionForm>
  );
}
