/**
 * Identifier + access-code generation.
 *
 * All randomness comes from Node's CSPRNG (`node:crypto`). Access codes are
 * generated with an unbiased rejection-sampling loop and are never derived from
 * sequential counters, so a visitor cannot enumerate their neighbour's code.
 */

import { randomInt, randomUUID } from 'node:crypto';

/**
 * Create a namespaced, collision-resistant identifier, e.g.
 * `inv_3f6c...` or `log_9a12...`.
 */
export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/**
 * Generate a fixed-length numeric access code (default 6 digits).
 * Uses `randomInt` per-digit which is uniform across `[0, 9]`.
 */
export function generateAccessCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

/**
 * Generate a hex token used for Bluetooth / face-template style credentials.
 * `byteLength` defaults to 16 bytes (128 bits).
 */
export function generateToken(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i += 1) {
    bytes[i] = randomInt(0, 256);
  }
  return Buffer.from(bytes).toString('hex');
}
