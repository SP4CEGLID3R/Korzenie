"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { FormStatus } from "@/components/form-status";
import type { ActionState } from "@/lib/trees/forms";

const PendingContext = createContext(false);

/**
 * Formularz wysyłający dane do akcji serwerowej.
 * W przeciwieństwie do zwykłego <form action>, NIE czyści pól po błędzie –
 * użytkownik poprawia tylko to, co trzeba. Po udanym zapisie może się
 * wyczyścić (resetOnSuccess) – przydatne w formularzach „dodaj kolejne”.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  onSuccess,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.savedAt) return;
    if (resetOnSuccess) formRef.current?.reset();
    onSuccess?.();
    // Reagujemy tylko na nowy zapis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  return (
    <form
      ref={formRef}
      className={className}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => dispatch(fd));
      }}
    >
      <PendingContext value={pending}>
        {children}
        <div className="mt-3" aria-live="polite">
          <FormStatus error={state.error} message={state.error ? undefined : state.message} />
        </div>
      </PendingContext>
    </form>
  );
}

export function SubmitButton({
  children,
  pendingText = "Zapisywanie…",
  className = "btn-primary",
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
