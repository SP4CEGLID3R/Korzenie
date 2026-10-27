import "server-only";
import { SourceError } from "./types";

// Uprzejme pobieranie danych z zewnętrznych serwisów:
//  • przedstawiamy się (User-Agent z adresem projektu i kontaktem),
//  • zapytania do jednego serwisu idą po kolei, z odstępem `minIntervalMs`,
//  • przy odpowiedzi 429/503 czekamy tyle, ile każe serwer (Retry-After),
//  • po kilku nieudanych próbach poddajemy się z czytelnym komunikatem.

export const PROJECT_URL = "https://github.com/SP4CEGLID3R/Korzenie";

export function userAgent() {
  const contact = process.env.APP_CONTACT_EMAIL?.trim();
  return `Korzenie/0.2 (${PROJECT_URL}${contact ? `; ${contact}` : ""}) genealogia`;
}

const queues = new Map<string, Promise<unknown>>();
const lastRequestAt = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PoliteOptions = {
  /** Klucz kolejki – zwykle nazwa serwisu. */
  host: string;
  minIntervalMs: number;
  maxRetries?: number;
  /** Najdłuższy czas, jaki zgadzamy się czekać na Retry-After. */
  maxRetryWaitMs?: number;
  timeoutMs?: number;
};

export async function politeFetch(url: string, init: RequestInit, opts: PoliteOptions): Promise<Response> {
  const run = async () => {
    const { host, minIntervalMs, maxRetries = 2, maxRetryWaitMs = 15_000, timeoutMs = 25_000 } = opts;
    for (let attempt = 0; ; attempt++) {
      const wait = (lastRequestAt.get(host) ?? 0) + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt.set(host, Date.now());

      let res: Response;
      try {
        res = await fetch(url, {
          ...init,
          headers: { "User-Agent": userAgent(), "Api-User-Agent": userAgent(), ...init.headers },
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
      } catch {
        if (attempt < maxRetries) continue;
        throw new SourceError("Nie udało się połączyć z serwisem. Spróbuj ponownie za chwilę.");
      }

      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1);
        if (ms > maxRetryWaitMs) {
          throw new SourceError("Serwis jest teraz przeciążony i prosi o przerwę. Spróbuj ponownie za kilka minut.");
        }
        await sleep(ms);
        continue;
      }
      if (res.status === 429) {
        throw new SourceError("Serwis ograniczył liczbę zapytań. Spróbuj ponownie za kilka minut.");
      }
      if (!res.ok) throw new SourceError(`Serwis odpowiedział błędem (${res.status}).`);
      return res;
    }
  };

  // Kolejka: kolejne zapytanie do tego samego serwisu czeka na poprzednie.
  const prev = queues.get(opts.host) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(run);
  queues.set(opts.host, next);
  return next;
}
