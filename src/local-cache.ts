import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';

export type milliseconds = number;

export interface LocalCacheInterface {
  /**
   * Set a cache with a ttl, in milliseconds
   *
   * @param {{ key: string; value: any; ttl?: milliseconds }} options
   * @returns {Promise<void>}
   * @memberof LocalCacheInterface
   */
  set(options: { key: string; value: any; ttl?: milliseconds }): Promise<void>;

  /**
   * Get a cached value or undefined if not set or expired
   *
   * @param {string} key
   * @returns {Promise<any>}
   * @memberof LocalCacheInterface
   */
  get(key: string): Promise<any>;

  /**
   * Delete a cached value
   *
   * @param {string} key
   * @returns {Promise<void>}
   * @memberof LocalCacheInterface
   */
  delete(key: string): Promise<void>;
}

interface LocalCacheEntry {
  value: any;
  expires?: Date;
}

export class LocalCache implements LocalCacheInterface {
  private defaultTTL: milliseconds;

  private namespace: string;

  constructor(options?: { namespace?: string; defaultTTL?: milliseconds }) {
    this.namespace = options?.namespace ?? 'LocalCache';
    this.defaultTTL = options?.defaultTTL ?? 15 * 60 * 1000; // 15 minutes
  }

  /** @inheritdoc */
  async set(options: { key: string; value: any; ttl?: number }): Promise<void> {
    const cacheEntry: LocalCacheEntry = {
      value: options.value,
    };
    const ttl = options.ttl ?? this.defaultTTL;
    const expires = new Date();
    expires.setMilliseconds(expires.getMilliseconds() + ttl);
    cacheEntry.expires = expires;

    const namespacedKey = this.getNamespacedKey(options.key);
    await idbSet(namespacedKey, cacheEntry);
  }

  /** @inheritdoc */
  async get(key: string): Promise<any> {
    const namespacedKey = this.getNamespacedKey(key);
    const result = await idbGet(namespacedKey);
    if (!result) return;
    if (result.expires && result.expires < new Date()) {
      return;
    }
    // eslint-disable-next-line consistent-return
    return result.value;
  }

  /** @inheritdoc */
  async delete(key: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    await idbDel(namespacedKey);
  }

  private getNamespacedKey(key: string): string {
    return `${this.namespace}-${key}`;
  }
}
