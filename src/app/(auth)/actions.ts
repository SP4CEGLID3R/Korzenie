"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FormState = {
  error?: string;
  message?: string;
  /** Wartość e-maila, żeby nie znikała z formularza po błędzie. */
  email?: string;
};

const emailSchema = z.email({ error: "Podaj poprawny adres e-mail." });
const passwordSchema = z
  .string()
  .min(8, { error: "Hasło musi mieć co najmniej 8 znaków." })
  .max(72, { error: "Hasło może mieć najwyżej 72 znaki." });

/** Tłumaczy kody błędów Supabase Auth na komunikaty po polsku. */
function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Nieprawidłowy e-mail lub hasło.";
    case "email_not_confirmed":
      return "Najpierw potwierdź adres e-mail – link wysłaliśmy w wiadomości powitalnej.";
    case "weak_password":
      return "Hasło jest zbyt słabe. Użyj dłuższego hasła z literami i cyframi.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Zbyt wiele prób w krótkim czasie. Spróbuj ponownie za kilka minut.";
    case "signup_disabled":
      return "Rejestracja jest chwilowo wyłączona.";
    default:
      return "Coś poszło nie tak. Spróbuj ponownie za chwilę.";
  }
}

function confirmUrl(next: string) {
  const url = new URL("/auth/confirm", publicEnv().NEXT_PUBLIC_SITE_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signInWithPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, { error: "Podaj hasło." }) })
    .safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: authErrorMessage(error.code), email };
  }

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function sendMagicLink(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      // Link logowania tylko dla istniejących kont – zakładanie konta
      // odbywa się w formularzu rejestracji.
      shouldCreateUser: false,
      emailRedirectTo: confirmUrl(safeNextPath(String(formData.get("next") ?? ""))),
    },
  });

  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) {
    return { error: authErrorMessage(error.code), email };
  }

  // Ten sam komunikat niezależnie od tego, czy konto istnieje –
  // nie zdradzamy, kto ma u nas konto.
  return {
    message: "Jeśli to konto istnieje, wysłaliśmy na ten adres link do logowania. Sprawdź skrzynkę.",
    email,
  };
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      passwordRepeat: z.string(),
    })
    .refine((d) => d.password === d.passwordRepeat, {
      error: "Hasła nie są takie same.",
    })
    .safeParse({
      email,
      password: formData.get("password"),
      passwordRepeat: formData.get("passwordRepeat"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: confirmUrl("/drzewa") },
  });
  if (error) {
    return { error: authErrorMessage(error.code), email };
  }

  // Gdy potwierdzanie e-maila jest wyłączone, Supabase od razu loguje.
  if (data.session) {
    redirect("/drzewa");
  }

  return {
    message:
      "Gotowe! Wysłaliśmy wiadomość z linkiem potwierdzającym. Kliknij go, aby aktywować konto.",
    email,
  };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
