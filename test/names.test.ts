import { describe, expect, it } from "vitest";
import { normalizeName, parseStellarAddress, validateName } from "../src/names.js";

describe("name rules", () => {
  it("accepts good names", () => {
    for (const n of ["nuel", "ada_obi", "shop.lagos", "k-9x", "abc"]) expect(validateName(n)).toBeNull();
  });
  it("rejects bad names", () => {
    expect(validateName("ab")).toMatch(/3–32/);
    expect(validateName("a".repeat(33))).toMatch(/3–32/);
    expect(validateName("-nuel")).not.toBeNull();
    expect(validateName("nuel.")).not.toBeNull();
    expect(validateName("nu el")).not.toBeNull();
    expect(validateName("nu..el")).toMatch(/consecutive/);
    expect(validateName("admin")).toMatch(/reserved/);
    expect(validateName("Starling")).toMatch(/reserved/);
  });
  it("normalizes and parses stellar addresses", () => {
    expect(normalizeName("  NueL ")).toBe("nuel");
    expect(parseStellarAddress("Nuel*FlexiPay.app")).toEqual({ name: "nuel", domain: "flexipay.app" });
    expect(parseStellarAddress("a*b*flexipay.app")).toEqual({ name: "a*b", domain: "flexipay.app" });
    expect(parseStellarAddress("nuel")).toBeNull();
    expect(parseStellarAddress("*flexipay.app")).toBeNull();
  });
});
