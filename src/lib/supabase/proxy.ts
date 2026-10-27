import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/** Ścieżki dostępne tylko po zalogowaniu. */
const PROTECTED_PREFIXES = ["/drzewa", "/konto"];
/** Strony logowania – zalogowanego użytkownika odsyłamy z nich do panelu. */
const AUTH_PAGES = ["/logowanie", "/rejestracja"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Odświeża sesję Supabase (ciasteczka) i wykonuje szybkie przekierowania.
 * To tylko „pierwsza linia” – każda strona i akcja serwerowa i tak sprawdza
 * użytkownika samodzielnie (src/lib/auth.ts).
 */
export async function updateSession(request: NextRequest) {
  const env = publicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Nie wstawiaj żadnego kodu między createServerClient a getClaims –
  // getClaims weryfikuje token i w razie potrzeby go odświeża.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!isLoggedIn && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirectKeepingCookies(url, response);
  }

  if (isLoggedIn && matchesPrefix(pathname, AUTH_PAGES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/drzewa";
    url.search = "";
    return redirectKeepingCookies(url, response);
  }

  return response;
}

/** Przekierowanie, które nie gubi świeżo odświeżonych ciasteczek sesji. */
function redirectKeepingCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
