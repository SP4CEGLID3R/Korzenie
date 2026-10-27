"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { importGedcom, MAX_GEDCOM_BYTES, MAX_IMPORT_PERSONS } from "@/lib/gedcom/import";
import { saveImportedTree } from "@/lib/trees/gedcom-import";
import type { ActionState } from "@/lib/trees/forms";

export type ImportState = ActionState & { warnings?: string[] };

export async function importGedcomAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const file = fd.get("file");
  const name = z.string().trim().max(120).safeParse(fd.get("name"));

  if (!(file instanceof File) || file.size === 0) return { error: "Wybierz plik .ged z dysku." };
  if (file.size > MAX_GEDCOM_BYTES) {
    return { error: `Plik jest za duży (limit ${MAX_GEDCOM_BYTES / 1024 / 1024} MB).` };
  }
  if (!/\.ged(com)?$/i.test(file.name)) return { error: "To nie wygląda na plik GEDCOM (rozszerzenie .ged)." };

  const data = importGedcom(new Uint8Array(await file.arrayBuffer()));
  if (data.persons.length === 0) {
    return { error: "W pliku nie znaleziono żadnych osób.", warnings: data.warnings };
  }
  if (data.persons.length > MAX_IMPORT_PERSONS) {
    return { error: `Plik ma ${data.persons.length} osób – limit to ${MAX_IMPORT_PERSONS}.`, warnings: data.warnings };
  }

  const treeName =
    (name.success && name.data) || file.name.replace(/\.ged(com)?$/i, "").slice(0, 120) || "Zaimportowane drzewo";
  const summary = await saveImportedTree(user.id, treeName, data);

  const params = new URLSearchParams({ zaimportowano: String(summary.persons) });
  if (data.warnings.length) params.set("uwagi", data.warnings.join("\n").slice(0, 1500));
  redirect(`/drzewa/${summary.treeId}/osoby?${params}`);
}
