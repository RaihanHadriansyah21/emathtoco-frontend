export function normalizeRole(role?: string): string {
  return role?.trim().toLowerCase() ?? "";
}
