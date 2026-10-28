"use client";

import { useActionState, useId, useState } from "react";
import { FormStatus } from "@/components/form-status";
import type { Suggestion } from "@/lib/detective/suggest";
import { buildGenetekaUrl, GENETEKA_KIND_LABEL, GENETEKA_REGIONS, type GenetekaRegion } from "@/lib/sources/geneteka-links";

type AutoState = { error?: string; message?: string };

export type TaskCardProps = {
  task: Suggestion;
  /** Imię i nazwisko osoby – na liście całego drzewa (na karcie osoby niepotrzebne). */
  personLabel?: string;
  personHref?: string;
  status: "OPEN" | "DONE" | "DISMISSED";
  isNew: boolean;
  canEdit: boolean;
  setStatus: (status: string) => Promise<void>;
  /** Automatyczne szukanie – tylko gdy włączono GENETEKA_FETCH_ENABLED. */
  autoSearch?: (searchIndex: number, prev: AutoState) => Promise<AutoState>;
};

function yearsText(t: Suggestion) {
  return t.years.min === t.years.max ? `${t.years.min}` : `${t.years.min}–${t.years.max}`;
}

function AutoSearchButton({ action }: { action: (prev: AutoState) => Promise<AutoState> }) {
  const [state, dispatch, pending] = useActionState<AutoState>(action, {});
  return (
    <form action={dispatch} className="space-y-1">
      <button type="submit" className="btn-ghost min-h-9 px-2 text-sm" disabled={pending}>
        {pending ? "Pobieranie…" : "Pobierz wyniki do Odkryć"}
      </button>
      <FormStatus error={state.error} message={state.message} />
    </form>
  );
}

/** Miejsca bez gotowych linków – podajemy frazę do wpisania. */
function OtherPlaces({ task }: { task: Suggestion }) {
  const q = task.searches[0]?.query;
  const who = [q?.name, q?.lastname].filter(Boolean).join(" ");
  const place = task.placeHint;
  const items = [
    { name: "Metryki.genealodzy.pl", url: "https://metryki.genealodzy.pl/", hint: place ? `skany ksiąg: wybierz parafię ${place}` : "skany ksiąg metrykalnych – wybierz parafię" },
    { name: "Szukaj w Archiwach", url: "https://www.szukajwarchiwach.gov.pl/", hint: place ? `wpisz: „${place}” (akta parafii / stanu cywilnego)` : "wpisz nazwę parafii" },
    { name: "Polona", url: "https://polona.pl/", hint: `wpisz: „${[q?.lastname, place].filter(Boolean).join(" ")}” (książki, gazety, spisy)` },
    ...(task.kind === "FIND_DEATH" ? [{ name: "Grobonet", url: "https://www.grobonet.com/", hint: `wpisz: „${who}” (groby, XX–XXI w.)` }] : []),
  ];
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer font-semibold text-ink-muted">Inne miejsca do sprawdzenia</summary>
      <ul className="mt-1 space-y-1">
        {items.map((i) => (
          <li key={i.name}>
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
              {i.name} ↗
            </a>{" "}
            <span className="text-ink-muted">– {i.hint}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function TaskCard({ task, personLabel, personHref, status, isNew, canEdit, setStatus, autoSearch }: TaskCardProps) {
  const regionId = useId();
  const [region, setRegion] = useState<GenetekaRegion | "">(task.region ?? "");
  const done = status !== "OPEN";

  return (
    <li className={`card p-4 ${done ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {personLabel && (
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              {personHref ? (
                <a href={personHref} className="underline underline-offset-4">
                  {personLabel}
                </a>
              ) : (
                personLabel
              )}
            </p>
          )}
          <h4 className="font-semibold">
            {task.title}
            {isNew && !done && <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-xs">nowe po potwierdzeniu</span>}
            {status === "DONE" && <span className="ml-2 text-sm text-moss">✓ zrobione</span>}
            {status === "DISMISSED" && <span className="ml-2 text-sm text-ink-muted">pominięte</span>}
          </h4>
          <p className="mt-1 text-sm text-ink-muted">{task.why}</p>
          <p className="mt-1 text-sm">
            Lata: <strong>{yearsText(task)}</strong>
          </p>
        </div>
      </div>

      {!done && (
        <>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={regionId} className="field-label">
                Województwo w Genetece
              </label>
              <select
                id={regionId}
                value={region}
                onChange={(e) => setRegion(e.target.value as GenetekaRegion | "")}
                className="min-h-11 rounded-md border border-line bg-paper-raised px-2 text-base"
              >
                <option value="">— wybierz —</option>
                {GENETEKA_REGIONS.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {!region && <p className="pb-2 text-sm text-ink-muted">Nie rozpoznaliśmy województwa – wybierz je, żeby zawęzić wyniki.</p>}
          </div>
          <ul className="mt-3 space-y-2">
            {task.searches.map((s, i) => (
              <li key={s.label} className="flex flex-wrap items-center gap-2">
                <a
                  href={buildGenetekaUrl({ ...s.query, region: region || null })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  Geneteka: {s.label} ({GENETEKA_KIND_LABEL[s.query.kind]}) ↗
                </a>
                {autoSearch && canEdit && <AutoSearchButton action={autoSearch.bind(null, i)} />}
              </li>
            ))}
          </ul>
          <OtherPlaces task={task} />
        </>
      )}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          {done ? (
            <form action={setStatus.bind(null, "OPEN")}>
              <button type="submit" className="btn-ghost min-h-9 px-2 text-sm">
                Przywróć
              </button>
            </form>
          ) : (
            <>
              <form action={setStatus.bind(null, "DONE")}>
                <button type="submit" className="btn-ghost min-h-9 px-2 text-sm">
                  ✓ Zrobione
                </button>
              </form>
              <form action={setStatus.bind(null, "DISMISSED")}>
                <button type="submit" className="btn-ghost min-h-9 px-2 text-sm">
                  Pomiń
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </li>
  );
}
