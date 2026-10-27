import type { NextRequest } from "next/server";
import { exportGedcom } from "@/lib/gedcom/export";
import { getTreeAccess } from "@/lib/trees/access";
import { loadTreeSnapshot } from "@/lib/trees/snapshot";

/** Nazwa pliku bez polskich znaków i znaków specjalnych (np. „rodzina-kowalskich.ged”). */
function fileName(treeName: string) {
  const slug = treeName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "drzewo"}.ged`;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/drzewa/[treeId]/eksport">) {
  const { treeId } = await ctx.params;
  const { tree, canEdit } = await getTreeAccess(treeId);
  if (!canEdit) return new Response("Eksport jest dostępny dla właściciela i edytorów drzewa.", { status: 403 });

  const hideLiving = request.nextUrl.searchParams.get("zyjace") === "ukryj";
  const snapshot = await loadTreeSnapshot(treeId);
  const body = exportGedcom(snapshot, { hideLiving, treeName: tree.name });
  const name = fileName(tree.name);

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
