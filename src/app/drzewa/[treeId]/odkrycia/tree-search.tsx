"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormStatus } from "@/components/form-status";
import type { BatchState } from "./actions";

/** Szukanie dla całego drzewa: kolejne porcje osób, z paskiem postępu. */
export function TreeSearch({ action }: { action: (prev: BatchState) => Promise<BatchState> }) {
  const router = useRouter();
  const [state, setState] = useState<BatchState | null>(null);
  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  // Flaga zatrzymania poza stanem Reacta – pętla w start() musi widzieć zmianę od razu.
  const stopFlag = useRef(false);

  async function start() {
    setRunning(true);
    setStopRequested(false);
    let s: BatchState = { done: 0, total: 0, newMatches: 0, finished: false, cursor: null };
    stopFlag.current = false;
    while (!s.finished && !stopFlag.current) {
      s = await action(s);
      setState(s);
      if (s.error) break;
    }
    setRunning(false);
    router.refresh();
  }

  const percent = state && state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Szukaj w Wikidata dla całego drzewa</h3>
          <p className="text-sm text-ink-muted">
            Wikidata zawiera głównie osoby znane (np. szlachtę, duchownych, artystów, działaczy). Wyniki
            zapamiętujemy na 30 dni.
          </p>
        </div>
        {running ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              stopFlag.current = true;
              setStopRequested(true);
            }}
            disabled={stopRequested}
          >
            {stopRequested ? "Zatrzymywanie…" : "Zatrzymaj"}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={start}>
            Szukaj propozycji
          </button>
        )}
      </div>
      {state && (
        <div className="mt-3" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-paper-sunken" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            Sprawdzono {state.done} z {state.total} osób (pomijamy osoby żyjące). Nowe propozycje: {state.newMatches}.
            {state.finished && !state.error ? " Gotowe." : ""}
          </p>
          <FormStatus error={state.error} />
        </div>
      )}
    </div>
  );
}
