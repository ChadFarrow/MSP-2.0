// Shared comparison utilities for MSP 2.0
import type { ValueBlock, Person } from '../types/feed';

/**
 * Compare two value blocks for equality by checking recipient addresses
 * Uses Set-based comparison for order-independent matching
 */
export function areValueBlocksEqual(a: ValueBlock, b: ValueBlock): boolean {
  if (a.recipients.length !== b.recipients.length) return false;

  const aAddresses = new Set(a.recipients.map(r => r.address));
  const bAddresses = new Set(b.recipients.map(r => r.address));

  if (aAddresses.size !== bAddresses.size) return false;

  for (const addr of aAddresses) {
    if (!bAddresses.has(addr)) return false;
  }

  return true;
}

/**
 * Compare two value blocks by index for strict equality
 * Checks name, address, split, and type in order
 */
export function areValueBlocksStrictEqual(a: ValueBlock, b: ValueBlock): boolean {
  if (a.recipients.length !== b.recipients.length) return false;

  for (let i = 0; i < a.recipients.length; i++) {
    const ra = a.recipients[i];
    const rb = b.recipients[i];
    if (ra.name !== rb.name || ra.address !== rb.address ||
        ra.split !== rb.split || ra.type !== rb.type) {
      return false;
    }
  }
  return true;
}

/**
 * Compare two person arrays for equality
 * Checks name, role, and group in order
 */
export function arePersonsEqual(a: Person[], b: Person[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name || a[i].role !== b[i].role ||
        a[i].group !== b[i].group) {
      return false;
    }
  }
  return true;
}
