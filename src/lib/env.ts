import { z } from "zod";

// Zmienne NEXT_PUBLIC_* muszą być odczytane dosłownie (process.env.NAZWA),
// żeby Next.js mógł je wstawić do kodu przeglądarki.
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cached: PublicEnv | undefined;

/** Zwraca zweryfikowane zmienne publiczne albo rzuca czytelnym błędem. */
export function publicEnv(): PublicEnv {
  if (cached) return cached;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Brak lub błędne zmienne środowiskowe: ${missing}. Sprawdź plik .env (wzór w .env.example).`,
    );
  }
  cached = parsed.data;
  return cached;
}
