import { expect } from '@open-wc/testing';
import {
  createStore,
  get as rawGet,
  set as rawSet,
  del as rawDel,
} from 'idb-keyval';
import { addSeconds } from '../src/add-seconds';
import {
  LocalCache,
  LOCAL_CACHE_DB_NAME,
  LOCAL_CACHE_STORE_NAME,
} from '../src/local-cache';
import { promisedSleep } from './promisedSleep';

const cacheStore = createStore(LOCAL_CACHE_DB_NAME, LOCAL_CACHE_STORE_NAME);
const idbGet = (key: string) => rawGet(key, cacheStore);
const idbSet = (key: string, value: unknown) => rawSet(key, value, cacheStore);

describe('LocalCache', () => {
  it('can set a cache entry with default ttl', async () => {
    const ttl = 15 * 60; // 15 minute default ttl
    const expires = addSeconds(new Date(), ttl);
    const localCache = new LocalCache({ namespace: 'boop' });
    await localCache.set({
      key: 'foo',
      value: 'bar',
    });
    // access the entry directly from idb-keyval to validate
    const result = await idbGet('boop-foo');
    expect(result.value).to.equal('bar');

    // verify that the expected ttl is within 100 ms
    // of the actual value since they'll be off by
    // a few ms
    const resultExpires = +result.expires;
    const ttlDiff = Math.abs(resultExpires - +expires);
    expect(ttlDiff).to.be.lessThan(100);
    await localCache.delete('foo');
  });

  it('can get a cache entry', async () => {
    const localCache = new LocalCache({ namespace: 'boop' });
    await localCache.set({
      key: 'foo',
      value: 'bar',
    });
    const result = await localCache.get('foo');
    expect(result).to.equal('bar');
    await localCache.delete('foo');
  });

  it('can set a cache entry with an expiration', async () => {
    const ttl = 5;
    const expires = addSeconds(new Date(), ttl);
    const localCache = new LocalCache({ namespace: 'boop' });
    await localCache.set({
      key: 'foo',
      value: 'bar',
      ttl,
    });
    const result = await idbGet('boop-foo');
    expect(result.value).to.equal('bar');

    // verify that the expected ttl is within 100 ms
    // of the actual value since they'll be off by
    // a few ms
    const resultExpires = +result.expires;
    const ttlDiff = Math.abs(resultExpires - +expires);
    expect(ttlDiff).to.be.lessThan(100);

    await localCache.delete('foo');
  });

  it('returns the cached copy if available', async () => {
    const ttl = 0.5; // 500ms cache
    const localCache = new LocalCache({ namespace: 'boop' });
    await localCache.set({
      key: 'foo',
      value: 'bar',
      ttl,
    });
    const result = await localCache.get('foo');
    expect(result).to.equal('bar');

    await localCache.delete('foo');
  });

  it('returns undefined if cache is expired', async () => {
    const ttl = 0.05; // 50ms cache
    const localCache = new LocalCache({ namespace: 'boop' });
    await localCache.set({
      key: 'foo',
      value: 'bar',
      ttl,
    });
    let result = await localCache.get('foo');
    expect(result).to.equal('bar'); // available

    await promisedSleep(100); // wait until it expires

    result = await localCache.get('foo');
    expect(result).to.equal(undefined); // expired
    await localCache.delete('foo');
  });

  it('deletes the cache if expired', async () => {
    const ttl = 0.05; // 50ms cache
    const localCache = new LocalCache({ namespace: 'boop' });
    await localCache.set({
      key: 'foo',
      value: 'bar',
      ttl,
    });
    let result = await localCache.get('foo');
    expect(result).to.equal('bar'); // available
    await promisedSleep(100); // wait until it expires

    // check idb directly to make sure it's still there
    result = await idbGet('boop-foo');
    expect(result).to.not.equal(undefined); // expired, but hasn't been deleted yet

    // call localCache, which is now expired, and should delete from idb
    result = await localCache.get('foo');
    expect(result).to.equal(undefined); // undefined from localCache

    // recheck idb to verify it's gone
    result = await idbGet('boop-foo');
    expect(result).to.equal(undefined); // deleted from idb
  });

  it('can delete a cache entry', async () => {
    const localCache = new LocalCache({ namespace: 'boop' });
    await localCache.set({
      key: 'foo',
      value: 'bar',
    });
    let result = await localCache.get('foo');
    expect(result).to.equal('bar');
    await localCache.delete('foo');
    result = await localCache.get('foo');
    expect(result).to.equal(undefined);
  });

  it('uses a default cache namespace', async () => {
    const localCache = new LocalCache();
    await localCache.set({
      key: 'foo',
      value: 'bar',
    });
    const result = await idbGet('LocalCache-foo');
    expect(result.value).to.equal('bar');
    await localCache.delete('foo');
  });

  it('discards entries with bad expiration dates', async () => {
    const localCache = new LocalCache({
      disableCleaning: true,
      immediateClean: false,
    });
    await idbSet('LocalCache-foo', {
      value: 'bar',
      expires: 'not a date',
    });

    const rawResult = await idbGet('LocalCache-foo');
    expect(rawResult).to.deep.equal({
      value: 'bar',
      expires: 'not a date',
    });

    const result = await localCache.get('foo');
    expect(result).to.be.undefined;

    const postRequestResult = await idbGet('LocalCache-foo');
    expect(postRequestResult).to.be.undefined;
  });

  it('never expires an entry with an infinite ttl', async () => {
    const localCache = new LocalCache({ namespace: 'forever' });
    await localCache.set({ key: 'foo', value: 'bar', ttl: Infinity });

    const result = await idbGet('forever-foo');
    expect(result.expires).to.equal(undefined);
    expect(await localCache.get('foo')).to.equal('bar');
    await localCache.delete('foo');
  });

  describe('Cleaning', () => {
    it('can clean expired values in the cache', async () => {
      const localCache = new LocalCache({
        namespace: 'expireme',
        defaultTTL: 0.05,
      });
      await localCache.set({
        key: 'foo2',
        value: 'barrrrr',
      });
      const result = await idbGet('expireme-foo2');
      expect(result.value).to.equal('barrrrr');
      await promisedSleep(100); // wait until it expires
      await localCache.cleanExpired();
      const result2 = await idbGet('expireme-foo2');
      expect(result2).to.equal(undefined);
    });

    it('only cleans keys in its own namespace', async () => {
      const localCache = new LocalCache({
        namespace: 'expireme',
        defaultTTL: 0.05,
      });
      const localCache2 = new LocalCache({
        namespace: 'expireme2',
        defaultTTL: 10,
      });
      await localCache.set({
        key: 'foo',
        value: 'bar',
      });
      await localCache2.set({
        key: 'foo',
        value: 'bar',
      });
      const result = await idbGet('expireme-foo');
      expect(result.value).to.equal('bar');
      const result2 = await idbGet('expireme2-foo');
      expect(result2.value).to.equal('bar');
      await promisedSleep(100); // wait until it expires
      await localCache.cleanExpired();
      const result3 = await localCache.get('foo');
      expect(result3).to.equal(undefined);
      const result4 = await localCache2.get('foo');
      expect(result4).to.equal('bar');
    });

    it('cleans on instantiation', async () => {
      const localCache = new LocalCache({
        namespace: 'cleanme',
        defaultTTL: 0.05,
      });
      await localCache.set({
        key: 'foo',
        value: 'bar',
      });
      await promisedSleep(100); // wait until it expires

      // reinstantiate the cache with the same namespace to trigger the clean
      const localCache2 = new LocalCache({
        namespace: 'cleanme',
        defaultTTL: 0.05,
        immediateClean: true,
      });
      const result = await localCache2.get('foo');
      expect(result).to.equal(undefined);
    });

    it('cleans on a schedule', async () => {
      const localCache = new LocalCache({
        namespace: 'cleanme',
        defaultTTL: 0.05,
        immediateClean: false,
        cleaningInterval: 0.1,
      });
      await localCache.set({
        key: 'foo',
        value: 'bar',
      });
      await promisedSleep(150); // wait until the clean interval passes

      const result = await localCache.get('foo');
      expect(result).to.equal(undefined);
      localCache.dispose();
    });

    it('stops cleaning after dispose', async () => {
      const localCache = new LocalCache({
        namespace: 'disposeme',
        defaultTTL: 0.05,
        immediateClean: false,
        cleaningInterval: 0.1,
      });
      localCache.dispose();
      await localCache.set({ key: 'foo', value: 'bar' });
      await promisedSleep(150); // past the expiry and the clean interval

      const result = await idbGet('disposeme-foo');
      expect(result.value).to.equal('bar');
      await localCache.delete('foo');
    });

    it('does not clean a namespace that only shares a prefix', async () => {
      const loan = new LocalCache({ namespace: 'loan', disableCleaning: true });
      await idbSet('loanRenew-foo', {
        value: 'bar',
        expires: new Date(Date.now() - 1000),
      });
      await loan.cleanExpired();

      const result = await idbGet('loanRenew-foo');
      expect(result.value).to.equal('bar');
      await rawDel('loanRenew-foo', cacheStore);
    });

    it('keeps a value set while an expired get is deleting it', async () => {
      const localCache = new LocalCache({
        namespace: 'race',
        disableCleaning: true,
      });
      await localCache.set({ key: 'foo', value: 'old', ttl: 0.05 });
      await promisedSleep(100); // wait until it expires

      const [staleRead] = await Promise.all([
        localCache.get('foo'),
        localCache.set({ key: 'foo', value: 'new' }),
      ]);
      expect(staleRead).to.equal(undefined);
      expect(await localCache.get('foo')).to.equal('new');
      await localCache.delete('foo');
    });

    it('removes its own expired entries from the legacy idb-keyval store', async () => {
      await rawSet('sweepme-foo', {
        value: 'old',
        expires: new Date(Date.now() - 1000),
      });
      await rawSet('sweepme-live', {
        value: 'live',
        expires: new Date(Date.now() + 60_000),
      });
      await rawSet('sweepmeNot-foo', { value: 'other' });

      const localCache = new LocalCache({
        namespace: 'sweepme',
        disableCleaning: true,
        immediateClean: false,
      });
      await localCache.cleanExpired();

      expect(await rawGet('sweepme-foo')).to.equal(undefined);
      expect((await rawGet('sweepme-live')).value).to.equal('live');
      expect((await rawGet('sweepmeNot-foo')).value).to.equal('other');
      await rawDel('sweepme-live');
      await rawDel('sweepmeNot-foo');
    });

    it('does nothing without IndexedDB', async () => {
      const globals = window as unknown as Record<string, unknown>;
      const saved = {
        indexedDB: globals.indexedDB,
        IDBKeyRange: globals.IDBKeyRange,
      };
      Object.defineProperty(window, 'indexedDB', {
        value: undefined,
        configurable: true,
      });
      Object.defineProperty(window, 'IDBKeyRange', {
        value: undefined,
        configurable: true,
      });
      try {
        const localCache = new LocalCache({
          namespace: 'noidb',
          disableCleaning: true,
          immediateClean: false,
        });
        await localCache.cleanExpired();
        await localCache.set({ key: 'foo', value: 'bar' });
        expect(await localCache.get('foo')).to.equal(undefined);
      } finally {
        Object.defineProperty(window, 'indexedDB', {
          value: saved.indexedDB,
          configurable: true,
        });
        Object.defineProperty(window, 'IDBKeyRange', {
          value: saved.IDBKeyRange,
          configurable: true,
        });
      }
    });
  });
});
