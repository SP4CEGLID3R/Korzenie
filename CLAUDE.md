@AGENTS.md

# Korzenie – zasady projektu

Polski serwis genealogiczny (drzewa rodzinne + polskie źródła + AI). Właściciel jest
początkującym programistą: tłumacz decyzje krótko po polsku, wybieraj proste i tanie
rozwiązania, pracuj fazami i po każdej fazie zatrzymaj się z instrukcją testowania.

## Twarde zasady (nie łam)
- AI nie wymyśla faktów o przodkach. Fakty tylko z potwierdzonych rekordów lub od użytkownika.
  Teksty AI oddzielają „fakt z dokumentu” od „kontekstu historycznego” i mają listę źródeł z linkami.
- Dopasowania zatwierdza człowiek. Nic nie trafia do drzewa automatycznie. Odrzucone nie wraca
  (unikalność `Match(personId, recordId)`).
- Każdy rekord ma link do oryginału i źródło. Geneteka (praca wolontariuszy PTG): domyślnie tylko
  gotowe linki; adapter pobierający za flagą `GENETEKA_FETCH_ENABLED=false`, ≥ kilka sekund między
  zapytaniami, cache, przedstawiający się User-Agent, robots.txt. Przed produkcją: zgoda PTG –
  przypominaj o tym.
- Nie używamy FamilySearch, MyHeritage, Ancestry (brak otwartego API, nie scrapujemy).
- MyHeritage to tylko punkt odniesienia funkcjonalnego: nie kopiujemy kodu, tekstów, grafik,
  układu; nie używamy ich nazw ani znaków towarowych (Smart Matches, Record Matches, Record
  Detective, Instant Discoveries, Deep Nostalgia, PedigreeMap, Theory of Family Relativity itd.).
  Nasze nazwy funkcji: Tropy (dopasowania), Tropiciel (asystent / następne kroki), Czytnik metryk,
  Tło epoki, Strażnik spójności, Mapa wędrówek.
- RODO: osoba urodzona < 100 lat temu bez zgonu = żyjąca (`src/lib/privacy/living.ts`);
  drzewa domyślnie prywatne; potrzebna polityka prywatności i usuwanie konta ze wszystkimi danymi.
- Klucze tylko w `.env` (wzór `.env.example`). Claude API wyłącznie po stronie serwera, z limitem
  zapytań na użytkownika, logowaniem kosztu (`AiCall`) i cache odpowiedzi.

## Stos i konwencje
- Next.js 16 (App Router, Turbopack, `cacheComponents` + `partialPrefetching` włączone),
  TypeScript, Tailwind v4, Supabase Auth (`@supabase/ssr`), Prisma 7 z `@prisma/adapter-pg`,
  Vitest. Modele AI: `claude-sonnet-5-5` (biografie, kontekst, dokumenty), `claude-haiku-5-5`
  (tańsze zadania).
- Next 16: `src/proxy.ts` zamiast middleware. Odczyt sesji/ciasteczek musi być w komponencie
  wewnątrz `<Suspense>`; `getSessionUser()` woła `connection()`. Po mutacji w Server Action: `refresh()`.
- Autoryzacja: każda strona i Server Action woła `requireUser()` (`src/lib/auth.ts`) i sprawdza
  członkostwo w drzewie (`TreeMember`). Proxy to tylko optymistyczne przekierowania.
- Wszystkie modele Prisma w schemacie Postgresa `app` (`@@schema("app")` przy każdym modelu
  i enumie) – niewidoczne dla publicznego API Supabase. Klient generowany do `src/generated/prisma`.
- Migracje: `npm run db:migrate` lokalnie (Supabase CLI w Dockerze), `npm run db:deploy` na
  bazie w chmurze.
- UI, komunikaty i komentarze po polsku; identyfikatory w kodzie po angielsku. Polskie URL-e
  (`/drzewa`, `/logowanie`). Mobile-first. Kolory tylko przez tokeny z `globals.css`
  (papier/atrament/sepia, tryb ciemny przez klasę `.dark`). Teksty neutralne płciowo.
- Przed oddaniem fazy: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## Fazy
0 fundament ✅ · 1 ręczne drzewo, GEDCOM, spójność · 2 silnik dopasowań + Wikidata + „Odkrycia” ·
3 Geneteka + Tropiciel · 4 AI (biografie, kontekst, Commons, czytnik, czat) ·
5 udostępnianie, komentarze, mapa, polityka prywatności, usuwanie konta, limity AI, Vercel.
