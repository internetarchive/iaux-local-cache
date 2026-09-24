# Internet Archive Local Cache

A browser-based cache to store, retrieve, and expire key-value pairs. Built on IndexedDB.

## Installation
```bash
yarn add @internetarchive/local-cache
```

## Usage

```js
import { LocalCache } from '@internetarchive/local-cache';

const localCache = new LocalCache();

// set a value
await localCache.set({
  key: 'foo',
  value: 'bar',
  ttl: 10 // in seconds
})

// get a value
let cachedValue = await localCache.get('foo');
console.debug(cachedValue) // 'bar'

// delete a value
await localCache.delete('foo');

cachedValue = await localCache.get('foo');
console.debug(cachedValue) // undefined
```

## Advanced Usage

### Customize the namespace and default TTL
```js
const localCache = new LocalCache({
  namespace: 'MyCustomNamespace',
  defaultTTL: 30 * 60  // 30 minutes
});
```

### Entries that never expire
```js
await localCache.set({ key: 'foo', value: 'bar', ttl: Infinity });
```

### Cleaning
Expired entries are removed when you `get` them, and every namespace is cleaned once on creation and then every 60 seconds.

```js
const localCache = new LocalCache({
  cleaningInterval: 5 * 60, // clean every 5 minutes
  immediateClean: false,    // skip the clean on creation
  disableCleaning: true,    // or turn periodic cleaning off entirely
});

// stop periodic cleaning, e.g. when the owning component disconnects
localCache.dispose();
```

### Storage
Entries live in their own IndexedDB database (`LocalCache`, store `entries`), with keys prefixed by namespace. On its first clean, each cache also removes its namespace's expired entries from idb-keyval's default `keyval-store` database, where versions before 1.0 kept them. Unexpired ones stay put so a pre-1.0 cache on the same site keeps working.

If IndexedDB isn't available (e.g. Firefox private browsing), every call quietly does nothing and `get` returns `undefined`.

## Local Demo with `web-dev-server`
```bash
yarn start
```
To run a local development server that serves the basic demo located in `demo/index.html`

## Testing with Web Test Runner
To run the suite of Web Test Runner tests, run
```bash
yarn run test
```

To run the tests in watch mode (for &lt;abbr title=&#34;test driven development&#34;&gt;TDD&lt;/abbr&gt;, for example), run

```bash
yarn run test:watch
```

## Linting with ESLint, Prettier, and Types
To scan the project for linting errors, run
```bash
yarn run lint
```

To automatically fix many linting errors, run
```bash
yarn run format
```
