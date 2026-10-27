"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export type CreateTreeState = {
  error?: string;
  /** Zmienia się po każdym udanym zapisie – formularz czyści wtedy pole. */
  savedId?: string;
};

const treeNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Podaj nazwę drzewa." })
  .max(120, { error: "Nazwa może mieć najwyżej 120 znaków." });

export async function createTree(
  _prev: CreateTreeState,
  formData: FormData,
): Promise<CreateTreeState> {
  // Każda akcja serwerowa sama sprawdza, kto ją wywołuje.
  const user = await requireUser();

  const parsed = treeNameSchema.safeParse(formData.get("name") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message };
  }

  const tree = await db.tree.create({
    data: {
      name: parsed.data,
      ownerId: user.id,
      // Właściciel jest też członkiem z rolą OWNER – dzięki temu uprawnienia
      // sprawdzamy w jednym miejscu (tabela TreeMember).
      members: { create: { userId: user.id, role: "OWNER" } },
    },
  });

  refresh();
  return { savedId: tree.id };
}
