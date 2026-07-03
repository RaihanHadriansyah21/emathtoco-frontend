import { describe, expect, it } from "vitest";

import { escapeCSVCell } from "@/lib/security/csv";

describe("CSV export hardening", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1:A2)", "\tformula", "\rformula"])(
    "neutralizes formula prefix %j",
    (value) => {
      expect(escapeCSVCell(value)).toContain(`'${value}`);
    },
  );

  it("quotes commas and doubles embedded quotes", () => {
    expect(escapeCSVCell('nilai, "akhir"')).toBe('"nilai, ""akhir"""');
  });
});
