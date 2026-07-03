const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCSVCell(value: string): string {
  const safeValue = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (
    safeValue.includes(",")
    || safeValue.includes('"')
    || safeValue.includes("\n")
    || safeValue.includes("\r")
  ) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}
