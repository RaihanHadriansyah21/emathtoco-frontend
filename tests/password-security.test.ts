import { describe, expect, it } from "vitest";

import { isStrongPassword } from "@/lib/security/password";

describe("password policy", () => {
  it("requires ten characters with lower, upper, digit, and symbol", () => {
    expect(isStrongPassword("DemoKuat1!")).toBe(true);
    expect(isStrongPassword("demokuat1!")).toBe(false);
    expect(isStrongPassword("DemoKuat!!")).toBe(false);
    expect(isStrongPassword("DemoKuat12")).toBe(false);
    expect(isStrongPassword("Dm1!short")).toBe(false);
  });
});
