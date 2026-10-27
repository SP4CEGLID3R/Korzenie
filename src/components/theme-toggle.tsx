"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const OPTIONS = [
  { value: "light", label: "Jasny" },
  { value: "dark", label: "Ciemny" },
  { value: "system", label: "Systemowy" },
] as const;

// Motyw znamy dopiero w przeglądarce – na serwerze renderujemy neutralny stan.
function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isClient = useIsClient();
  const current = isClient ? theme : undefined;

  return (
    <label className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <span className="sr-only sm:not-sr-only">Motyw</span>
      <select
        value={current ?? "system"}
        onChange={(e) => setTheme(e.target.value)}
        className="min-h-9 rounded-md border border-line bg-paper-raised px-2 py-1 text-sm text-ink"
        aria-label="Motyw kolorystyczny"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
