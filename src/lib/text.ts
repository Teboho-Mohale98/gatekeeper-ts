/**
 * Text normalisation helpers.
 *
 * Credentials arrive from readers with inconsistent casing and spacing
 * ("ca 123 456", "CA-123-456", "CA123456"). The engine stores and compares a
 * single canonical form so lookups are deterministic.
 */

/** Canonical form of a license plate: upper-case, alphanumerics only. */
export function normaliseLicensePlate(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Canonical form of a keypad access code: digits only. */
export function normaliseAccessCode(value: string): string {
  return value.trim().replace(/[^0-9]/g, '');
}

/** Canonical form of a resident unit label, e.g. "block-c-12". */
export function normaliseResidentUnit(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '-');
}

/** Canonical form of a person's name: trimmed, collapsed internal whitespace. */
export function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Canonical form of an opaque token (hex/string credentials). */
export function normaliseToken(value: string): string {
  return value.trim().toLowerCase();
}
