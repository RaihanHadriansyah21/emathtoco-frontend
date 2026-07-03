import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/lib/security/csp";

describe("content security policy", () => {
  const base = {
    nonce: "test-nonce",
    supabaseUrl: "https://project.supabase.co",
    apiUrl: "https://api.203-0-113-10.sslip.io",
  };

  it("keeps production strict and origin-specific", () => {
    const policy = buildContentSecurityPolicy({
      ...base,
      production: true,
    });

    expect(policy).toContain("'nonce-test-nonce'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("ngrok");
    expect(policy).not.toContain("ws://");
  });

  it("allows local development tooling only outside production", () => {
    const policy = buildContentSecurityPolicy({
      ...base,
      production: false,
    });
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("ws://127.0.0.1:*");
  });
});
