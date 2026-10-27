"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { TextField } from "@/components/tree/fields";
import type { ActionState } from "@/lib/trees/forms";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export function RenameTreeForm({ action, name }: { action: Action; name: string }) {
  return (
    <ActionForm action={action} className="mt-4 space-y-3">
      <TextField name="name" label="Nazwa" defaultValue={name} />
      <SubmitButton>Zapisz nazwę</SubmitButton>
    </ActionForm>
  );
}

export function DeleteTreeForm({ action, name }: { action: Action; name: string }) {
  return (
    <ActionForm action={action} className="mt-4 space-y-3">
      <TextField name="confirm" label={`Aby potwierdzić, wpisz nazwę drzewa: ${name}`} />
      <SubmitButton className="btn bg-danger text-paper hover:opacity-90" pendingText="Usuwanie…">
        Usuń drzewo na zawsze
      </SubmitButton>
    </ActionForm>
  );
}
