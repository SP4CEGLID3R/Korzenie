export const DEFAULT_AFTER_LOGIN = "/drzewa";

/**
 * Zwraca bezpieczną ścieżkę do przekierowania po zalogowaniu.
 * Przepuszcza tylko ścieżki wewnątrz aplikacji („/coś”), żeby nikt nie mógł
 * przygotować linku logowania, który przenosi na obcą stronę.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback = DEFAULT_AFTER_LOGIN,
): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  // „//evil.com” i „/\evil.com” przeglądarki traktują jak adres innej domeny.
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Znaki sterujące (np. nowa linia) nie mają czego szukać w ścieżce.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
