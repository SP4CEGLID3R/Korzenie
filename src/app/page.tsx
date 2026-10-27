import Link from "next/link";

const FEATURES = [
  {
    name: "Tropy",
    text: "Propozycje aktów pasujących do osób z Twojego drzewa – z wynikiem i wyjaśnieniem, co się zgadza, a co nie.",
  },
  {
    name: "Tropiciel",
    text: "Po każdym potwierdzonym akcie podpowiada następny krok: ślub rodziców, rodzeństwo w sąsiednich parafiach, zgony.",
  },
  {
    name: "Czytnik metryk",
    text: "Wgrywasz skan aktu po łacinie, rosyjsku lub niemiecku – dostajesz odczyt, tłumaczenie i dane do zatwierdzenia.",
  },
  {
    name: "Tło epoki",
    text: "Jak wyglądało życie przodka: zabór, wydarzenia, historia miejscowości. Zawsze z podanymi źródłami.",
  },
  {
    name: "Strażnik spójności",
    text: "Wyłapuje błędy, np. dziecko urodzone po śmierci matki albo matkę, która miała 8 lat przy porodzie.",
  },
  {
    name: "Mapa wędrówek",
    text: "Miejsca urodzeń, ślubów i zgonów na mapie – i droga, którą rodzina przeszła przez pokolenia.",
  },
] as const;

const PRINCIPLES = [
  {
    title: "Fakty tylko ze źródeł",
    text: "AI nie dopisuje niczego o Twoich przodkach. Każdy fakt pochodzi z dokumentu albo od Ciebie i ma link do oryginału.",
  },
  {
    title: "Ty decydujesz",
    text: "Nic nie trafia do drzewa samo. Każdą propozycję potwierdzasz albo odrzucasz – odrzucona już nie wraca.",
  },
  {
    title: "Drzewo bez limitu, za darmo",
    text: "Płatne są tylko funkcje AI, bo kosztują nas realne pieniądze. Eksport do GEDCOM w każdej chwili.",
  },
  {
    title: "Prywatność",
    text: "Drzewa są domyślnie prywatne. Osoby żyjące widać w udostępnionym drzewie tylko jako „Osoba żyjąca”.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-12 sm:py-20 md:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
            Genealogia z polskimi źródłami
          </p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Odnajdź swoich przodków w&nbsp;polskich metrykach
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-muted">
            Zbuduj drzewo rodzinne, a Korzenie podpowiedzą, gdzie szukać kolejnych aktów –
            w indeksach parafialnych, archiwach i otwartych bazach. Zawsze z informacją, skąd
            pochodzi każdy fakt.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/rejestracja" className="btn-primary">
              Zacznij za darmo
            </Link>
            <Link href="/logowanie" className="btn-secondary">
              Mam już konto
            </Link>
          </div>
        </div>

        <ExampleTrail />
      </section>

      <section className="border-y border-line bg-paper-sunken/60">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
          <h2 className="font-serif text-3xl font-semibold tracking-tight">Co będą potrafiły Korzenie</h2>
          <p className="mt-2 text-ink-muted">
            Serwis powstaje etapami – funkcje będą pojawiać się po kolei.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.name} className="card p-5">
                <h3 className="font-serif text-xl font-semibold">{f.name}</h3>
                <p className="mt-2 text-ink-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <h2 className="font-serif text-3xl font-semibold tracking-tight">Nasze zasady</h2>
        <dl className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="border-l-2 border-accent pl-4">
              <dt className="font-semibold">{p.title}</dt>
              <dd className="mt-1 text-ink-muted">{p.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

/** Ilustracja: jak będzie wyglądała propozycja dopasowania z wyjaśnieniem. */
function ExampleTrail() {
  const rows = [
    { ok: true, text: "Nazwisko: Kowalski" },
    { ok: true, text: "Imię: Joannes → Jan" },
    { ok: true, text: "Ojciec: Adalbertus → Wojciech" },
    { ok: true, text: "Matka z domu: Nowak" },
    { ok: false, text: "Rok: 1851 zamiast 1852 (±1)" },
  ];

  return (
    <figure className="card relative rotate-[0.6deg] p-5 sm:p-6" aria-label="Przykład propozycji dopasowania">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Przykładowy trop</p>
        <p className="font-serif text-3xl font-semibold text-accent">92%</p>
      </div>
      <p className="mt-3 font-serif text-lg leading-snug">
        Akt chrztu, parafia Chęciny, 1851
        <span className="block text-base text-ink-muted">„Joannes, filius Adalberti Kowalski et Hedvigis de Nowak”</span>
      </p>
      <ul className="mt-4 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.text} className="flex gap-2">
            <span aria-hidden="true" className={r.ok ? "text-moss" : "text-accent"}>
              {r.ok ? "✓" : "≈"}
            </span>
            <span>
              <span className="sr-only">{r.ok ? "Zgadza się: " : "Częściowo: "}</span>
              {r.text}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
        Ilustracja – dane fikcyjne.
      </figcaption>
    </figure>
  );
}
