/** Znak „Korzenie”: drzewo, którego korzenie odbijają koronę. */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="16" cy="16" r="14.5" className="stroke-accent" />
      {/* pień */}
      <path d="M16 7v18" />
      {/* korona */}
      <path d="M16 12c-2-2.5-4.5-3.5-7-3.5M16 12c2-2.5 4.5-3.5 7-3.5M16 9.5c-1-1.5-2.5-2.3-4-2.6M16 9.5c1-1.5 2.5-2.3 4-2.6" />
      {/* linia ziemi */}
      <path d="M8.5 16.5h15" className="stroke-accent" />
      {/* korzenie */}
      <path d="M16 20c-2 2.5-4.5 3.5-7 3.5M16 20c2 2.5 4.5 3.5 7 3.5M16 22.5c-1 1.5-2.5 2.3-4 2.6M16 22.5c1 1.5 2.5 2.3 4 2.6" />
    </svg>
  );
}
