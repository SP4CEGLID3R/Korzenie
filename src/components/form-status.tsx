/** Komunikat pod formularzem: błąd albo potwierdzenie. */
export function FormStatus({ error, message }: { error?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (message) {
    return (
      <p role="status" className="rounded-md border border-moss/40 bg-paper-sunken px-3 py-2 text-sm text-ink">
        {message}
      </p>
    );
  }
  return null;
}
