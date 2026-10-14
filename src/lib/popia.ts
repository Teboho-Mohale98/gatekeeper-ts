/**
 * POPIA compliance utility.
 *
 * The Protection of Personal Information Act (Act 4 of 2013) requires that
 * personal identifiers be processed minimally and, where records are retained
 * for audit, that the data be de-identified so it cannot be linked back to a
 * data subject. Every marker written to the long-term audit trail passes
 * through this module first - raw identifiers never reach storage.
 *
 * Design notes:
 *  - Masking is *deterministic* and *lossy*: the original value cannot be
 *    recovered from the output, yet operators can still eyeball the last few
 *    characters to reconcile a physical incident against a log line.
 *  - Masking is applied for display AND for persistence; the in-memory
 *    invitation store keeps the raw value only because the resident owns it.
 */

import type { AccessMethod } from '../types/domain';

const MASK_CHAR = '*';

/**
 * Reveal only the trailing `visible` characters, masking the rest with `*`.
 * Values at or below the visibility window are fully masked.
 */
function keepLast(value: string, visible: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length <= visible) {
    return MASK_CHAR.repeat(trimmed.length);
  }
  return MASK_CHAR.repeat(trimmed.length - visible) + trimmed.slice(-visible);
}

/**
 * Mask a South African ID number (13 digits) down to its last two digits.
 * Example: `9001015800083` -> `***********83`.
 */
export function maskIdNumber(idNumber: string): string {
  return keepLast(idNumber.replace(/\s+/g, ''), 2);
}

/**
 * Mask a phone number, retaining only the final two digits for reconciliation.
 * Example: `+27 82 123 4567` -> `**********67`.
 */
export function maskPhoneNumber(phoneNumber: string): string {
  return keepLast(phoneNumber.replace(/[^0-9+]/g, ''), 2);
}

/**
 * Partially mask a license plate. The province prefix and the trailing digit
 * are retained because they are already visible to any person physically
 * present at the gate; the middle identifier is redacted.
 * Example: `CA 123 456` -> `CA *** **6`.
 */
export function maskLicensePlate(plate: string): string {
  const compact = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.length <= 3) {
    return keepLast(compact, 1);
  }
  const prefix = compact.slice(0, 2);
  const suffix = compact.slice(-1);
  return `${prefix} ${MASK_CHAR.repeat(3)} ${MASK_CHAR.repeat(2)}${suffix}`;
}

/**
 * Mask a keypad access code, retaining the final digit.
 * Example: `482913` -> `*****3`.
 */
export function maskAccessCode(accessCode: string): string {
  return keepLast(accessCode.replace(/\s+/g, ''), 1);
}

/** Mask an opaque token/device id, retaining the last 4 characters. */
export function maskToken(token: string): string {
  return keepLast(token, 4);
}

/**
 * Mask a person's name for audit display, retaining given name and the initial
 * of the family name. Example: `Thandiwe Nkosi` -> `Thandiwe N.`.
 */
export function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0];
  if (first === undefined) {
    return '';
  }
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (last === undefined) {
    return first;
  }
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

/**
 * Route a raw credential to the correct masker for its presentation method.
 * This is the function the access engine calls when building an audit record.
 */
export function maskCredential(accessMethod: AccessMethod, credential: string): string {
  switch (accessMethod) {
    case 'PIN_CODE':
      return maskAccessCode(credential);
    case 'LICENSE_PLATE':
      return maskLicensePlate(credential);
    case 'BLUETOOTH':
    case 'FACIAL_RECOGNITION':
    case 'BIOMETRIC_READER':
      return maskToken(credential);
  }
}
