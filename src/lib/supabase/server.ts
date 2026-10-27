import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";

/**
 * Klient Supabase dla komponentów serwerowych, Server Actions i Route Handlerów.
 * Tworzymy go na nowo przy każdym żądaniu – nie zapisuj go w zmiennej globalnej.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Komponent serwerowy nie może zapisywać ciasteczek.
            // To nie problem: sesję odświeża src/proxy.ts przy każdym żądaniu.
          }
        },
      },
    },
  );
}
