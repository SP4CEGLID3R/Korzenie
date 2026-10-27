"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function TreeTabs({ treeId, issueCount, pendingCount }: { treeId: string; issueCount: number; pendingCount: number }) {
  const pathname = usePathname();
  const base = `/drzewa/${treeId}`;
  const tabs = [
    { href: base, label: "Drzewo", active: pathname === base },
    { href: `${base}/osoby`, label: "Osoby", active: pathname.startsWith(`${base}/osoby`) },
    {
      href: `${base}/odkrycia`,
      label: "Odkrycia",
      active: pathname.startsWith(`${base}/odkrycia`),
      badge: pendingCount,
      badgeLabel: "nowych propozycji",
      tone: "accent",
    },
    {
      href: `${base}/spojnosc`,
      label: "Spójność",
      active: pathname.startsWith(`${base}/spojnosc`),
      badge: issueCount,
      badgeLabel: "ostrzeżeń",
      tone: "danger",
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
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${t.tone === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-ink"}`}
                  aria-label={`${t.badge} ${t.badgeLabel}`}
                >
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
