import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/(auth)/actions";
import { LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSessionUser } from "@/lib/auth";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-paper/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-ink no-underline">
          <LogoMark className="h-8 w-8 text-ink" />
          <span className="font-serif text-xl font-semibold tracking-tight">Korzenie</span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="Główna nawigacja">
          {/* Stan zalogowania zależy od ciasteczek, więc dociąga się osobno. */}
          <Suspense fallback={<span className="h-11 w-24" aria-hidden="true" />}>
            <AuthLinks />
          </Suspense>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

async function AuthLinks() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <>
        <Link href="/logowanie" className="btn-ghost">
          Zaloguj się
        </Link>
        <Link href="/rejestracja" className="btn-primary hidden sm:inline-flex">
          Załóż konto
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/drzewa" className="btn-ghost">
        Moje drzewa
      </Link>
      <span className="hidden max-w-48 truncate text-sm text-ink-muted md:inline" title={user.email}>
        {user.email}
      </span>
      <form action={signOut}>
        <button type="submit" className="btn-secondary">
          Wyloguj
        </button>
      </form>
    </>
  );
}
