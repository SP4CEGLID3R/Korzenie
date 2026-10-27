import type { ReactNode } from "react";

export function AuthCard({
  title,
  intro,
  footer,
  children,
}: {
  title: string;
  intro?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">{title}</h1>
        {intro && <div className="mt-2 text-ink-muted">{intro}</div>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="mt-6 text-center text-ink-muted">{footer}</p>}
    </div>
  );
}
