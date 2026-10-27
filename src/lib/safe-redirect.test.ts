import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("przepuszcza ścieżki wewnątrz aplikacji", () => {
    expect(safeNextPath("/drzewa")).toBe("/drzewa");
    expect(safeNextPath("/drzewa/abc?widok=mapa")).toBe("/drzewa/abc?widok=mapa");
  });

  it("odrzuca adresy prowadzące na inne strony", () => {
    for (const evil of [
      "https://zlo.example",
      "//zlo.example",
      "/\\zlo.example",
      "javascript:alert(1)",
      "/drzewa\nSet-Cookie: x=1",
    ]) {
      expect(safeNextPath(evil)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });

  it("bez parametru zwraca domyślną ścieżkę", () => {
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("")).toBe(DEFAULT_AFTER_LOGIN);
  });
});
