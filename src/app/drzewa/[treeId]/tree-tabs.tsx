"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TreeTabs({ treeId, issueCount }: { treeId: string; issueCount: number }) {
  const pathname = usePathname();
  const base = `/drzewa/${treeId}`;
  const tabs = [
    { href: base, label: "Drzewo", active: pathname === base },
    { href: `${base}/osoby`, label: "Osoby", active: pathname.startsWith(`${base}/osoby`) },
    {
      href: `${base}/spojnosc`,
      label: "Spójność",
      active: pathname.startsWith(`${base}/spojnosc`),
      badge: issueCount,
    },
    { href: `${base}/ustawienia`, label: "Ustawienia i eksport", active: pathname.startsWith(`${base}/ustawienia`) },
  ];

  return (
    <nav aria-label="Sekcje drzewa" className="mt-4 -mx-4 overflow-x-auto border-b border-line px-4">
      <ul className="flex gap-1">
        {tabs.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 font-semibold ${
                t.active ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger" aria-label={`${t.badge} ostrzeżeń`}>
                  {t.badge}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
