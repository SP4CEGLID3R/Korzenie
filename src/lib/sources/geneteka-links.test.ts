import { describe, expect, it } from "vitest";
import { buildGenetekaUrl, detectGenetekaRegion } from "./geneteka-links";

describe("buildGenetekaUrl", () => {
  it("link do aktów urodzenia", () => {
    const url = new URL(
      buildGenetekaUrl({ kind: "B", lastname: "Kowalski", name: "Jan", fromYear: 1850, toYear: 1854, region: "13sk" }),
    );
    expect(url.origin + url.pathname).toBe("https://geneteka.genealodzy.pl/index.php");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      op: "gt",
      lang: "pol",
      bdm: "B",
      w: "13sk",
      rid: "B",
      search_lastname: "Kowalski",
      search_name: "Jan",
      search_lastname2: "",
      search_name2: "",
      from_date: "1850",
      to_date: "1854",
    });
  });

  it("ślub pary – obie osoby i pair=1", () => {
    const url = new URL(
      buildGenetekaUrl({ kind: "S", lastname: "Kowalski", name: "Wojciech", lastname2: "Nowak", name2: "Jadwiga", pair: true }),
    );
    expect(url.searchParams.get("bdm")).toBe("S");
    expect(url.searchParams.get("rid")).toBe("S");
    expect(url.searchParams.get("search_lastname2")).toBe("Nowak");
    expect(url.searchParams.get("pair")).toBe("1");
  });

  it("polskie znaki są poprawnie zakodowane", () => {
    expect(buildGenetekaUrl({ kind: "D", lastname: "Wiśniewska" })).toContain("search_lastname=Wi%C5%9Bniewska");
  });
});

describe("detectGenetekaRegion", () => {
  it.each([
    [["Chęciny", "kielecki, świętokrzyskie, Polska"], "13sk"],
    [["Jędrzejów", null], "13sk"],
    [["Kielce", ""], "13sk"],
    [["Wola", "powiat lubelski"], "03lb"],
    [["Mszczonów", "żyrardowski, mazowieckie"], "07mz"],
    [["Warszawa", null], "71wa"],
    [["Brody", "Lwów, Galicja"], "21uk"],
    [["Lida", "gubernia wileńska"], "23lt"],
    [["Gdzieś", "nieznany powiat"], null],
  ] as const)("%j → %s", (texts, code) => {
    expect(detectGenetekaRegion(...texts)).toBe(code);
  });
});
