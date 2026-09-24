/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createStore,
  del as idbDel,
  get as idbGet,
  set as idbSet,
  type UseStore,
} from 'idb-keyval';
import { addSeconds } from './add-seconds';
import type { Seconds } from './models';

export interface LocalCacheInterface {
  /**
   * Set a cache with a ttl, in seconds. A ttl of `Infinity` never expires.
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

  /**
   * Stop the periodic cleaning
   */
  dispose(): void;
}

interface LocalCacheEntry {
  value: any;
  expires?: Date;
}

/** The IndexedDB database and object store that hold every namespace's entries */
export const LOCAL_CACHE_DB_NAME = 'LocalCache';
export const LOCAL_CACHE_STORE_NAME = 'entries';

/** idb-keyval's default store, where entries from before 1.0 live */
const LEGACY_DB_NAME = 'keyval-store';
const LEGACY_STORE_NAME = 'keyval';

/** Which keys an operation covers: one exact key, or every key with a prefix */
type KeyScope = { exact: string } | { prefix: string };

export class LocalCache implements LocalCacheInterface {
  private defaultTTL: Seconds;

  private namespace: string;

  private store?: UseStore;

  private cleaningIntervalId?: ReturnType<typeof setInterval>;

  private legacySweepDone = false;

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
      this.cleaningIntervalId = setInterval(() => {
        this.cleanExpired();
      }, cleaningInterval * 1000);
    }
  }

  /** @inheritdoc */
  async set(options: {
    key: string;
    value: any;
    ttl?: Seconds;
  }): Promise<void> {
    const cacheEntry: LocalCacheEntry = {
      value: options.value,
    };
    const ttl = options.ttl ?? this.defaultTTL;
    if (Number.isFinite(ttl)) cacheEntry.expires = addSeconds(new Date(), ttl);

    const namespacedKey = this.getNamespacedKey(options.key);
    try {
      await idbSet(namespacedKey, cacheEntry, this.getStore());
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
  }

  /** @inheritdoc */
  async get(key: string): Promise<any> {
    const namespacedKey = this.getNamespacedKey(key);
    let result;
    try {
      result = await idbGet(namespacedKey, this.getStore());
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
    if (result === undefined) return;

    if (isExpired(result, new Date())) {
      // re-checked inside the delete transaction so a newer value set in the meantime survives
      await this.deleteExpired({ exact: namespacedKey });
      return;
    }

    return result.value;
  }

  /** @inheritdoc */
  async delete(key: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    try {
      await idbDel(namespacedKey, this.getStore());
      // istanbul ignore next
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
  }

  /** @inheritdoc */
  async cleanExpired(): Promise<void> {
    await this.deleteExpired({ prefix: this.getNamespacedKey('') });
    if (!this.legacySweepDone) {
      this.legacySweepDone = true;
      await this.sweepLegacyStore();
    }
  }

  /** @inheritdoc */
  dispose(): void {
    clearInterval(this.cleaningIntervalId);
    this.cleaningIntervalId = undefined;
  }

  /**
   * Delete the expired entries in `scope`. The expiry check and the delete
   * share one readwrite transaction, so a concurrent `set` of the same key
   * can't be deleted by mistake.
   */
  private async deleteExpired(scope: KeyScope): Promise<void> {
    try {
      await deleteExpiredEntries(this.getStore(), scope);
      // istanbul ignore next
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
  }

  /**
   * Remove this namespace's expired entries from idb-keyval's default store,
   * where versions before 1.0 kept them. Unexpired ones are left for any
   * pre-1.0 cache still using them, and get swept once they expire.
   */
  private async sweepLegacyStore(): Promise<void> {
    try {
      // avoid creating the legacy database just to find it empty
      if (indexedDB.databases) {
        const databases = await indexedDB.databases();
        if (!databases.some(db => db.name === LEGACY_DB_NAME)) return;
      }
      await deleteExpiredEntries(
        createStore(LEGACY_DB_NAME, LEGACY_STORE_NAME),
        { prefix: this.getNamespacedKey('') },
      );
      // istanbul ignore next
    } catch {} // indexeddb may not be available (Firefox throws an error in Private mode)
  }

  /**
   * The store is opened on first use so that an IndexedDB failure surfaces
   * inside the caller's try/catch.
   */
  private getStore(): UseStore {
    if (!this.store) {
      this.store = createStore(LOCAL_CACHE_DB_NAME, LOCAL_CACHE_STORE_NAME);
    }
    return this.store;
  }

  private getNamespacedKey(key: string): string {
    return `${this.namespace}-${key}`;
  }
}

/**
 * An entry is expired if its expiration has passed or is malformed.
 * Entries without an expiration never expire.
 */
function isExpired(entry: unknown, now: Date): boolean {
  if (!entry || typeof entry !== 'object') return true;
  const { expires } = entry as LocalCacheEntry;
  if (expires === undefined) return false;
  return !(expires instanceof Date) || expires < now;
}

/**
 * Delete every expired entry in `scope` in a single readwrite transaction.
 * Resolves once the transaction commits.
 */
function deleteExpiredEntries(store: UseStore, scope: KeyScope): Promise<void> {
  const now = new Date();
  return store(
    'readwrite',
    objectStore =>
      new Promise<void>((resolve, reject) => {
        const { transaction } = objectStore;
        transaction.oncomplete = () => resolve();
        transaction.onabort = transaction.onerror = () =>
          reject(transaction.error);

        const request =
          'exact' in scope
            ? objectStore.openCursor(IDBKeyRange.only(scope.exact))
            : objectStore.openCursor(IDBKeyRange.lowerBound(scope.prefix));
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          // keys are sorted, so the first one outside the prefix ends the walk
          if ('prefix' in scope) {
            const { key } = cursor;
            if (typeof key !== 'string' || !key.startsWith(scope.prefix))
              return;
          }
          if (isExpired(cursor.value, now)) cursor.delete();
          cursor.continue();
        };
      }),
  );
}
