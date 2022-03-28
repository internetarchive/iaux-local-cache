import {
  del as idbDel,
  get as idbGet,
  set as idbSet,
  keys as idbKeys,
} from 'idb-keyval';
import { addSeconds } from './add-seconds';
import type { Seconds } from './models';

export interface LocalCacheInterface {
  /**
   * Set a cache with a ttl, in seconds
   *
   * @param {{ key: string; value: any; ttl?: Seconds }} options
   * @returns {Promise<void>}
   * @memberof LocalCacheInterface
   */
  set(options: { key: string; value: any; ttl?: Seconds }): Promise<void>;

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

  /**
   * Clear all expired keys
   */
  cleanExpired(): Promise<void>;
}

interface LocalCacheEntry {
  value: any;
  expires?: Date;
}

export class LocalCache implements LocalCacheInterface {
  private defaultTTL: Seconds;

  private namespace: string;

  constructor(options?: {
    namespace?: string;
    defaultTTL?: Seconds;
    cleaningInterval?: Seconds;
    disableCleaning?: boolean;
    immediateClean?: boolean;
  }) {
    this.namespace = options?.namespace ?? 'LocalCache';
    this.defaultTTL = options?.defaultTTL ?? 15 * 60; // 15 minutes

    if (options?.immediateClean ?? true) this.cleanExpired();

    if (!options?.disableCleaning) {
      const cleaningInterval = options?.cleaningInterval ?? 60; // 1 minute
      setInterval(() => {
        this.cleanExpired();
      }, cleaningInterval * 1000);
    }
  }

  /** @inheritdoc */
  async set(options: { key: string; value: any; ttl?: number }): Promise<void> {
    const cacheEntry: LocalCacheEntry = {
      value: options.value,
    };
    const ttl = options.ttl ?? this.defaultTTL;
    const expires = addSeconds(new Date(), ttl);
    cacheEntry.expires = expires;

    const namespacedKey = this.getNamespacedKey(options.key);
    try {
      await idbSet(namespacedKey, cacheEntry);
      // eslint-disable-next-line no-empty
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
  }

  /** @inheritdoc */
  async get(key: string): Promise<any> {
    const namespacedKey = this.getNamespacedKey(key);
    let result;
    try {
      result = await idbGet(namespacedKey);
      // eslint-disable-next-line no-empty
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
    if (!result) return;

    const now = new Date();
    if (result.expires && result.expires < now) {
      await this.delete(key);
      return;
    }
    // eslint-disable-next-line consistent-return
    return result.value;
  }

  /** @inheritdoc */
  async delete(key: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    try {
      await idbDel(namespacedKey);
      // istanbul ignore next
      // eslint-disable-next-line no-empty
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
  }

  /** @inheritdoc */
  async cleanExpired(): Promise<void> {
    const keys = await this.getAllKeys();
    // calling `get` on each key will delete it if expired
    await Promise.all(keys.map(async key => this.get(key)));
  }

  /**
   * Return all keys owned by this namespace
   */
  private async getAllKeys(): Promise<string[]> {
    // eslint-disable-next-line no-undef
    let keys: IDBValidKey[] = [];
    try {
      keys = await idbKeys();
      // istanbul ignore next
      // eslint-disable-next-line no-empty
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)

    const stringKeys: string[] = [];
    for (const key of keys) {
      // we limit the keys to type `string` for simplicity, but under the hood,
      // idbKeys can be several types so this just makes sure we're only using strings
      // (which should be all of them)
      if (typeof key === 'string') stringKeys.push(key);
    }
    const namespacedKeys = stringKeys.filter(key =>
      key.startsWith(this.namespace)
    );
    const keysWithoutNamespace = namespacedKeys.map(key =>
      this.removeNamespace(key)
    );
    return keysWithoutNamespace;
  }

  private getNamespacedKey(key: string): string {
    return `${this.namespace}-${key}`;
  }

  private removeNamespace(key: string): string {
    return key.replace(`${this.namespace}-`, '');
  }
}
