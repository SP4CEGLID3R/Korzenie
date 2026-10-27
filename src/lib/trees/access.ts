import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export type TreeRole = "OWNER" | "EDITOR" | "VIEWER";

const uuid = z.uuid();

/**
 * Drzewo i rola zalogowanego użytkownika. Gdy drzewo nie istnieje albo
 * użytkownik nie jest jego członkiem – strona 404 (nie zdradzamy, że drzewo istnieje).
 */
export const getTreeAccess = cache(async (treeId: string) => {
  const user = await requireUser();
  if (!uuid.safeParse(treeId).success) notFound();

  const membership = await db.treeMember.findUnique({
    where: { treeId_userId: { treeId, userId: user.id } },
    include: { tree: true },
  });
  if (!membership) notFound();

  const role = membership.role as TreeRole;
  return {
    user,
    tree: membership.tree,
    role,
    canEdit: role === "OWNER" || role === "EDITOR",
    isOwner: role === "OWNER",
  };
});

export class AccessError extends Error {}

/** Do akcji serwerowych: wymaga prawa edycji, inaczej rzuca AccessError. */
export async function requireTreeEditor(treeId: string) {
  const access = await getTreeAccess(treeId);
  if (!access.canEdit) throw new AccessError("Nie masz uprawnień do edycji tego drzewa.");
  return access;
}

/** Sprawdza, że osoba należy do drzewa (żeby nie dało się edytować cudzych osób, podmieniając id). */
export async function requirePersonInTree(treeId: string, personId: string) {
  if (!uuid.safeParse(personId).success) notFound();
  const person = await db.person.findFirst({ where: { id: personId, treeId }, select: { id: true } });
  if (!person) notFound();
  return person;
}
