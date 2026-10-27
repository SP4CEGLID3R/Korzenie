"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getTreeAccess } from "@/lib/trees/access";
import { formValues, type ActionState } from "@/lib/trees/forms";

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: "Podaj nazwę drzewa." })
  .max(120, { error: "Nazwa może mieć najwyżej 120 znaków." });

export async function renameTreeAction(treeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { isOwner } = await getTreeAccess(treeId);
  if (!isOwner) return { error: "Tylko właściciel może zmienić nazwę drzewa." };
  const name = nameSchema.safeParse(fd.get("name"));
  if (!name.success) return { error: name.error.issues[0]?.message, values: formValues(fd) };
  await db.tree.update({ where: { id: treeId }, data: { name: name.data } });
  refresh();
  return { message: "Zapisano nową nazwę.", savedAt: Date.now() };
}

export async function deleteTreeAction(treeId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const { isOwner, tree } = await getTreeAccess(treeId);
  if (!isOwner) return { error: "Tylko właściciel może usunąć drzewo." };
  if (String(fd.get("confirm") ?? "").trim() !== tree.name) {
    return { error: "Wpisz dokładnie nazwę drzewa, aby potwierdzić usunięcie.", values: formValues(fd) };
  }
  // Usunięcie drzewa kasuje kaskadowo osoby, wydarzenia, miejsca i relacje.
  await db.tree.delete({ where: { id: treeId } });
  redirect("/drzewa");
}
