# Korzenie

Polski serwis do budowania drzew genealogicznych i odkrywania przodków
z wykorzystaniem polskich źródeł (indeksy metrykalne, archiwa, otwarte bazy)
i AI, które **nigdy nie wymyśla faktów**.

> **Stan: faza 2 – silnik dopasowań.** Działa wszystko z fazy 1 (drzewo, GEDCOM,
> „Strażnik spójności”) oraz „Odkrycia”: wyszukiwanie osób z drzewa w Wikidata,
> propozycje z wynikiem i wyjaśnieniem, potwierdzanie i odrzucanie. Silnik rozumie
> łacińskie i rosyjskie formy imion, żeńskie formy nazwisk i podobne brzmienie.
> Kolejne fazy: polskie źródła (Geneteka) → funkcje AI → społeczność i wdrożenie.

---

## Czego potrzebujesz

| Co | Po co | Gdzie |
| --- | --- | --- |
| **Node.js 22 LTS** | uruchamianie aplikacji | <https://nodejs.org> |
| **Git** | pobranie kodu | <https://git-scm.com> |
| **Konto Supabase** (darmowe) | baza danych i logowanie | <https://supabase.com> |
| Edytor, np. VS Code | praca z kodem | <https://code.visualstudio.com> |
| *(opcjonalnie)* Docker Desktop | wszystko lokalnie, bez internetu – wariant B | <https://www.docker.com> |

Sprawdź wersje w terminalu: `node -v` (ma być v22 lub nowszy) i `git --version`.

---

## Uruchomienie krok po kroku – wariant A: Supabase w chmurze (zalecany)

### 1. Pobierz kod i zainstaluj zależności

```bash
git clone https://github.com/SP4CEGLID3R/Korzenie.git
cd Korzenie
npm install
```

`npm install` sam wygeneruje też klienta bazy danych (Prisma).

### 2. Załóż projekt w Supabase

1. Zaloguj się na <https://supabase.com> → **New project**.
2. Nazwa: np. `korzenie`. **Region: Central EU (Frankfurt)** – dane zostają w UE (RODO).
3. Kliknij **Generate a password**, a hasło **zapisz** (np. w menedżerze haseł) – będzie potrzebne za chwilę.
4. Poczekaj ok. 2 minut, aż projekt się utworzy.

### 3. Skopiuj plik z ustawieniami

```bash
cp .env.example .env
```

(W Windows PowerShell: `Copy-Item .env.example .env`.) Otwórz `.env` w edytorze i uzupełnij:

| Zmienna | Skąd wziąć |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → Data API** → *Project URL* (albo przycisk **Connect** u góry) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Project Settings → API Keys** → *Publishable key* (zaczyna się od `sb_publishable_`) |
| `DATABASE_URL` | przycisk **Connect** → *Connection String* → **Transaction pooler** (port **6543**) |
| `DIRECT_URL` | przycisk **Connect** → *Connection String* → **Session pooler** (port **5432**) |

W obu adresach bazy zamień `[YOUR-PASSWORD]` na hasło z kroku 2.
`NEXT_PUBLIC_SITE_URL` zostaw jako `http://localhost:3000`.

> ⚠️ Plik `.env` zawiera hasło do bazy. Jest w `.gitignore` – **nigdy go nie commituj
> i nikomu nie wysyłaj**. Klucz *publishable* jest jawny (trafia do przeglądarki),
> ale klucza *secret* / *service_role* nie wpisuj nigdzie w kodzie.

### 4. Ustaw adresy logowania w Supabase

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs** → *Add URL*: `http://localhost:3000/auth/confirm`

Bez tego linki z maili (potwierdzenie konta, logowanie linkiem) nie zadziałają.

### 5. Utwórz tabele w bazie

```bash
npm run db:deploy
```

Powinno się skończyć komunikatem *„All migrations have been successfully applied”*.
Tabele aplikacji trafiają do osobnego schematu `app` (w Supabase: **Table Editor** →
przełącznik schematu u góry → `app`).

### 6. Uruchom aplikację

```bash
npm run dev
```

Otwórz <http://localhost:3000>.

### 7. Sprawdź, czy wszystko działa

1. **Załóż konto** → podaj e-mail i hasło (min. 8 znaków).
2. Odbierz maila od Supabase i kliknij link – **w tej samej przeglądarce**, w której zakładasz konto.
3. Trafisz do **Moje drzewa** → wpisz nazwę i kliknij **Utwórz drzewo**.
4. **Wyloguj** i zaloguj się ponownie hasłem, a potem spróbuj **linkiem logowania**.
5. Przełącz **Motyw** (jasny / ciemny / systemowy) w nagłówku.
6. Wejdź na <http://localhost:3000/drzewa> po wylogowaniu – powinno przenieść do logowania.

> 💡 Darmowy Supabase wysyła tylko kilka maili na godzinę. Jeśli mail nie dochodzi,
> odczekaj chwilę albo – tylko na czas nauki – wyłącz potwierdzanie: **Authentication →
> Sign In / Providers → Email → Confirm email**. Przed startem publicznym podłączymy
> własny serwer pocztowy (np. Resend).

### 8. Faza 1 – drzewo, GEDCOM, spójność

1. **Moje drzewa** → wpisz nazwę → **Utwórz drzewo**. Zobaczysz formularz **„Zacznij od siebie”**.
2. Wpisz siebie, rodziców (i ewentualnie dziadków). Pole daty od razu pokazuje, jak
   aplikacja ją zrozumiała – spróbuj „ok. 1930”, „przed 1863”, „12.03.1850”, „1850–1855”.
3. Po zapisaniu zobaczysz **wykres drzewa**. Kliknij osobę – stanie w środku; kliknij ponownie –
   otworzy się jej **karta**.
4. Na karcie osoby: dodaj wydarzenie (np. zawód, zgon), datę i miejsce ślubu, **syna / córkę**
   (nazwisko podpowie się w formie żeńskiej, np. Nowicki → Nowicka), rodzica lub małżonka.
   „Połącz z osobą, która już jest w drzewie” łączy dwie istniejące osoby.
5. Wpisz specjalnie błędną datę (np. zgon ojca przed urodzeniem dziecka) – na karcie i w zakładce
   **Spójność** pojawi się ostrzeżenie.
6. **Ustawienia i eksport** → **Pobierz pełne drzewo (.ged)**. Potem **Moje drzewa → Zaimportuj
   plik GEDCOM** i wgraj pobrany plik (albo eksport z innego serwisu) – powstanie nowe drzewo.
7. W ustawieniach zmień nazwę drzewa i usuń drzewo testowe (trzeba wpisać jego nazwę).

### 9. Faza 2 – Odkrycia (Wikidata)

1. W pliku `.env` wpisz `APP_CONTACT_EMAIL=` z adresem kontaktowym (Wikimedia wymaga, żeby
   automat się przedstawiał; bez adresu podajemy tylko link do projektu).
2. Załóż drzewo z kimś znanym, np. **Tadeusz Kościuszko** (ur. 1746, zm. 1817), ojciec **Ludwik**,
   matka **Tekla Ratomska**, i dopisz siebie jako potomka (żyjącego).
3. Na karcie Tadeusza kliknij **Szukaj tej osoby w Wikidata**. Na Twojej karcie przycisku nie ma –
   osób żyjących nie wysyłamy do żadnego serwisu.
4. Zakładka **Odkrycia**: osoba z drzewa po lewej, rekord po prawej, wynik w % i „Dlaczego taki
   wynik?”. Kliknij **Szukaj propozycji**, żeby sprawdzić całe drzewo.
5. **Potwierdź** – rekord pojawi się na karcie osoby w „Źródłach”. **Odrzuć** – propozycja nie
   wróci, nawet po ponownym wyszukaniu. „Cofnij decyzję” przywraca ją do sprawdzenia.

> Wikidata zawiera głównie osoby znane. Zwykłych przodków znajdziemy w indeksach metrykalnych
> (Geneteka) w fazie 3 – silnik dopasowań jest już na to gotowy.

---

## Wariant B: wszystko lokalnie (Docker)

Supabase można uruchomić na własnym komputerze – razem z bazą i podglądem maili.
Wymaga zainstalowanego i włączonego **Docker Desktop** (pierwsze uruchomienie pobiera kilka GB).

```bash
npm run supabase:start      # pierwsze uruchomienie trwa kilka minut
npx supabase status         # pokaże adresy i klucze
```

W `.env` wpisz:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # „Publishable” z `npx supabase status`
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
GENETEKA_FETCH_ENABLED=false
```

Potem `npm run db:deploy` i `npm run dev`. Maile (potwierdzenia, linki logowania)
zobaczysz w skrzynce testowej **Mailpit**: <http://127.0.0.1:54324>.
Panel bazy (Studio): <http://127.0.0.1:54323>. Zatrzymanie: `npm run supabase:stop`.

---

## Polecenia

| Polecenie | Co robi |
| --- | --- |
| `npm run dev` | aplikacja w trybie deweloperskim (automatyczne odświeżanie) |
| `npm run build` / `npm start` | wersja produkcyjna: zbudowanie i uruchomienie |
| `npm test` | testy jednostkowe (Vitest) |
| `npm run lint` | sprawdzenie stylu kodu (ESLint) |
| `npm run typecheck` | sprawdzenie typów TypeScript |
| `npm run db:deploy` | zastosowanie migracji bazy (tworzy/aktualizuje tabele) |
| `npm run db:migrate` | *dla programisty:* nowa migracja po zmianie `prisma/schema.prisma` – tylko na lokalnej bazie (wariant B) |
| `npm run db:studio` | przeglądarka danych Prisma Studio |
| `npm run supabase:start` / `supabase:stop` | lokalny Supabase w Dockerze (wariant B) |

---

## Struktura projektu

```
prisma/
  schema.prisma          model danych (osoby, wydarzenia, miejsca, źródła, dopasowania…)
  migrations/            historia zmian bazy
supabase/config.toml     ustawienia lokalnego Supabase (wariant B)
src/
  proxy.ts               odświeżanie sesji i przekierowania (dawne „middleware”)
  app/                   strony (Next.js App Router)
    page.tsx             strona startowa
    (auth)/              logowanie, rejestracja i akcje logowania
    auth/confirm/        tu prowadzą linki z maili
    drzewa/              panel „Moje drzewa”, import GEDCOM
      [treeId]/          drzewo: wykres, osoby, karta osoby, spójność, ustawienia, eksport
        actions.ts       wszystkie zmiany w drzewie (osoby, wydarzenia, relacje)
  components/            nagłówek, stopka, motyw, logo, pola formularzy
  lib/
    genealogy/           daty genealogiczne, nazwiska, spójność, dane do wykresu (+ testy)
    matching/            silnik dopasowań: słownik imion, normalizacja, fonetyka, punktacja (+ testy)
      config.ts          WSZYSTKIE wagi i progi dopasowań w jednym miejscu
      data/given-names.ts słownik imion łacina / niemiecki / rosyjski → polski
    sources/             źródła danych (wspólny interfejs adapterów), Wikidata (+ testy)
    gedcom/              czytanie, import i eksport GEDCOM 5.5.1 (+ testy)
    trees/               uprawnienia do drzewa, odczyt i zapis w bazie, formularze
    auth.ts              kto jest zalogowany (używaj w każdej stronie i akcji)
    db.ts                połączenie z bazą (Prisma)
    env.ts               sprawdzanie zmiennych środowiskowych
    supabase/            klienci Supabase (serwer, proxy)
    privacy/living.ts    reguła „osoba żyjąca” (RODO) + testy
    safe-redirect.ts     ochrona przed przekierowaniem na obce strony + testy
  generated/prisma/      klient Prisma (generowany, nie edytuj, nie ma go w git)
```

---

## Bezpieczeństwo i prywatność – jak to działa

- **Sekrety tylko w `.env`.** W repozytorium jest wyłącznie `.env.example` bez prawdziwych wartości.
- **Dane aplikacji w schemacie `app`.** Publiczne API Supabase (klucz publishable) widzi tylko
  schemat `public`, więc do drzew, osób i dopasowań nie da się dostać z pominięciem naszego serwera.
  Dodatkowo migracja `lock_app_schema` odbiera tym rolom wszelkie uprawnienia.
- **Każda strona i akcja serwerowa sama sprawdza użytkownika** (`requireUser()` w `src/lib/auth.ts`).
  `proxy.ts` tylko odświeża sesję i przekierowuje – nie jest jedynym zabezpieczeniem.
- **Osoba żyjąca:** urodzona mniej niż 100 lat temu i bez zgonu – albo bez żadnych dat – jest
  traktowana jako żyjąca (`src/lib/privacy/living.ts`). Wykorzystamy to w udostępnianych drzewach.
- **Wywołania Claude API** (od fazy 4) – wyłącznie po stronie serwera, z limitem na użytkownika.

---

## Rozwiązywanie problemów

| Objaw | Rozwiązanie |
| --- | --- |
| `Brak lub błędne zmienne środowiskowe: …` | Brakuje pliku `.env` albo którejś wartości – porównaj z `.env.example`. Po zmianie `.env` zrestartuj `npm run dev`. |
| `P1001: Can't reach database server` | Zły adres lub hasło w `DATABASE_URL`/`DIRECT_URL`, albo projekt Supabase jest uśpiony (darmowy plan usypia po tygodniu bez ruchu – wybudzisz go w panelu Supabase). |
| „Link wygasł albo został już użyty” | Link z maila działa raz i tylko w przeglądarce, w której o niego poproszono. Poproś o nowy. Sprawdź też *Redirect URLs* (krok 4). |
| Mail nie przychodzi | Sprawdź spam. Darmowy Supabase ma niski limit maili na godzinę (patrz krok 7). |
| Po `git pull` coś nie działa | Uruchom `npm install` i `npm run db:deploy`. |
| Import GEDCOM: „Plik jest za duży” | Limit to 4 MB (tyle przyjmuje darmowy hosting). Duże drzewo wyeksportuj bez zdjęć albo podziel. |
| Odkrycia: „Serwis ograniczył liczbę zapytań” | Wikidata chwilowo ogranicza ruch. Odczekaj kilka minut. Wyniki zapamiętujemy na 30 dni, więc powtórne szukanie jest szybkie. |
| Polskie znaki po imporcie są zepsute | Plik był w starym kodowaniu (ANSEL). Wyeksportuj drzewo ponownie, wybierając UTF-8. |

---

## Ważne przypomnienia

- **Geneteka:** automatyczne pobieranie wyników (`GENETEKA_FETCH_ENABLED`) jest domyślnie wyłączone.
  **Przed włączeniem go na produkcji trzeba uzyskać zgodę Polskiego Towarzystwa Genealogicznego.**
  Do tego czasu aplikacja tylko generuje linki do wyszukiwania, które użytkownik otwiera sam.
- **Hosting:** darmowy plan Vercel (Hobby) jest tylko do użytku niekomercyjnego. Przed włączeniem
  płatnych funkcji AI potrzebny będzie plan płatny albo inny hosting.
- **Nazwa:** przed publicznym startem sprawdź, czy „Korzenie” nie jest zastrzeżonym znakiem
  towarowym (bazy UPRP i EUIPO).
