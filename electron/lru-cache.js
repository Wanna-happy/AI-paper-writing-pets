class LruCache {
  constructor({ max = 100, ttl = 0 } = {}) {
    this.max = Math.max(1, Number(max) || 100);
    this.ttl = Math.max(0, Number(ttl) || 0);
    this.entries = new Map();
  }

  get size() {
    this.prune();
    return this.entries.size;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value, ttl = this.ttl) {
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      expiresAt: ttl > 0 ? Date.now() + ttl : 0,
    });
    while (this.entries.size > this.max) {
      this.entries.delete(this.entries.keys().next().value);
    }
    return value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt && entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

module.exports = { LruCache };
