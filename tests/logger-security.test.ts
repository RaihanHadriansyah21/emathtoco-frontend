import { describe, expect, it } from "vitest";

import { redactLogValue } from "@/lib/logger";

describe("frontend logger redaction", () => {
  it("redacts credentials, email, signed query, and object paths", () => {
    const sanitized = JSON.stringify(redactLogValue({
      authorization: "Bearer token",
      message: [
        "student@example.com",
        "sb_secret_abcdefghijklmnopqrstuvwxyz",
        "https://example.test/file?token=private-value",
        "10000000-0000-0000-0000-000000000001/submission/S-1A/file.jpg",
      ].join(" "),
    }));

    expect(sanitized).not.toContain("student@example.com");
    expect(sanitized).not.toContain("sb_secret_");
    expect(sanitized).not.toContain("private-value");
    expect(sanitized).not.toContain("S-1A/file.jpg");
  });
});
