import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';

export interface LocalCacheInterface {
  /**
   * Set a cache with a ttl
   *
   * @param {{ key: string; value: any; ttl?: number }} options
   * @returns {Promise<void>}
   * @memberof LocalCacheInterface
   */
  set(options: { key: string; value: any; ttl?: number }): Promise<void>;

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

export interface LocalCacheEntry {
  value: any;
  expires?: Date;
}

export class LocalCache implements LocalCacheInterface {
  private namespace: string;

  constructor(namespace?: string) {
    this.namespace = namespace ?? 'LocalCache';
  }

  /** @inheritdoc */
  async set(options: { key: string; value: any; ttl?: number }): Promise<void> {
    const cacheEntry: LocalCacheEntry = {
      value: options.value,
    };
    if (options.ttl) {
      const expires = new Date();
      expires.setMilliseconds(expires.getMilliseconds() + options.ttl);
      cacheEntry.expires = expires;
    }

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
