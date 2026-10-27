"use client";

import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { DateInput } from "@/components/forms/date-input";
import { DescriptionField, EventTypeSelect, PlaceFields, SelectField } from "@/components/tree/fields";
import type { EventType } from "@/lib/genealogy/types";
import type { ActionState } from "@/lib/trees/forms";
import { ParentTypeSelect } from "../parent-type-select";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type EventDefaults = {
  type?: EventType;
  date?: string;
  place?: string | null;
  placeRegion?: string | null;
  parish?: string | null;
  description?: string | null;
};

/** Dodawanie / edycja wydarzenia osoby albo ślubu (fixedType = "MARRIAGE"). */
export function EventForm({
  action,
  listId,
  defaults = {},
  submitLabel,
  resetOnSuccess = false,
  fixedType,
}: {
  action: Action;
  listId: string;
  defaults?: EventDefaults;
  submitLabel: string;
  resetOnSuccess?: boolean;
  fixedType?: EventType;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={resetOnSuccess} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {!fixedType && <EventTypeSelect defaultValue={defaults.type} />}
        <DateInput name="date" label="Data" defaultValue={defaults.date} />
      </div>
      <PlaceFields listId={listId} defaults={defaults} />
      <DescriptionField defaultValue={defaults.description} />
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

/** Połączenie z osobą, która już jest w drzewie. */
export function LinkExistingForm({
  action,
  options,
}: {
  action: Action;
  options: { id: string; label: string }[];
}) {
  return (
    <ActionForm action={action} resetOnSuccess className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          name="relation"
          label="Wybrana osoba to"
          defaultValue="parent"
          options={[
            ["parent", "rodzic"],
            ["spouse", "małżonek / partner"],
            ["child", "dziecko"],
          ]}
        />
        <div className="sm:col-span-2">
          <SelectField
            name="otherId"
            label="Osoba"
            defaultValue=""
            options={[["", "— wybierz z listy —"], ...options.map((o): [string, string] => [o.id, o.label])]}
          />
        </div>
      </div>
      <div className="max-w-xs">
        <ParentTypeSelect name="parentType" label="Pokrewieństwo (dla rodzica / dziecka)" />
      </div>
      <SubmitButton>Połącz</SubmitButton>
    </ActionForm>
  );
}

/** Przycisk w formularzu, który najpierw pyta o potwierdzenie. */
export function ConfirmSubmit({
  message,
  children,
  className = "btn-ghost text-danger",
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
