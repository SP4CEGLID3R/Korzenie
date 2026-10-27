import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center">
      <p className="font-serif text-6xl font-semibold text-accent">404</p>
      <h1 className="mt-4 font-serif text-2xl font-semibold">Tej strony nie ma w naszych księgach</h1>
      <p className="mt-2 text-ink-muted">Być może adres jest błędny albo strona została przeniesiona.</p>
      <Link href="/" className="btn-primary mt-8">
        Wróć na stronę główną
      </Link>
    </div>
  );
}
