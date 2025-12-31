/**
 * ID Generator Utilities
 * Generates unique identifiers for tracked objects and other entities
 */

/**
 * Generate a unique ID with timestamp and random component
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generate a short unique ID (8 characters)
 */
export function generateShortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a prefixed ID
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}:${generateId()}`;
}
