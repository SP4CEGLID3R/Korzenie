"use client";

import { useActionState } from "react";
import { signUp, type FormState } from "@/app/(auth)/actions";
import { FormStatus } from "@/components/form-status";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});

  if (state.message) {
    return <FormStatus message={state.message} />;
  }

  return (
    <form action={action} className="space-y-4" noValidate>
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
          defaultValue={state.email}
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
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
          className="field-input"
        />
        <p id="password-hint" className="mt-1 text-sm text-ink-muted">
          Co najmniej 8 znaków.
        </p>
      </div>
      <div>
        <label htmlFor="passwordRepeat" className="field-label">
          Powtórz hasło
        </label>
        <input
          id="passwordRepeat"
          name="passwordRepeat"
          type="password"
          autoComplete="new-password"
          required
          className="field-input"
        />
      </div>
      <FormStatus error={state.error} />
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Zakładanie konta…" : "Załóż konto"}
      </button>
    </form>
  );
}
