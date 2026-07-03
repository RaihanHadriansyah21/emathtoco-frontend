const STRONG_PASSWORD =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export const PASSWORD_REQUIREMENTS =
  'minimal 10 karakter dan wajib mengandung huruf kecil, huruf besar, angka, serta simbol';

export function isStrongPassword(password: string): boolean {
  return STRONG_PASSWORD.test(password);
}
