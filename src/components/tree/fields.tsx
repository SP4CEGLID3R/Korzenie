// Pola formularzy osób i wydarzeń. Komponenty bez stanu – działają zarówno
// w komponentach serwerowych, jak i klienckich.
//
// Identyfikatory pól tworzy useId(): Next.js trzyma poprzednio odwiedzone
// strony ukryte w tle, więc stałe id (np. „surname”) mogłyby się powtórzyć
// i etykieta wskazywałaby pole z niewidocznej strony.

import { useId } from "react";
import { DateInput } from "@/components/forms/date-input";
import { EVENT_LABEL } from "@/lib/genealogy/names";
import type { EventType, LivingStatus, Sex } from "@/lib/genealogy/types";
import { PERSONAL_EVENT_TYPES } from "@/lib/trees/forms";

export type PersonDefaults = {
  givenNames?: string;
  surname?: string | null;
  birthSurname?: string | null;
  sex?: Sex;
  livingStatus?: LivingStatus;
  notes?: string | null;
};

export function TextField({
  name,
  label,
  defaultValue,
  hint,
  required,
  placeholder,
  autoFocus,
  list,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Id elementu <datalist> z podpowiedziami. */
  list?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        autoFocus={autoFocus}
        list={list}
        className="field-input"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

const SEX_OPTIONS: [Sex, string][] = [
  ["FEMALE", "Kobieta"],
  ["MALE", "Mężczyzna"],
  ["UNKNOWN", "Nieznana"],
];

export function SexField({ name = "sex", defaultValue = "UNKNOWN" }: { name?: string; defaultValue?: Sex }) {
  return (
    <fieldset>
      <legend className="field-label">Płeć</legend>
      <div className="flex flex-wrap gap-2">
        {SEX_OPTIONS.map(([value, label]) => (
          <label
            key={value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-paper-raised px-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input type="radio" name={name} value={value} defaultChecked={defaultValue === value} className="accent-[var(--accent)]" />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PersonFields({
  defaults = {},
  prefix = "",
  autoFocus,
}: {
  defaults?: PersonDefaults;
  prefix?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name={`${prefix}givenNames`} label="Imię (imiona)" defaultValue={defaults.givenNames} required autoFocus={autoFocus} />
      <TextField name={`${prefix}surname`} label="Nazwisko" defaultValue={defaults.surname} />
      <TextField
        name={`${prefix}birthSurname`}
        label="Nazwisko rodowe"
        defaultValue={defaults.birthSurname}
        hint="Dla kobiet zamężnych – nazwisko panieńskie. Bardzo ważne w metrykach."
      />
      <SexField name={`${prefix}sex`} defaultValue={defaults.sex} />
    </div>
  );
}

export function SelectField({
  name,
  label,
  defaultValue,
  options,
  hint,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: [value: string, label: string][];
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} className="field-input" aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function LivingField({ defaultValue = "AUTO" }: { defaultValue?: LivingStatus }) {
  return (
    <SelectField
      name="livingStatus"
      label="Czy osoba żyje?"
      defaultValue={defaultValue}
      options={[
        ["AUTO", "Ustal automatycznie (z dat)"],
        ["LIVING", "Żyje"],
        ["DECEASED", "Nie żyje"],
      ]}
      hint="Osoby żyjące są ukrywane w udostępnianych drzewach. Automatycznie: urodzona mniej niż 100 lat temu, bez daty zgonu."
    />
  );
}

export type PlaceOption = { name: string; jurisdiction: string | null; parish: string | null };

/** Datalisty z miejscami z drzewa – przeglądarka podpowiada je przy wpisywaniu. */
export function PlaceDatalist({ id, places }: { id: string; places: PlaceOption[] }) {
  const unique = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))];
  const lists: [string, string[]][] = [
    [`${id}-names`, unique(places.map((p) => p.name))],
    [`${id}-parishes`, unique(places.map((p) => p.parish))],
    [`${id}-regions`, unique(places.map((p) => p.jurisdiction))],
  ];
  return (
    <>
      {lists.map(([listId, values]) => (
        <datalist key={listId} id={listId}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
    </>
  );
}

export function PlaceFields({
  prefix = "",
  listId,
  defaults = {},
}: {
  prefix?: string;
  listId: string;
  defaults?: { place?: string | null; placeRegion?: string | null; parish?: string | null };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <TextField name={`${prefix}place`} label="Miejscowość" list={`${listId}-names`} defaultValue={defaults.place} />
      <TextField name={`${prefix}parish`} label="Parafia" list={`${listId}-parishes`} defaultValue={defaults.parish} />
      <TextField
        name={`${prefix}placeRegion`}
        label="Region"
        list={`${listId}-regions`}
        defaultValue={defaults.placeRegion}
        placeholder="powiat, województwo, kraj"
      />
    </div>
  );
}

export function EventTypeSelect({ name = "type", defaultValue = "BIRTH" }: { name?: string; defaultValue?: EventType }) {
  return (
    <SelectField
      name={name}
      label="Rodzaj wydarzenia"
      defaultValue={defaultValue}
      options={PERSONAL_EVENT_TYPES.map((t) => [t, EVENT_LABEL[t]])}
    />
  );
}

export function DescriptionField({
  name = "description",
  defaultValue,
  label = "Opis / zawód / uwagi",
}: {
  name?: string;
  defaultValue?: string | null;
  label?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea id={id} name={name} rows={2} defaultValue={defaultValue ?? ""} className="field-input" />
    </div>
  );
}

export { DateInput };
