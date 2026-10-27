import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
};

/**
 * Zalogowany użytkownik według Supabase albo null.
 * `cache` z Reacta sprawia, że w obrębie jednego żądania pytamy tylko raz.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Sesja zależy od konkretnego żądania (i od bieżącego czasu – ważność tokenu),
  // więc ta część nigdy nie może być wyrenderowana z wyprzedzeniem.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: claims.email ?? "" };
});

/**
 * Wymaga zalogowania i zwraca użytkownika z naszej bazy.
 * Przy pierwszym logowaniu tworzy jego profil (tabela app.User).
 * Wywołuj na początku każdej chronionej strony i każdej akcji serwerowej.
 */
export const requireUser = cache(async () => {
  const session = await getSessionUser();
  if (!session) redirect("/logowanie");

  const existing = await db.user.findUnique({ where: { id: session.id } });
  if (existing) {
    if (session.email && existing.email !== session.email) {
      return db.user.update({
        where: { id: session.id },
        data: { email: session.email },
      });
    }
    return existing;
  }

  return db.user.upsert({
    where: { id: session.id },
    create: { id: session.id, email: session.email },
    update: {},
  });
});
