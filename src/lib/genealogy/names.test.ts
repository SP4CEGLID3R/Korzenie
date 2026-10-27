import { describe, expect, it } from "vitest";
import { displayName, feminineSurname, lifespan, masculineSurname, surnameForSex } from "./names";
import { ev, person } from "./test-helpers";

describe("formy nazwisk", () => {
  it.each([
    ["Kowalski", "Kowalska"],
    ["Nowicki", "Nowicka"],
    ["Zawadzki", "Zawadzka"],
    ["Czarny", "Czarna"],
    ["Biały", "Biała"],
    ["Nowak", "Nowak"],
    ["Wójcik", "Wójcik"],
    ["KOWALSKI", "KOWALSKA"],
  ])("%s → %s", (m, f) => {
    expect(feminineSurname(m)).toBe(f);
  });

  it.each([
    ["Kowalska", "Kowalski"],
    ["Nowicka", "Nowicki"],
    ["Zawadzka", "Zawadzki"],
    ["Nowak", "Nowak"],
  ])("%s → %s", (f, m) => {
    expect(masculineSurname(f)).toBe(m);
  });

  it("forma zależna od płci", () => {
    expect(surnameForSex("Nowicki", "FEMALE")).toBe("Nowicka");
    expect(surnameForSex("Nowicka", "MALE")).toBe("Nowicki");
    expect(surnameForSex("Nowicki", "UNKNOWN")).toBe("Nowicki");
    expect(surnameForSex(null, "FEMALE")).toBeNull();
  });
});

describe("displayName i lifespan", () => {
  it("pokazuje nazwisko rodowe", () => {
    expect(
      displayName([{ type: "MARRIED", isPrimary: true, givenNames: "Marianna", surname: "Kowalska", birthSurname: "Nowak" }]),
    ).toBe("Marianna Kowalska z d. Nowak");
    expect(displayName([])).toBe("(bez imienia)");
  });

  it("lata życia z chrztu i pochówku, gdy brak urodzenia i zgonu", () => {
    expect(lifespan(person("a", "Jan", "K", "MALE", [ev("BAPTISM", "1850"), ev("BURIAL", "1900")]))).toBe("1850–1900");
    expect(lifespan(person("a", "Jan", "K", "MALE", [ev("BIRTH", "ok. 1850")]))).toBe("ur. ok. 1850");
    expect(lifespan(person("a", "Jan", "K", "MALE", [ev("DEATH", "")]))).toBe("zm.");
  });
});
