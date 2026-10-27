"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { sendMagicLink, signInWithPassword, type FormState } from "@/app/(auth)/actions";
import { FormStatus } from "@/components/form-status";

const LINK_ERRORS: Record<string, string> = {
  link: "Link wygasł albo został już użyty. Zaloguj się ponownie lub poproś o nowy link.",
};

export function LoginForms() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const linkError = LINK_ERRORS[searchParams.get("blad") ?? ""];

  const [passwordState, passwordAction, passwordPending] = useActionState<FormState, FormData>(
    signInWithPassword,
    {},
  );
  const [linkState, linkAction, linkPending] = useActionState<FormState, FormData>(
    sendMagicLink,
    {},
  );

  return (
    <div className="space-y-8">
      {linkError && <FormStatus error={linkError} />}

      <form action={passwordAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="email" className="field-label">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={passwordState.email}
            className="field-input"
          />
        </div>
        <div>
          <label htmlFor="password" className="field-label">
            Hasło
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field-input"
          />
        </div>
        <FormStatus error={passwordState.error} />
        <button type="submit" className="btn-primary w-full" disabled={passwordPending}>
          {passwordPending ? "Logowanie…" : "Zaloguj się"}
        </button>
      </form>

      <div className="flex items-center gap-3 text-sm text-ink-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        albo
        <span className="h-px flex-1 bg-line" />
      </div>

      <form action={linkAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="magic-email" className="field-label">
            Zaloguj się linkiem wysłanym na e-mail
          </label>
          <input
            id="magic-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={linkState.email}
            className="field-input"
          />
          <p className="mt-1 text-sm text-ink-muted">Bez hasła – przyda się też, gdy je zapomnisz.</p>
        </div>
        <FormStatus error={linkState.error} message={linkState.message} />
        <button type="submit" className="btn-secondary w-full" disabled={linkPending}>
          {linkPending ? "Wysyłanie…" : "Wyślij link logowania"}
        </button>
      </form>
    </div>
  );
}
