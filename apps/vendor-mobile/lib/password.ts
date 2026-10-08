// Mirrors Supabase Auth's password rules (8+ characters with lower- and
// uppercase letters, a number and a symbol), so a weak password is caught
// before a code is sent. Auth also rejects passwords from breach lists,
// which only the server can check.
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) return "Use both upper- and lowercase letters.";
  if (!/[0-9]/.test(pw)) return "Add a number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Add a symbol, like ! or #.";
  return null;
}
