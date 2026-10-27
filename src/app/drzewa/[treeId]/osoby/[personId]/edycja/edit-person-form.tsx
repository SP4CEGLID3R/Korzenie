"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DescriptionField, LivingField, PersonFields, type PersonDefaults } from "@/components/tree/fields";
import type { ActionState } from "@/lib/trees/forms";

export function EditPersonForm({
  action,
  defaults,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  defaults: PersonDefaults;
}) {
  return (
    <ActionForm action={action} className="mt-6 space-y-6">
      <div className="card space-y-4 p-4 sm:p-5">
        <PersonFields defaults={defaults} />
        <LivingField defaultValue={defaults.livingStatus} />
        <DescriptionField name="notes" label="Notatki" defaultValue={defaults.notes} />
      </div>
      <SubmitButton>Zapisz zmiany</SubmitButton>
    </ActionForm>
  );
}
