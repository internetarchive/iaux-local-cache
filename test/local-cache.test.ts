import { expect } from '@open-wc/testing';
import { get as idbGet } from 'idb-keyval';
import { addSeconds } from '../src/add-seconds';
import { LocalCache } from '../src/local-cache';
import { promisedSleep } from './promisedSleep';

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
    });
  });
});
