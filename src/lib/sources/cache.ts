import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SourceKind } from "./types";

function cacheKey(kind: SourceKind, keyParts: unknown) {
  return createHash("sha256").update(`${kind}:${JSON.stringify(keyParts)}`).digest("hex");
}

export async function readCache<T>(kind: SourceKind, keyParts: unknown): Promise<T | null> {
  const hit = await db.sourceQueryCache.findUnique({ where: { key: cacheKey(kind, keyParts) } });
  return hit && hit.expiresAt > new Date() ? (hit.response as T) : null;
}

export async function writeCache(kind: SourceKind, keyParts: unknown, ttlDays: number, value: unknown) {
  const key = cacheKey(kind, keyParts);
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  await db.sourceQueryCache.upsert({
    where: { key },
    create: { key, kind, response: value as Prisma.InputJsonValue, expiresAt },
    update: { response: value as Prisma.InputJsonValue, fetchedAt: new Date(), expiresAt },
  });
}

/**
 * Wynik zapytania do zewnętrznego źródła trzymamy w bazie (tabela SourceQueryCache),
 * żeby nie pytać serwisu drugi raz o to samo – oszczędzamy ich serwery i czas użytkownika.
 */
export async function cachedQuery<T>(
  kind: SourceKind,
  keyParts: unknown,
  ttlDays: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = await readCache<T>(kind, keyParts);
  if (hit) return hit;
  const value = await fetcher();
  await writeCache(kind, keyParts, ttlDays, value);
  return value;
}
