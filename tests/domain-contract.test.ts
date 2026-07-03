import { describe, expect, it } from "vitest";

import {
  AI_MODELS,
  SECTION_CODES,
  USER_ROLES,
  getMaxScoreForSection,
} from "@/lib/domain-contract";

describe("domain contract", () => {
  it("matches the backend enum values and section matrix", () => {
    expect(USER_ROLES).toEqual(["admin", "dosen", "mahasiswa"]);
    expect(AI_MODELS).toEqual([
      "MobileNetV2",
      "DenseNet121",
      "InceptionV3",
    ]);
    expect(SECTION_CODES).toHaveLength(24);
    expect(new Set(SECTION_CODES)).toHaveLength(24);
    expect(SECTION_CODES[0]).toBe("S-1A");
    expect(SECTION_CODES.at(-1)).toBe("S-4F");
  });

  it("keeps the section score total at one hundred", () => {
    const total = SECTION_CODES.reduce(
      (sum, section) => sum + getMaxScoreForSection(section),
      0,
    );
    expect(total).toBe(100);
  });
});
