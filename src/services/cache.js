'use strict';

/**
 * Small in-memory cache with a size limit (least recently used is removed
 * first) and an expiry time. Keeps repeated topics fast and cheap.
 */
class MemoryCache {
  /**
   * @param {{ maxEntries: number, ttlMs: number, now?: () => number }} options
   */
  constructor({ maxEntries, ttlMs, now = Date.now }) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = new Map();
  }

  /**
   * @param {string} key
   * @returns {unknown | undefined} The value, or undefined when missing or expired.
   */
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Move to the end so it counts as recently used.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  /**
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    if (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      this.entries.delete(oldestKey);
    }
  }

  /** @returns {number} */
  get size() {
    return this.entries.size;
  }
}

module.exports = { MemoryCache };
