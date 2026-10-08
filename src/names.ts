// Rules for FlexiPay names (the part before the * in alice*flexipay.app).

export const NAME_RE = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])$/;

/** Names nobody can register: brand, staff-looking and protocol words. */
export const RESERVED = new Set([
  "admin", "administrator", "root", "support", "help", "security", "official", "team", "staff",
  "flexipay", "flexi", "starling", "stellar", "lumens", "xlm", "sdf", "wallet", "pay", "payments",
  "api", "www", "mail", "federation", "anchor", "null", "undefined", "system", "noreply",
]);

export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns an error message, or null when the name is acceptable. */
export function validateName(raw: string): string | null {
  const name = normalizeName(raw);
  if (name.length < 3 || name.length > 32) return "Names must be 3–32 characters";
  if (!NAME_RE.test(name)) return "Use lowercase letters, numbers, dots, dashes or underscores; start and end with a letter or number";
  if (/[._-]{2,}/.test(name)) return "No consecutive dots, dashes or underscores";
  if (RESERVED.has(name)) return "That name is reserved";
  return null;
}

/** Splits "alice*flexipay.app" into its parts (lower-cased). */
export function parseStellarAddress(q: string): { name: string; domain: string } | null {
  const i = q.lastIndexOf("*");
  if (i <= 0 || i === q.length - 1) return null;
  return { name: normalizeName(q.slice(0, i)), domain: q.slice(i + 1).trim().toLowerCase() };
}
